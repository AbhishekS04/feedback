import { chromium } from 'playwright';
import os from 'os';
import { execSync } from 'child_process';

const LOGIN_URL     = 'https://adamasknowledgecity.ac.in/student/login';
const DASHBOARD_URL = 'https://adamasknowledgecity.ac.in/student/dashboard';

const DELAY_AFTER_SUBMIT_MS = 4000;
const DELAY_AFTER_NAV_MS    = 2500;
const DELAY_AFTER_ERROR_MS  = 3000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gotoSafe(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await sleep(DELAY_AFTER_NAV_MS);
}

async function fillAndSubmitForm(page, vibe = 'good') {
  if (!page.url().includes('give-feedback')) {
    throw new Error(`Not on feedback page — at: ${page.url()}`);
  }

  await page.waitForSelector('form', { timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await sleep(500);

  const radioResult = await page.evaluate((currentVibe) => {
    let method = 'none';
    let count = 0;
    
    // Group radios by name for logical selection
    const allRadios = Array.from(document.querySelectorAll('input[type="radio"]'));
    const groups = {};
    allRadios.forEach(r => {
        if (!groups[r.name]) groups[r.name] = [];
        groups[r.name].push(r);
    });

    for (const name in groups) {
        const group = groups[name];
        if (group.length === 0) continue;
        
        let targetIndex = 0;
        if (currentVibe === 'good') {
            const y = group.findIndex(r => r.value.toLowerCase() === 'y');
            targetIndex = y >= 0 ? y : 0;
        } else if (currentVibe === 'neutral') {
            targetIndex = Math.floor(group.length / 2);
        } else if (currentVibe === 'bad') {
            const n = group.findIndex(r => r.value.toLowerCase() === 'n');
            targetIndex = n >= 0 ? n : group.length - 1;
        }

        const target = group[targetIndex];
        if (target) {
            target.scrollIntoView({ block: 'center' });
            target.click();
            count++;
        }
    }
    
    if (count > 0) method = 'vibe-group';
    return { method, count };
  }, vibe);

  await sleep(200);

  await page.evaluate((currentVibe) => {
    document.querySelectorAll('input[type="range"]').forEach(s => {
      let max = parseInt(s.max) || 5;
      let min = parseInt(s.min) || 1;
      let val = max;
      if (currentVibe === 'neutral') val = Math.floor((max + min) / 2);
      if (currentVibe === 'bad') val = min;
      
      s.value = val;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, vibe);

  // Mandatory Smart Comments (only active on 'required' text fields)
  await page.evaluate(() => {
    const comments = [
        "The lectures were extremely helpful and detailed.",
        "Good teaching methodology.",
        "Clear explanations. No specific suggestions.",
        "The pacing of the course was perfect.",
        "Great interactions with students."
    ];
    document.querySelectorAll('textarea, input[type="text"]').forEach(el => {
        if (el.required || el.getAttribute('required') !== null || el.classList.contains('required')) {
            el.value = comments[Math.floor(Math.random() * comments.length)];
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
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
  const launchOptions = { headless, slowMo: 20 };
  
  if (os.platform() === 'android') {
    try {
      launchOptions.executablePath = execSync('which chromium').toString().trim();
    } catch (e) {
      launchOptions.executablePath = '/data/data/com.termux/files/usr/bin/chromium';
    }
  }

  const browser = await chromium.launch(launchOptions);
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
export async function runSubmissions({ browser, page, vibe = 'good', onEvent = () => {} }) {
  let totalSuccess = 0;
  let totalFailed  = 0;
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
    let skippedFeedbacksThisSubject = new Set();

    for (let inner = 1; inner <= 300; inner++) {
      const btnCount = await page.locator(giveBtnSel).count();
      
      let btnIndex = -1;
      let targetHref = null;
      for (let i = 0; i < btnCount; i++) {
        const href = await page.locator(giveBtnSel).nth(i).getAttribute('href').catch(() => null);
        if (href) {
          if (!skippedFeedbacksThisSubject.has(href)) {
            btnIndex = i;
            targetHref = href;
            break;
          }
        } else {
          if (!skippedFeedbacksThisSubject.has(`index_${i}`)) {
            btnIndex = i;
            targetHref = `index_${i}`;
            break;
          }
        }
      }

      if (btnIndex === -1) {
        onEvent({ type: 'subject_done', name: baseName, submitted: subjectSuccess, failed: subjectFailed });
        break;
      }

      let date = '';
      try {
        if (targetHref && !targetHref.startsWith('index_')) {
          const u = new URL(targetHref, page.url());
          date = u.searchParams.get('attendDate') || '';
        }
      } catch (_) {}

      onEvent({ type: 'feedback_start', n: inner, subject: baseName, date });

      try {
        if (targetHref && !targetHref.startsWith('index_') && targetHref.includes('give-feedback')) {
          await gotoSafe(page, targetHref.startsWith('http') ? targetHref : `https://adamasknowledgecity.ac.in${targetHref}`);
        } else {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }),
            page.locator(giveBtnSel).nth(btnIndex).click(),
          ]);
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          await sleep(DELAY_AFTER_NAV_MS);
        }

        if (!page.url().includes('give-feedback')) {
          throw new Error(`Redirected away: ${page.url()}`);
        }
        const currentVibe = typeof vibe === 'object' ? (vibe[baseName] || 'good') : vibe;
        await fillAndSubmitForm(page, currentVibe);
        totalSuccess++;
        subjectSuccess++;
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
        skippedFeedbacksThisSubject.add(targetHref);

        onEvent({ type: 'feedback_fail', n: inner, subject: baseName, error: errMsg, streak: 1 });

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
    
    // Ensure we don't revisit this subject in the outer loop
    skippedSubjects.add(baseName);
  }

  onEvent({ type: 'all_done', totalSuccess, totalFailed, skipped: [...skippedSubjects] });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT 3: Force Sync Attendance (Bypass Time Locks)
// ─────────────────────────────────────────────────────────────────────────────
export async function forceSyncAttendance({ studentId, password, headless = false, onStatus = () => {} }) {
  const launchOptions = { headless, slowMo: 20 };
  
  if (os.platform() === 'android') {
    try {
      launchOptions.executablePath = execSync('which chromium').toString().trim();
    } catch (e) {
      launchOptions.executablePath = '/data/data/com.termux/files/usr/bin/chromium';
    }
  }

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext();
  const page    = await context.newPage();

  onStatus('Logging in for Attendance Sync...');
  await gotoSafe(page, LOGIN_URL);

  await page.locator('input[type="text"], input[name*="user"], input[name*="email"], input[name*="roll"], input[name*="id"]')
            .first().fill(studentId);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign In")')
            .first().click();

  await page.waitForLoadState('load');
  await sleep(3000);

  if (page.url().includes('login')) {
    await browser.close();
    throw new Error('Login failed during attendance sync.');
  }

  // Navigate to attendance page
  onStatus('Navigating to Biometric Attendance...');
  const ATTENDANCE_URL = 'https://adamasknowledgecity.ac.in/student/attendance';
  await gotoSafe(page, ATTENDANCE_URL);

  onStatus('Injecting bypass script into DOM...');
  
  // Strip all 'disabled' and 'hidden' classes/attributes from anything inside the attendance table
  const foundButtonsCount = await page.evaluate(() => {
    // Specifically target the exact refresh buttons from the UI payload
    // They usually have classes like btn-refresh, refreshAttendance, or icons like fa-refresh
    const refreshButtons = document.querySelectorAll('button, a, input');
    let unlocked = 0;
    
    for (const btn of refreshButtons) {
      const text = (btn.innerText || btn.title || btn.className || '').toLowerCase();
      // If it looks like a refresh button from the attendance payload
      if (text.includes('refresh') || text.includes('sync') || btn.querySelector('.fa-refresh, .fa-sync')) {
        btn.removeAttribute('disabled');
        btn.style.display = 'inline-block';
        btn.style.visibility = 'visible';
        btn.style.opacity = '1';
        btn.classList.remove('disabled');
        
        // Find ancestor rows and un-hide them if they were hidden
        let parent = btn.parentElement;
        while(parent && parent.tagName !== 'BODY') {
            if(parent.style.display === 'none') parent.style.display = 'block';
            parent = parent.parentElement;
        }
        
        unlocked++;
      }
    }
    return unlocked;
  });

  const logs = [];
  logs.push(`Unlocked ${foundButtonsCount} hidden/disabled refresh buttons via DOM injection.`);

  if (foundButtonsCount === 0) {
     logs.push('Could not find any refresh buttons on the page. They might be rendered dynamically later.');
     return { browser, page, logs };
  }

  onStatus(`Executing ${foundButtonsCount} brutal click(s)...`);
  
  // Set up network interceptor to tally 200 OKs vs 500 Errors
  let successCount = 0;
  let failCount = 0;

  page.on('response', resp => {
    if (resp.url().includes('update-biometric') || resp.url().includes('refreshAttendanceStatus')) {
      if (resp.status() >= 200 && resp.status() < 300) {
        successCount++;
      } else {
        failCount++;
      }
    }
  });

  // Let's actually execute the clicks
  // We click everything that we targeted above
  await page.evaluate(() => {
    const refreshButtons = document.querySelectorAll('button, a, input');
    for (const btn of refreshButtons) {
      const text = (btn.innerText || btn.title || btn.className || '').toLowerCase();
      if (text.includes('refresh') || text.includes('sync') || btn.querySelector('.fa-refresh, .fa-sync')) {
        try { btn.click(); } catch(e){}
      }
    }
  });

  onStatus('Awaiting server responses from Adamas backend...');
  await sleep(7000); // Give the 500 errors and 200 OKs time to resolve

  logs.push(`Network Intersect Result: ${successCount} Successful Syncs | ${failCount} Failed (Server Errors)`);
  
  return { browser, page, logs };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT 4: Fetch Attendance Data
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchAttendanceStats({ studentId, password, headless = false, onStatus = () => {} }) {
  const launchOptions = { headless, slowMo: 20 };
  
  if (os.platform() === 'android') {
    try {
      launchOptions.executablePath = execSync('which chromium').toString().trim();
    } catch (e) {
      launchOptions.executablePath = '/data/data/com.termux/files/usr/bin/chromium';
    }
  }

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext();
  const page    = await context.newPage();

  onStatus('Logging in for Attendance Check...');
  await gotoSafe(page, LOGIN_URL);

  await page.locator('input[type="text"], input[name*="user"], input[name*="email"], input[name*="roll"], input[name*="id"]')
            .first().fill(studentId);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign In")')
            .first().click();

  await page.waitForLoadState('load');
  await sleep(3000);

  if (page.url().includes('login')) {
    await browser.close();
    throw new Error('Login failed during attendance check.');
  }

  onStatus('Navigating to Biometric Attendance...');
  const ATTENDANCE_URL = 'https://adamasknowledgecity.ac.in/student/attendance';
  await gotoSafe(page, ATTENDANCE_URL);

  onStatus('Extracting records...');
  await page.waitForSelector('table', { timeout: 15000 }).catch(() => {});
  await sleep(1000);

  const tableData = await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    let targetTable = null;
    for (const t of tables) {
        if (t.innerText.toLowerCase().includes('courses') && t.innerText.toLowerCase().includes('total present')) {
            targetTable = t;
            break;
        }
    }
    
    if (!targetTable) return [];

    const rows = Array.from(targetTable.querySelectorAll('tbody tr'));
    return rows.map(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 5) {
            return {
                course: tds[0].innerText.trim(),
                totalClasses: parseInt(tds[1].innerText.trim(), 10) || 0,
                totalPresent: parseInt(tds[2].innerText.trim(), 10) || 0,
                totalAbsent: parseInt(tds[3].innerText.trim(), 10) || 0,
                percentage: parseFloat(tds[4].innerText.replace('%', '').trim()) || 0
            };
        }
        return null;
    }).filter(r => r !== null && r.course);
  });

  return { browser, page, data: tableData };
}
