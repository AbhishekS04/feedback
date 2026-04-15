const { chromium } = require('playwright');

// ==================== CONFIG ====================
const LOGIN_URL     = 'https://adamasknowledgecity.ac.in/student/login';
const DASHBOARD_URL = 'https://adamasknowledgecity.ac.in/student/dashboard';

// ⚠️  Run   node cli.js   instead — it prompts for credentials securely.
// This file is kept as reference only and will not work without credentials.
console.error('\n  ⚠️  Please run:  node cli.js\n');
process.exit(1);

// Rate-limit config — increase if you keep getting redirected away
const DELAY_AFTER_SUBMIT_MS = 4000;   // wait after each form submit
const DELAY_BETWEEN_PASS_MS = 2000;   // wait before re-scanning dashboard
const DELAY_AFTER_NAV_MS    = 2500;   // wait after page navigation
const DELAY_AFTER_ERROR_MS  = 3000;   // wait after a failure before retry

// Subject skip threshold
const MAX_SUBJECT_FAILURES  = 4;      // skip subject after N consecutive fails
// ================================================

/** Sleep helper */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Navigate to a URL and wait for the page to be fully idle */
async function gotoSafe(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Wait for network to go quiet (no more than 2 inflight requests for 500ms)
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await sleep(DELAY_AFTER_NAV_MS);
}

/**
 * Try to fill and submit one feedback form page.
 * Returns true on success, throws on failure.
 */
