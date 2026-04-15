import { chromium } from 'playwright';

const LOGIN_URL     = 'https://adamasknowledgecity.ac.in/student/login';
const DASHBOARD_URL = 'https://adamasknowledgecity.ac.in/student/dashboard';

const DELAY_AFTER_SUBMIT_MS = 4000;
const DELAY_AFTER_NAV_MS    = 2500;
const DELAY_AFTER_ERROR_MS  = 3000;
const MAX_SUBJECT_FAILURES  = 4;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gotoSafe(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await sleep(DELAY_AFTER_NAV_MS);
}

async function fillAndSubmitForm(page) {
  if (!page.url().includes('give-feedback')) {
    throw new Error(`Not on feedback page — at: ${page.url()}`);
  }

  await page.waitForSelector('form', { timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await sleep(500);

  const radioResult = await page.evaluate(() => {
    const yesRadios = document.querySelectorAll('input[type="radio"][value="y"]');
    if (yesRadios.length > 0) {
      yesRadios.forEach(r => { r.scrollIntoView({ block: 'center' }); r.click(); });
      return { method: 'yes-value', count: yesRadios.length };
    }
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

  await sleep(200);

  await page.evaluate(() => {
    document.querySelectorAll('input[type="range"]').forEach(s => {
      s.value = s.max || '5';
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  const submitSel = 'button[type="submit"], button.btn-primary, input[type="submit"]';
  await page.waitForSelector(submitSel, { timeout: 10000 });
  await page.evaluate(sel => {
    const btn = document.querySelector(sel);
    if (btn) btn.scrollIntoView({ block: 'center' });
  }, submitSel);
  await sleep(400);
  await page.click(submitSel, { timeout: 10000 });
  await sleep(DELAY_AFTER_SUBMIT_MS);
  return { radioCount: radioResult.count };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT 1: Login + scan all subjects with their pending counts
// ─────────────────────────────────────────────────────────────────────────────
export async function loginAndScan({ studentId, password, headless = false, onStatus = () => {} }) {
  onStatus('Launching browser...');
  const browser = await chromium.launch({ headless, slowMo: 20 });
  const context = await browser.newContext();
  const page    = await context.newPage();

  onStatus('Loading login page...');
  await gotoSafe(page, LOGIN_URL);

  onStatus('Filling credentials...');
  await page.locator('input[type="text"], input[name*="user"], input[name*="email"], input[name*="roll"], input[name*="id"]')
            .first().fill(studentId);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign In")')
            .first().click();

  await page.waitForLoadState('load');
  await sleep(3000);

  if (page.url().includes('login')) {
    await browser.close();
    throw new Error('Login failed — please check your Student ID and Password');
  }

  if (!page.url().includes('dashboard')) {
    await gotoSafe(page, DASHBOARD_URL);
  }

  onStatus('Scanning pending subjects...');
  await page.waitForSelector('.subject-item-modern', { timeout: 15000 });
  await sleep(1000);

  const subjects = await page.evaluate(() => {
    const items = document.querySelectorAll('.subject-item-modern');
    return Array.from(items).map(item => {
      const nameEl = item.querySelector('.subject-name, h6, h5, strong');
      const name = nameEl ? nameEl.innerText.trim() : 'Unknown Subject';
      const text = item.innerText || '';
      const m = text.match(/(\d+)\/(\d+)\s*completed/i);
      return {
        name,
        done:  m ? parseInt(m[1]) : 0,
        total: m ? parseInt(m[2]) : 0,
      };
    });
  });

  return { browser, page, subjects };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT 2: Run all pending submissions, firing onEvent throughout
// ─────────────────────────────────────────────────────────────────────────────
export async function runSubmissions({ browser, page, onEvent = () => {} }) {
  let totalSuccess = 0;
  let totalFailed  = 0;
  const subjectFailCount = {};
  const skippedSubjects  = new Set();

  const giveBtnSel =
    'button.give-feedback-btn, ' +
    '#subjectFeedbackModal a[href*="give-feedback"], ' +
    '.modal button:has-text("Give Feedback"), ' +
    'a[href*="give-feedback"]';

  for (let outerPass = 1; outerPass <= 300; outerPass++) {
    onEvent({ type: 'pass', n: outerPass });

    await gotoSafe(page, DASHBOARD_URL);
    try {
      await page.waitForSelector('.subject-item-modern', { timeout: 12000 });
      await sleep(800);
    } catch (_) { break; }

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
        if (skippedList.includes(baseName)) continue;
        item.click();
        return { baseName, done, total };
      }
      let remaining = 0;
      items.forEach(item => {
        const m = (item.innerText || '').match(/(\d+)\/(\d+)\s*completed/i);
        if (m && parseInt(m[1]) < parseInt(m[2])) remaining++;
      });
      return { baseName: null, remaining };
    }, [...skippedSubjects]);

    if (!subjectResult.baseName) break;

    const { baseName, done, total } = subjectResult;
    onEvent({ type: 'subject_start', name: baseName, done, total });
    await sleep(2000);

    let subjectSuccess = 0;
    let subjectFailed  = 0;

    for (let inner = 1; inner <= 300; inner++) {
      const btnCount = await page.locator(giveBtnSel).count();
      if (btnCount === 0) {
        onEvent({ type: 'subject_done', name: baseName, submitted: subjectSuccess, failed: subjectFailed });
        subjectFailCount[baseName] = 0;
        break;
      }

      let date = '';
      try {
        const href = await page.locator(giveBtnSel).first().getAttribute('href');
        if (href) {
          const u = new URL(href, page.url());
          date = u.searchParams.get('attendDate') || '';
        }
      } catch (_) {}

      onEvent({ type: 'feedback_start', n: inner, subject: baseName, date });

      try {
        const href = await page.locator(giveBtnSel).first().getAttribute('href').catch(() => null);
        if (href && href.includes('give-feedback')) {
          await gotoSafe(page, href.startsWith('http') ? href : `https://adamasknowledgecity.ac.in${href}`);
        } else {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }),
            page.locator(giveBtnSel).first().click(),
          ]);
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          await sleep(DELAY_AFTER_NAV_MS);
        }

        if (!page.url().includes('give-feedback')) {
          throw new Error(`Redirected away: ${page.url()}`);
        }

        await fillAndSubmitForm(page);
        totalSuccess++;
        subjectSuccess++;
        subjectFailCount[baseName] = 0;
        onEvent({ type: 'feedback_success', n: inner, subject: baseName, date, totalSuccess });

        await gotoSafe(page, DASHBOARD_URL);
        await page.waitForSelector('.subject-item-modern', { timeout: 10000 }).catch(() => {});
        await sleep(800);

        const reopened = await page.evaluate(name => {
          for (const item of document.querySelectorAll('.subject-item-modern')) {
            const el = item.querySelector('h6, h5, strong, .subject-name');
            if (el && el.innerText.trim() === name) { item.click(); return true; }
          }
          return false;
        }, baseName);

        if (!reopened) break;
        await sleep(2000);

      } catch (err) {
        totalFailed++;
        subjectFailed++;
        const errMsg = err.message.split('\n')[0].substring(0, 100);
        subjectFailCount[baseName] = (subjectFailCount[baseName] || 0) + 1;
        const streak = subjectFailCount[baseName];

        onEvent({ type: 'feedback_fail', n: inner, subject: baseName, error: errMsg, streak });

        if (streak >= MAX_SUBJECT_FAILURES) {
          onEvent({ type: 'subject_skip', name: baseName });
          skippedSubjects.add(baseName);
          await sleep(1000);
          break;
        }

        await sleep(DELAY_AFTER_ERROR_MS);
        await gotoSafe(page, DASHBOARD_URL);
        await page.waitForSelector('.subject-item-modern', { timeout: 10000 }).catch(() => {});
        await sleep(800);

        const reopened = await page.evaluate(name => {
          for (const item of document.querySelectorAll('.subject-item-modern')) {
            const el = item.querySelector('h6, h5, strong, .subject-name');
            if (el && el.innerText.trim() === name) { item.click(); return true; }
          }
          return false;
        }, baseName);

        if (!reopened) break;
        await sleep(2000);
      }
    }
  }

  onEvent({ type: 'all_done', totalSuccess, totalFailed, skipped: [...skippedSubjects] });
  return { totalSuccess, totalFailed, skipped: [...skippedSubjects] };
}