async function fillAndSubmitForm(page) {
  // Make sure we are actually on the feedback page
  if (!page.url().includes('give-feedback')) {
    throw new Error(`Not on feedback page — at: ${page.url()}`);
  }

  // Wait for the form to be present and fully rendered
  await page.waitForSelector('form', { timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await sleep(500);

  // ── 1. Fill radio buttons using in-page evaluate (avoids stale-element issues) ──
  const radioResult = await page.evaluate(() => {
    // Prefer value="y" radios
    const yesRadios = document.querySelectorAll('input[type="radio"][value="y"]');
    if (yesRadios.length > 0) {
      yesRadios.forEach(r => {
        r.scrollIntoView({ block: 'center' });
        r.click();
      });
      return { method: 'yes-value', count: yesRadios.length };
    }
    // Fallback: click first radio in every named group
    const allRadios = document.querySelectorAll('input[type="radio"]');
    const used = new Set();
    let count = 0;
    allRadios.forEach(r => {
      if (!used.has(r.name)) {
        used.add(r.name);
        r.scrollIntoView({ block: 'center' });
        r.click();
        count++;
      }
    });
    return { method: 'first-in-group', count };
  });

  console.log(`   ☑️  Radios: ${radioResult.count} clicked (${radioResult.method})`);
  await sleep(200);

  // ── 2. Set all sliders to their max value ──
  const sliderResult = await page.evaluate(() => {
    const sliders = document.querySelectorAll('input[type="range"]');
    sliders.forEach(s => {
      s.value = s.max || '5';
      s.dispatchEvent(new Event('input',  { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return sliders.length;
  });
  if (sliderResult > 0) console.log(`   🎚️  Set ${sliderResult} slider(s) to max`);

  // ── 3. Locate submit button (fresh, not stale) ──
  const submitSel = 'button[type="submit"], button.btn-primary, input[type="submit"]';
  await page.waitForSelector(submitSel, { timeout: 10000 });

  // Scroll into view via evaluate (avoids Playwright scrollIntoViewIfNeeded timeout)
  await page.evaluate((sel) => {
    const btn = document.querySelector(sel);
    if (btn) btn.scrollIntoView({ block: 'center' });
  }, submitSel);
  await sleep(400);

  // Click the submit button
  await page.click(submitSel, { timeout: 10000 });

  // ── 4. Wait for server to process (rate-limit buffer) ──
  await sleep(DELAY_AFTER_SUBMIT_MS);

  // Make sure we are no longer on the give-feedback page (success redirect)
  // Some sites redirect to dashboard, some show a success flash — both are fine.
  // If still on the same give-feedback URL after delay it likely means it didn't submit.
  return true;
}

// ============================================================
// MAIN
// ============================================================
(async () => {
  console.log('🚀 Launching Chromium...');
  const browser = await chromium.launch({ headless: false, slowMo: 20 });
  const context = await browser.newContext();
  const page    = await context.newPage();

  // ── Login ──
  console.log('\n🔐 Logging in automatically...');
  await gotoSafe(page, LOGIN_URL);

  await page.locator('input[type="text"], input[name*="user"], input[name*="email"], input[name*="roll"], input[name*="id"]')
            .first().fill(STUDENT_ID);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign In")')
            .first().click();

  await page.waitForLoadState('load');
  await sleep(3000);

  if (page.url().includes('login')) {
    console.log('❌ Login failed! Current URL:', page.url());
    await browser.close();
    return;
  }
  if (!page.url().includes('dashboard')) {
    await gotoSafe(page, DASHBOARD_URL);
  }
  console.log('✅ Logged in! Dashboard:', page.url());

  // ── State tracking ──
  let totalSuccess = 0;
  let totalFailed  = 0;
  const subjectFailCount = {};   // { baseName: consecutiveFailures }
  const skippedSubjects  = new Set();

  // ── Outer loop: one pass per pending subject ──
  for (let outerPass = 1; outerPass <= 300; outerPass++) {
    console.log(`\n--- Pass ${outerPass}: Scanning dashboard for pending subjects ---`);
    if (skippedSubjects.size > 0) {
      console.log(`   ⏭️  Permanently skipped: ${[...skippedSubjects].join(', ')}`);
    }

    // Navigate to dashboard fresh each outer pass
    await gotoSafe(page, DASHBOARD_URL);

    // Wait for subject cards
    try {
      await page.waitForSelector('.subject-item-modern', { timeout: 12000 });
      await sleep(800);
    } catch (_) {
      console.log('⚠️  Subject cards not found. Saving screenshot...');
      await page.screenshot({ path: 'debug-dashboard.png', fullPage: true });
      break;
    }

    // Find the next incomplete subject (excluding skipped ones)
    const subjectResult = await page.evaluate((skippedList) => {
      const items = document.querySelectorAll('.subject-item-modern');
      for (const item of items) {
        const text = item.innerText || '';
        const m = text.match(/(\d+)\/(\d+)\s*completed/i);
        if (!m) continue;
        const done = parseInt(m[1]), total = parseInt(m[2]);
        if (done >= total) continue;

        const nameEl = item.querySelector('.subject-name, h6, h5, strong');
        const baseName = (nameEl ? nameEl.innerText : text).trim().substring(0, 80);

        if (skippedList.includes(baseName)) continue; // skip permanently

        item.click();
        return { label: `${baseName} (${done}/${total})`, baseName, done, total };
      }
      // Count how many are still pending (for informative message)
      let remainingPending = 0;
      items.forEach(item => {
        const text = item.innerText || '';
        const m = text.match(/(\d+)\/(\d+)\s*completed/i);
        if (m && parseInt(m[1]) < parseInt(m[2])) remainingPending++;
      });
      return { label: null, baseName: null, remainingPending };
    }, [...skippedSubjects]);

    if (!subjectResult.label) {
      if (subjectResult.remainingPending > 0) {
        console.log(`\n⚠️  ${subjectResult.remainingPending} subject(s) still pending but all are in the skip list.`);
      } else {
        console.log('\n🎉 All subjects completed!');
      }
      break;
    }

    const { label: subjectLabel, baseName } = subjectResult;
    console.log(`📚 Opened modal for: ${subjectLabel}`);
    await sleep(2000); // let the modal animate in

    // ── Inner loop: click every "Give Feedback" row in this subject's modal ──
    for (let inner = 1; inner <= 300; inner++) {
      // Fresh locator each iteration — avoids stale element
      const giveBtnSel =
        'button.give-feedback-btn, ' +
        '#subjectFeedbackModal a[href*="give-feedback"], ' +
        '.modal button:has-text("Give Feedback"), ' +
        'a[href*="give-feedback"]';

      const btnCount = await page.locator(giveBtnSel).count();
      if (btnCount === 0) {
        console.log(`   ✅ No more "Give Feedback" buttons (${inner - 1} processed). Moving to next subject.`);
        subjectFailCount[baseName] = 0; // reset on clean exit
        break;
      }

      // Read button label for logging
      let logLabel = `Feedback #${inner}`;
      try {
        const href = await page.locator(giveBtnSel).first().getAttribute('href');
        if (href) {
          const u = new URL(href, page.url());
          const sub  = u.searchParams.get('subjectName') || baseName;
          const date = u.searchParams.get('attendDate')  || '?';
          logLabel = `${sub} | ${date}`;
        } else {
          logLabel = `Feedback #${inner} (button click)`;
        }
      } catch (_) {}

      console.log(`\n   📝 [${inner}] ${logLabel}`);

      try {
        // ── Navigate to feedback form ──
        const href = await page.locator(giveBtnSel).first().getAttribute('href').catch(() => null);
        if (href && href.includes('give-feedback')) {
          await gotoSafe(page, href.startsWith('http') ? href : `https://adamasknowledgecity.ac.in${href}`);
        } else {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }),
            page.locator(giveBtnSel).first().click()
          ]);
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          await sleep(DELAY_AFTER_NAV_MS);
        }

        // Verify we landed on the correct page
        if (!page.url().includes('give-feedback')) {
          throw new Error(`Redirected away: ${page.url()}`);
        }

        // ── Fill and submit ──
        await fillAndSubmitForm(page);

        totalSuccess++;
        subjectFailCount[baseName] = 0; // reset streak
        console.log(`   ✅ Submitted! Total: ${totalSuccess}`);

        // ── Return to dashboard and re-open the same subject modal ──
        await gotoSafe(page, DASHBOARD_URL);
        await page.waitForSelector('.subject-item-modern', { timeout: 10000 }).catch(() => {});
        await sleep(800);

        const reopened = await page.evaluate((name) => {
          for (const item of document.querySelectorAll('.subject-item-modern')) {
            const nameEl = item.querySelector('h6, h5, strong, .subject-name');
            if (nameEl && nameEl.innerText.trim() === name) {
              item.click();
              return true;
            }
          }
          return false;
        }, baseName);

        if (!reopened) {
          console.log(`   ⚠️  Could not re-open modal for "${baseName}". Re-scanning dashboard.`);
          break; // outer loop will re-scan
        }
        await sleep(2000); // modal animation

      } catch (err) {
        totalFailed++;
        const msg = err.message.split('\n')[0].substring(0, 140);
        console.log(`   ❌ Failed: ${msg}`);

        // Increment consecutive failure counter
        subjectFailCount[baseName] = (subjectFailCount[baseName] || 0) + 1;
        const streak = subjectFailCount[baseName];
        console.log(`   ⚠️  "${baseName}" failure streak: ${streak}/${MAX_SUBJECT_FAILURES}`);

        if (streak >= MAX_SUBJECT_FAILURES) {
          console.log(`   ⏭️  Skipping "${baseName}" permanently after ${MAX_SUBJECT_FAILURES} consecutive failures.`);
          skippedSubjects.add(baseName);
          await sleep(1000);
          break; // exit inner loop → outer loop picks next subject
        }

        // Brief pause before retry (respect server rate limit)
        await sleep(DELAY_AFTER_ERROR_MS);

        // Navigate back to dashboard and try to re-open the modal
        await gotoSafe(page, DASHBOARD_URL);
        await page.waitForSelector('.subject-item-modern', { timeout: 10000 }).catch(() => {});
        await sleep(800);

        const reopened = await page.evaluate((name) => {
          for (const item of document.querySelectorAll('.subject-item-modern')) {
            const nameEl = item.querySelector('h6, h5, strong, .subject-name');
            if (nameEl && nameEl.innerText.trim() === name) {
              item.click();
              return true;
            }
          }
          return false;
        }, baseName);

        if (!reopened) {
          console.log(`   ⚠️  Could not re-open modal after error. Re-scanning dashboard.`);
          break;
        }
        await sleep(2000);
      }
    } // end inner loop
  } // end outer loop

  // ── Final summary ──
  console.log('\n\n══════════════════════════════════════════');
  console.log(`🏁  DONE!`);
  console.log(`   ✅ ${totalSuccess} form(s) submitted successfully`);
  console.log(`   ❌ ${totalFailed} form(s) failed`);
  if (skippedSubjects.size > 0) {
    console.log(`   ⏭️  ${skippedSubjects.size} subject(s) skipped: ${[...skippedSubjects].join(', ')}`);
  }
  console.log('══════════════════════════════════════════\n');

  await browser.close();
})();
