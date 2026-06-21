#!/usr/bin/env node
import chalk from 'chalk';
import ora from 'ora';
import gradient from 'gradient-string';
import figlet from 'figlet';
import * as p from '@clack/prompts';
import os from 'os';
import { loginAndScan, runSubmissions, forceSyncAttendance, fetchAttendanceStats } from './bot.js';
import fs from 'fs';
import path from 'path';

const pkgInfo = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url)));
const cliVersion = pkgInfo.version;

const helpMode = process.argv.includes('--help') || process.argv.includes('-h');
if (helpMode) {
  console.log(chalk.cyan.bold('\n◆ feedback-au ') + chalk.dim(`v${cliVersion}`));
  console.log(chalk.white('\nUsage: ') + chalk.yellow('npx feedback-au [options]'));
  
  console.log(chalk.white.bold('\nOptions:'));
  console.log(`  ${chalk.cyan('--watch')}        Run the browser visibly (headed mode)`);
  console.log(`  ${chalk.cyan('--sync')}         Force-sync the biometric attendance logs bypass`);
  console.log(`  ${chalk.cyan('--attendance')}   Check attendance stats and 75% calculations`);
  console.log(`  ${chalk.cyan('--leaderboard')}  View global cowboy rankings and stats`);
  console.log(`  ${chalk.cyan('--status')}       View your lifetime stats graphical dashboard`);
  console.log(`  ${chalk.cyan('--help, -h')}     Show this help message\n`);
  process.exit(0);
}

// Flags
const isWatchMode = process.argv.includes('--watch') || process.argv.includes('--show');
const headlessMode = !isWatchMode;
const isAnalyticsMode = process.argv.includes('--status');
const isSyncMode = process.argv.includes('--sync');
const isAttendanceMode = process.argv.includes('--attendance') || process.argv.includes('-a');
const isLeaderboardMode = process.argv.includes('--leaderboard') || process.argv.includes('-l');

const statsPath = path.join(os.homedir(), '.feedback-au-stats.json');
const credPath = path.join(os.homedir(), '.feedback-au-credentials.json');

// ── Utils ─────────────────────────────────────────────────────────────────────
const figletAsync = (text, opts) =>
  new Promise((res, rej) =>
    figlet.text(text, opts, (err, out) => (err ? rej(err) : res(out)))
  );

const stripAnsi = s => s.replace(/\x1B\[[0-9;]*m/g, '');
const pad = (str, len) => str + ' '.repeat(Math.max(0, len - stripAnsi(str).length));

function progressBar(done, total, width = 20) {
  const pct = total > 0 ? done / total : 0;
  const filled = Math.round(pct * width);
  return chalk.cyan('█'.repeat(filled)) + chalk.dim('░'.repeat(width - filled));
}
const percent = (d, t) => (t > 0 ? Math.round((d / t) * 100) : 0);

function loadStats() {
  let ds = { totalSubmitted: 0, totalRuns: 0, vibes: { good: 0, neutral: 0, bad: 0 }, averageAttendance: 0, alias: '', leaderboardDiscovered: false };
  if (fs.existsSync(statsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
      ds = { ...ds, ...parsed };
    } catch(e){}
  }
  return ds;
}

function saveStats(ds) {
  try {
    fs.writeFileSync(statsPath, JSON.stringify(ds), { mode: 0o600 });
  } catch(e){}
}

// ── Analytics ─────────────────────────────────────────────────────────────────
if (isAnalyticsMode) {
  process.stdout.write('\x1Bc');
  const ascii = await figletAsync('LIFETIME STATS', { font: 'ANSI Shadow' });
  console.log(gradient(['#EC4899', '#8B5CF6', '#06B6D4'])(ascii));
  console.log();

  const stats = loadStats();
  const timeSavedMins = stats.totalSubmitted * 3;
  const hours = Math.floor(timeSavedMins / 60);
  const mins = timeSavedMins % 60;
  const timeSavedStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} mins`;

  const D = '─'.repeat(58);
  console.log('  ' + chalk.magenta('┌' + D + '┐'));
  console.log('  ' + chalk.magenta('│') + pad(chalk.bold.white('  NERD STATS DASHBOARD 🤓'), 58) + chalk.magenta('│'));
  console.log('  ' + chalk.magenta('├' + D + '┤'));
  console.log('  ' + chalk.magenta('│') + pad(`  Total Feedbacks Auto-Filled : ${chalk.green.bold(stats.totalSubmitted)}`, 58) + chalk.magenta('│'));
  console.log('  ' + chalk.magenta('│') + pad(`  Total Bot Runs              : ${chalk.yellow(stats.totalRuns)}`, 58) + chalk.magenta('│'));
  console.log('  ' + chalk.magenta('│') + pad(`  Estimated Time Saved        : ${chalk.cyan.bold(timeSavedStr)}`, 58) + chalk.magenta('│'));
  console.log('  ' + chalk.magenta('├' + D + '┤'));
  
  // Bar chart
  const totalVibes = stats.vibes.good + stats.vibes.neutral + stats.vibes.bad || 1;
  const makeBar = (count, colorFn) => {
      const pct = count / totalVibes;
      const filled = Math.round(pct * 16);
      return colorFn('█'.repeat(filled)) + chalk.dim('░'.repeat(16 - filled)) + ` ${Math.round(pct*100).toString().padStart(3, ' ')}%`;
  };

  console.log('  ' + chalk.magenta('│') + pad('  Vibe Usage Distribution:', 58) + chalk.magenta('│'));
  console.log('  ' + chalk.magenta('│') + pad(`  😇 Good Boy       [${makeBar(stats.vibes.good, chalk.green)}]`, 58) + chalk.magenta('│'));
  console.log('  ' + chalk.magenta('│') + pad(`  😐 Meh            [${makeBar(stats.vibes.neutral, chalk.yellow)}]`, 58) + chalk.magenta('│'));
  console.log('  ' + chalk.magenta('│') + pad(`  👿 Violence       [${makeBar(stats.vibes.bad, chalk.red)}]`, 58) + chalk.magenta('│'));
  console.log('  ' + chalk.magenta('└' + D + '┘'));
  console.log();
  
  console.log('  ' + chalk.dim('© Abhishek Singh  ·  ') + chalk.cyan.underline('github.com/AbhishekS04'));
  process.exit(0);
}

// ── Banner ───────────────────────────────────────────────────────────────
process.stdout.write('\x1Bc');

const ascii = await figletAsync('FEEDBACK BOT', { font: 'ANSI Shadow' });
console.log(gradient(['#06B6D4', '#818CF8', '#EC4899'])(ascii));

console.log(
  '  ' +
  chalk.cyan('◆') +
  chalk.white.bold('  Adamas University') +
  chalk.dim(`  ·  Academic Feedback Automation  ·  v${cliVersion}`)
);
console.log(
  '  ' +
  chalk.cyan('◆') +
  chalk.dim('  © Abhishek Singh  ·  ') +
  chalk.cyan.underline('https://github.com/AbhishekS04')
);
console.log();
console.log(chalk.dim('  ' + '─'.repeat(58)));
console.log();

// ── Disclaimer ───────────────────────────────────────────────────────────────
const D = '─'.repeat(58);
console.log('  ' + chalk.yellow('┌' + D + '┐'));
console.log('  ' + chalk.yellow('│') + pad(chalk.yellow.bold('  ⚠  DISCLAIMER — read before you ride, partner'), 58) + chalk.yellow('│'));
console.log('  ' + chalk.yellow('├' + D + '┤'));
const disclaimerLines = [
  chalk.white('  This tool exists ONLY to help submit academic'),
  chalk.white('  feedback on the Adamas University portal.'),
  '',
  chalk.dim('  • Use it on YOUR OWN account. Not your crush\'s.'),
  chalk.dim('  • The maker (Abhishek Singh) is not responsible'),
  chalk.dim('    if you do something chaotic with it. At all.'),
  chalk.dim('  • Seriously. Don\'t be that guy.'),
  '',
  chalk.cyan('  Ride responsibly. 🤠'),
];
for (const line of disclaimerLines) {
  console.log('  ' + chalk.yellow('│') + pad(line, 58) + chalk.yellow('│'));
}
console.log('  ' + chalk.yellow('└' + D + '┘'));
console.log();

// ── Pre-flight Check ────────────────────────────────────────────────────────
console.log(chalk.cyan.bold('\n  🚀  Pre-flight System Check'));
const s = p.spinner();
s.start('Checking Node.js & OS Compatibility...');
await new Promise(r => setTimeout(r, 800));

const nodeVer = process.version;
const majorVer = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
const platform = os.platform();
let platformName = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : platform === 'android' ? 'Termux (Android)' : 'Linux';

if (majorVer >= 18) {
  s.stop(chalk.green('✔') + chalk.dim(` Device: ${platformName}  |  Node.js ${nodeVer} (LTS Compatible)`));
} else {
  s.stop(chalk.red('✗') + chalk.red(` Device: ${platformName}  |  Node.js ${nodeVer} (Outdated)`));
  
  const installOption = await p.select({
    message: chalk.yellow('Your Node.js is outdated (v18+ required). Select operation:'),
    options: [
      { value: 'manual', label: 'Continue manually at my own risk', hint: 'might crash' },
      { value: 'auto', label: 'Auto-Install LTS Version', hint: 'not natively supported' }
    ]
  });

  if (installOption === 'auto') {
    p.outro(chalk.red('Auto-update from within npx is unsafe! Please install LTS from https://nodejs.org/'));
    process.exit(1);
  } else {
    p.log.warn('Proceeding with fragile Node environment... Hold onto your hat!');
  }
}
console.log();

// ── Update Check ────────────────────────────────────────────────────────
try {
  const npmData = await fetch('https://registry.npmjs.org/feedback-au/latest').then(r => r.json());
  const isNewer = (latest, current) => {
    const l = latest.split('.').map(Number);
    const c = current.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((l[i] || 0) > (c[i] || 0)) return true;
      if ((l[i] || 0) < (c[i] || 0)) return false;
    }
    return false;
  };
  if (npmData.version && isNewer(npmData.version, cliVersion)) {
    console.log();
    const alertBox = '─'.repeat(68);
    console.log('  ' + chalk.red('┌' + alertBox + '┐'));
    console.log('  ' + chalk.red('│') + pad(chalk.red.bold('  🤠 UPDATE WANTED — RIDE TIGHT!'), 68) + chalk.red('│'));
    console.log('  ' + chalk.red('├' + alertBox + '┤'));
    console.log('  ' + chalk.red('│') + pad(`  A shiny new version is available on npm: ${chalk.green.bold(npmData.version)}`, 68) + chalk.red('│'));
    console.log('  ' + chalk.red('│') + pad(`  Your current version: ${chalk.yellow(cliVersion)}`, 68) + chalk.red('│'));
    console.log('  ' + chalk.red('│') + pad('', 68) + chalk.red('│'));
    console.log('  ' + chalk.red('│') + pad('  One-click update commands:', 68) + chalk.red('│'));
    console.log('  ' + chalk.red('│') + pad(`  • If run via npx:   ${chalk.cyan('npx feedback-au@latest')}`, 68) + chalk.red('│'));
    console.log('  ' + chalk.red('│') + pad(`  • If run globally:  ${chalk.cyan('npm install -g feedback-au')}`, 68) + chalk.red('│'));
    console.log('  ' + chalk.red('│') + pad('', 68) + chalk.red('│'));
    console.log('  ' + chalk.red('│') + pad('  This single command will update the bot and all browser binaries!', 68) + chalk.red('│'));
    console.log('  ' + chalk.red('└' + alertBox + '┘'));
    console.log();
  }
} catch (e) {
  // ignore network errors for updater
}

// ── Credentials Loader ────────────────────────────────────────────────────────
async function getCredentials() {
  let creds = null;
  if (fs.existsSync(credPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      if (saved.studentId && saved.pass) {
        const useSaved = await p.confirm({
          message: chalk.cyan(`Found saved login for ${saved.studentId}. Use this?`),
          initialValue: true,
        });
        if (p.isCancel(useSaved)) { p.cancel('Cancelled.'); process.exit(0); }
        if (useSaved) {
          creds = { studentId: saved.studentId, pass: Buffer.from(saved.pass, 'base64').toString('utf8') };
        }
      }
    } catch (e) {}
  }

  if (!creds) {
    console.log(chalk.dim('\n  Your credentials never leave your machine.\n'));
    creds = await p.group(
      {
        studentId: () =>
          p.text({
            message: 'Student ID',
            placeholder: 'AU/XXXX/XXXXXXX',
            validate: v => (!v.trim() ? 'Required' : undefined),
          }),
        pass: () =>
          p.password({
            message: 'Password',
            validate: v => (!v ? 'Required' : undefined),
          }),
      },
      {
        onCancel: () => {
          p.cancel(chalk.yellow('Cancelled. Goodbye! 👋'));
          process.exit(0);
        },
      }
    );

    const savePrompt = await p.confirm({
      message: chalk.gray('Save these credentials securely for next time?'),
      initialValue: true,
    });
    if (savePrompt && !p.isCancel(savePrompt)) {
      fs.writeFileSync(
        credPath,
        JSON.stringify({
          studentId: creds.studentId.trim().toUpperCase(),
          pass: Buffer.from(creds.pass).toString('base64'),
        }),
        { mode: 0o600 }
      );
    }
  }
  return creds;
}

// ── Operations ────────────────────────────────────────────────────────────────
async function runSyncOperation(creds) {
  console.log();
  const clackSpinner = p.spinner();
  clackSpinner.start(chalk.cyan('Connecting to ADAMAS portal for biometric sync...'));
  let browser;
  try {
    const res = await forceSyncAttendance({
      studentId: creds.studentId.trim().toUpperCase(),
      password: creds.pass,
      headless: headlessMode,
      onStatus: msg => clackSpinner.message(chalk.magenta(msg)),
    });
    browser = res.browser;
    clackSpinner.stop(chalk.green('✓ Done syncing biometric attendance!'));
    console.log();
    for (const msg of res.logs) {
      console.log('  ' + msg);
    }
    console.log();
    console.log('  ' + chalk.cyan('Successfully bypassed time-locks and engaged all refresh buttons.'));
    console.log();
    console.log(gradient(['#06B6D4', '#6366F1', '#EC4899'])('  ' + '━'.repeat(56)));
    console.log('  ' + chalk.dim('© Abhishek Singh  ·  ') + chalk.cyan.underline('github.com/AbhishekS04'));
    await browser.close();
  } catch (err) {
    if (browser) await browser.close();
    clackSpinner.stop(chalk.red('✗ Error during sync'));
    console.error(chalk.red('\nFatal crash:\n' + err.message));
  }
}

async function runAttendanceOperation(creds, stats) {
  console.log();
  const clackSpinner = p.spinner();
  clackSpinner.start(chalk.cyan('Connecting to ADAMAS portal for attendance data...'));
  let browser;
  try {
    const res = await fetchAttendanceStats({
      studentId: creds.studentId.trim().toUpperCase(),
      password: creds.pass,
      headless: headlessMode,
      onStatus: msg => clackSpinner.message(chalk.magenta(msg)),
    });
    browser = res.browser;
    clackSpinner.stop(chalk.green('✓ Fetched attendance data!'));
    
    console.log();
    const LINE = '─'.repeat(88);
    console.log('  ' + chalk.cyan('┌' + LINE + '┐'));
    console.log('  ' + chalk.cyan('│') + '  ' + chalk.bold.white('BIOMETRIC ATTENDANCE DASHBOARD') + ' '.repeat(88 - 32) + chalk.cyan('│'));
    console.log('  ' + chalk.cyan('├' + LINE + '┤'));
    
    const colHeaders = chalk.dim(pad('Course', 35) + pad('Present', 9) + pad('Total', 7) + pad('%', 6) + pad('75% Status', 29));
    console.log('  ' + chalk.cyan('│') + '  ' + colHeaders + chalk.cyan('│'));
    console.log('  ' + chalk.cyan('├' + LINE + '┤'));
    
    if (res.data.length === 0) {
      console.log('  ' + chalk.cyan('│') + '  ' + pad(chalk.yellow('No attendance data found on the portal right now.'), 86) + chalk.cyan('│'));
    }

    let totalClassesAll = 0;
    let totalPresentAll = 0;

    for (const row of res.data) {
      let cName = row.course.replace(/\|\|/g, '').trim();
      if (cName.length > 32) cName = cName.substring(0, 29) + '...';
      
      const pCount = row.totalPresent;
      const tCount = row.totalClasses;
      const pct = row.percentage;
      
      totalClassesAll += tCount;
      totalPresentAll += pCount;

      let pctStr = pct >= 75 ? chalk.green(`${pct}%`) : chalk.red(`${pct}%`);
      let statusStr = '';
      if (pct < 75) {
         let needed = (3 * tCount) - (4 * pCount);
         needed = Math.ceil(needed);
         if (needed > 0) {
            statusStr = chalk.red(`⚠ Need ${needed} more class(es)`);
         } else {
            statusStr = chalk.yellow(`⚠ On edge`);
         }
      } else {
         let safeBunks = Math.floor(((4 * pCount) - (3 * tCount)) / 3);
         if (safeBunks > 0) {
            statusStr = chalk.green(`✓ Safe to bunk ${safeBunks} class(es)`);
         } else {
            statusStr = chalk.yellow(`⚠ Can't miss the next one!`);
         }
      }

      const rowStr = chalk.white(pad(cName, 35)) + 
                     chalk.cyan(pad(pCount.toString(), 9)) + 
                     chalk.dim(pad(tCount.toString(), 7)) + 
                     pad(pctStr, 6) + 
                     statusStr;
      
      const visualLen = stripAnsi(rowStr).length;
      const finalRow = rowStr + ' '.repeat(Math.max(0, 86 - visualLen));
                     
      console.log('  ' + chalk.cyan('│') + '  ' + finalRow + chalk.cyan('│'));
    }
    
    console.log('  ' + chalk.cyan('└' + LINE + '┘'));
    
    if (totalClassesAll > 0) {
      stats.averageAttendance = Math.round((totalPresentAll / totalClassesAll) * 1000) / 10;
      saveStats(stats);
    }
    
    console.log();
    console.log(gradient(['#06B6D4', '#6366F1', '#EC4899'])('  ' + '━'.repeat(88)));
    console.log('  ' + chalk.dim('© Abhishek Singh  ·  ') + chalk.cyan.underline('github.com/AbhishekS04'));
    await browser.close();
  } catch (err) {
    if (browser) await browser.close();
    clackSpinner.stop(chalk.red('✗ Error fetching attendance'));
    console.error(chalk.red('\nFatal crash:\n' + err.message));
  }
}

async function runFeedbackOperation(creds, stats) {
  console.log();
  const executionMode = await p.select({
    message: 'How do you want to assign ratings today?',
    options: [
      { value: 'bulk', label: '🌎 Global Vibe', hint: 'Apply one rating to all subjects' },
      { value: 'sniper', label: '🎯 Sniper Mode', hint: 'Handpick ratings for each subject' }
    ]
  });
  if (p.isCancel(executionMode)) return;

  let globalVibeStr = 'good';
  let globalCustomComment = '';

  if (executionMode === 'bulk') {
    globalVibeStr = await p.select({
      message: 'What\'s the global vibe today?',
      options: [
        { value: 'good', label: '😇 Good Boy', hint: 'Max positive ratings' },
        { value: 'neutral', label: '😐 Meh', hint: 'Average 50% ratings' },
        { value: 'bad', label: '👿 I Chose Violence', hint: 'Min negative ratings' },
        { value: 'custom', label: '✍️ Custom Comments', hint: 'Enter your own remarks text' }
      ]
    });
    if (p.isCancel(globalVibeStr)) return;

    if (globalVibeStr === 'custom') {
      const customVal = await p.text({
        message: 'Enter your custom comment text:',
        placeholder: 'e.g., The sessions were highly educational.',
        validate: v => (!v.trim() ? 'Required' : undefined)
      });
      if (p.isCancel(customVal)) return;
      globalCustomComment = customVal.trim();
    }
  }

  let finalVibeConfig = globalVibeStr === 'custom' ? { type: 'custom', comment: globalCustomComment } : globalVibeStr;

  if (executionMode === 'sniper') {
    console.log('  ' + chalk.magenta.bold('🎯 Sniper Mode Activated'));
    console.log('  ' + chalk.dim('Choose the vibe for each pending subject below:\n'));
    
    const clackSpinner = p.spinner();
    clackSpinner.start(chalk.cyan('Connecting to ADAMAS portal to fetch pending subjects...'));
    let session;
    try {
      session = await loginAndScan({
        studentId: creds.studentId.trim().toUpperCase(),
        password: creds.pass,
        headless: headlessMode,
        onStatus: msg => clackSpinner.message(chalk.cyan(msg)),
      });
    } catch (err) {
      clackSpinner.stop(chalk.red('✖  ' + err.message));
      console.log(chalk.dim('\n  Check your credentials and try again.\n'));
      return;
    }
    clackSpinner.stop(chalk.green('✔  Connected to ADAMAS portal'));
    console.log();

    const { browser, page, subjects } = session;
    const totalPending = subjects.reduce((acc, s) => acc + Math.max(0, s.total - s.done), 0);

    if (totalPending === 0) {
      p.note(chalk.green('✓ All feedback already submitted!'), 'Dashboard Scan');
      await browser.close();
      return;
    }

    const vibeMap = {};
    for (const s of subjects) {
      const pending = s.total - s.done;
      if (pending > 0) {
        const v = await p.select({
          message: `${chalk.cyan('➜')} ${chalk.white.bold(s.name)} ${chalk.dim(`(${pending} pending)`)}`,
          options: [
            { value: 'good', label: '😇 Good Boy', hint: 'Max ratings' },
            { value: 'neutral', label: '😐 Meh', hint: 'Average ratings' },
            { value: 'bad', label: '👿 I Chose Violence', hint: 'Min ratings' },
            { value: 'custom', label: '✍️ Custom Comments', hint: 'Enter your own remarks' }
          ]
        });
        if (p.isCancel(v)) { p.cancel('Cancelled.'); await browser.close(); return; }
        
        if (v === 'custom') {
          const customVal = await p.text({
            message: `Enter custom remarks for "${s.name}":`,
            placeholder: 'e.g., Very helpful discussions.',
            validate: val => (!val.trim() ? 'Required' : undefined)
          });
          if (p.isCancel(customVal)) { p.cancel('Cancelled.'); await browser.close(); return; }
          vibeMap[s.name] = { type: 'custom', comment: customVal.trim() };
        } else {
          vibeMap[s.name] = v;
        }
      }
    }
    finalVibeConfig = vibeMap;
    console.log();
    await executeSubmissionFlow(session, finalVibeConfig, totalPending, stats);
  } else {
    const clackSpinner = p.spinner();
    clackSpinner.start(chalk.cyan('Connecting to ADAMAS portal...'));
    let session;
    try {
      session = await loginAndScan({
        studentId: creds.studentId.trim().toUpperCase(),
        password: creds.pass,
        headless: headlessMode,
        onStatus: msg => clackSpinner.message(chalk.cyan(msg)),
      });
    } catch (err) {
      clackSpinner.stop(chalk.red('✖  ' + err.message));
      console.log(chalk.dim('\n  Check your credentials and try again.\n'));
      return;
    }
    clackSpinner.stop(chalk.green('✔  Connected to ADAMAS portal'));
    console.log();

    const { browser, page, subjects } = session;
    const totalPending = subjects.reduce((acc, s) => acc + Math.max(0, s.total - s.done), 0);

    if (totalPending === 0) {
      p.note(chalk.green('✓ All feedback already submitted!'), 'Dashboard Scan');
      await browser.close();
      return;
    }

    const go = await p.confirm({
      message: chalk.white(`Submit all ${chalk.yellow.bold(totalPending + '')} pending feedbacks now?`),
      initialValue: true,
    });

    if (p.isCancel(go) || !go) {
      p.cancel(chalk.yellow('Cancelled.'));
      await browser.close();
      return;
    }
    console.log();
    await executeSubmissionFlow(session, finalVibeConfig, totalPending, stats);
  }
}

async function executeSubmissionFlow(session, finalVibeConfig, totalPending, stats) {
  const { browser, page } = session;
  let submitted = 0;
  let failed = 0;
  const cookedSubjects = [];
  const skippedSubjects = [];
  let spinner = ora({ color: 'cyan', indent: 2 }).start();

  function liveStatus(subject, date) {
    const b = progressBar(submitted, totalPending, 20);
    const pct = chalk.dim(percent(submitted, totalPending) + '%');
    const nm = chalk.cyan.bold((subject || '').substring(0, 26).padEnd(26));
    const cnt = chalk.green(submitted + '✓') + (failed ? chalk.red('  ' + failed + '✗') : '');
    const dt = date ? chalk.dim('  ' + date) : '';
    return `${nm}  [${b}]  ${pct}  ${cnt}${dt}`;
  }

  await runSubmissions({
    browser,
    page,
    vibe: finalVibeConfig,
    onEvent(ev) {
      switch (ev.type) {
        case 'pass':
          spinner.text = chalk.dim(`Scanning dashboard — pass ${ev.n}...`);
          break;
        case 'subject_start':
          spinner.text =
            chalk.cyan.bold(ev.name) +
            chalk.dim(`  (${ev.done}/${ev.total}) — loading feedbacks...`);
          break;
        case 'feedback_start':
          spinner.text = liveStatus(ev.subject, ev.date);
          break;
        case 'feedback_success':
          submitted++;
          spinner.text = liveStatus(ev.subject, ev.date);
          break;
        case 'feedback_fail':
          failed++;
          spinner.text = liveStatus(ev.subject, '') + chalk.red(`  ✗ ${ev.error.substring(0, 35)}`);
          break;
        case 'subject_done':
          cookedSubjects.push(ev.name);
          spinner.stopAndPersist({
            symbol: chalk.green('  ✔'),
            text:
              chalk.white(ev.name.substring(0, 30).padEnd(30)) + '  ' +
              `[${progressBar(submitted, totalPending, 18)}]  ` +
              chalk.green(`${ev.submitted}✓`) +
              (ev.failed ? chalk.red(`  ${ev.failed}✗`) : '') +
              chalk.dim(`  ${percent(submitted, totalPending)}%`),
          });
          spinner = ora({ color: 'cyan', indent: 2 }).start();
          break;
        case 'subject_skip':
          skippedSubjects.push(ev.name);
          spinner.stopAndPersist({
            symbol: chalk.yellow('  ⏭'),
            text: chalk.dim(ev.name + ' — skipped (too many errors)'),
          });
          spinner = ora({ color: 'cyan', indent: 2 }).start();
          break;
        case 'all_done':
          spinner.stop();
          break;
      }
    },
  });

  console.log();
  console.log(gradient(['#06B6D4', '#6366F1', '#EC4899'])('  ' + '━'.repeat(56)));
  console.log();

  const completionPct = percent(submitted, totalPending);
  if (submitted === totalPending) {
    console.log('  ' + chalk.green.bold('🎉  All done! Every feedback submitted.'));
  } else {
    console.log('  ' + chalk.white.bold('🏁  Finished!'));
  }

  console.log();
  if (cookedSubjects.length > 0) {
    console.log(`  ${chalk.green('✓')}  ${chalk.white.bold('You and I cooked and successfully submitted:')}`);
    for (const s of cookedSubjects) console.log(`      ${chalk.dim('• ' + s)}`);
    console.log();
  }

  if (skippedSubjects.length > 0) {
    console.log(`  ${chalk.red('✗')}  ${chalk.yellow.bold('These subjects caused an error! Try manually or leave it:')}`);
    for (const s of skippedSubjects) console.log(`      ${chalk.dim('• ' + s)}`);
    console.log();
  }

  const missed = totalPending - submitted - failed;
  if (missed > 0) {
    console.log(`  ${chalk.yellow('⚠')}  ${chalk.yellow.dim(missed + " feedback(s) couldn't be reached (skipped unknown).")}`);
  }

  console.log();
  console.log('  ' + chalk.dim('─'.repeat(56)));
  console.log();

  const jokes100 = [
    ['"Every. Single. One."', "You submitted all of 'em, partner. Even Arthur Morgan", 'would tip his hat. You ride free tonight.', 'Attendance? Safe. Professors? Pleased. You? Legendary.'],
    ['"Fastest click in the West."', 'Perfect score. Not a single feedback left behind.', "You've earned a drink at the saloon. Yeee-haw!", ''],
    ['"A true legend of the plains."', 'You left no survivors. Every portal checked, every form filled.', "You're officially the baddest cowboy in the university.", '']
  ];
  const jokes65 = [
    ['"Above 65, pardner. You might just make it."', "Your feedback's cleaner than Dutch's plans — and those", "actually worked... mostly. You're safe. Probably.", "Don't push your luck, boy. Submit the rest next time."],
    ['"You survived the shootout."', 'You cleared the minimum passing grade. A true survivor.', 'Keep your head down and stay out of trouble.', ''],
    ['"Alive for another day."', 'Above 65. You might just make it out of here without', 'a bounty on your head! Rest easy, for now.', '']
  ];
  const jokes0 = [
    ['"Below 65. That ain\'t good, son."', 'Even Micah Bell showed up more than this, and nobody', 'liked Micah. Go talk to your professors. Now.', "I'm serious. This horse won't carry you through exams."],
    ['"You\'re playing a dangerous game."', 'Below 65? Your horse is gonna need to run real fast', 'when the results come out.', ''],
    ['"Dead man walking."', "This ain't looking good, partner. You might want", 'to sleep with one eye open.', '']
  ];
  const jokesNone = [
    ['"...You submitted nothing?"', "I've seen men walk into the O'Driscoll camp with better", 'odds than your attendance right now. Good luck, partner.', "(Please run the tool again. It'll help. I promise.)"],
    ['"A brave fool... or just a fool."', "You submitted absolutely nothing? You're walking", 'straight into an ambush without a gun.', ''],
    ['"Are you even enrolled?"', "Because your feedback score says you're a ghost in", 'these parts. Good luck explaining that to the sheriff.', '']
  ];

  const getJoke = (arr) => arr[Math.floor(Math.random() * arr.length)];
  let joke = completionPct === 100 ? getJoke(jokes100) : completionPct >= 65 ? getJoke(jokes65) : completionPct > 0 ? getJoke(jokes0) : getJoke(jokesNone);

  console.log('  ' + chalk.yellow('🤠') + chalk.magenta.bold(' ' + joke[0]));
  console.log();
  console.log(chalk.dim.italic('     ' + joke[1]));
  console.log(chalk.dim.italic('     ' + joke[2]));
  if (joke[3]) console.log(chalk.blue('     ' + joke[3]));

  stats.totalRuns += 1;
  stats.totalSubmitted += submitted;
  const selectedVibe = typeof finalVibeConfig === 'object' ? 'neutral' : finalVibeConfig;
  if (stats.vibes[selectedVibe] !== undefined) {
    stats.vibes[selectedVibe] += 1;
  }
  saveStats(stats);

  console.log();
  console.log(gradient(['#06B6D4', '#6366F1', '#EC4899'])('  ' + '━'.repeat(56)));
  console.log();
  console.log('  ' + chalk.dim('© Abhishek Singh  ·  ') + chalk.cyan.underline('github.com/AbhishekS04'));
  await browser.close();
}

// ── Leaderboard Fetch & Push ──────────────────────────────────────────────────
async function syncLeaderboard(stats) {
  const bucketId = 'K8s9D2x7P3qW5eRtY1uIoP';
  const url = `https://kvdb.io/bucket/${bucketId}/top_scores`;
  const score = Math.round((stats.averageAttendance || 75.0) * 10 + (stats.totalSubmitted || 0) * 5);
  
  if (!stats.alias) {
    p.log.warn('No Cowboy Alias found. Setting up profile first...');
    const alias = await p.text({
      message: 'Choose your anonymous Cowboy Alias:',
      placeholder: 'e.g., Arthur Morgan',
      validate: v => (!v.trim() ? 'Required' : v.length > 20 ? 'Max 20 chars' : undefined),
    });
    if (p.isCancel(alias)) return null;
    stats.alias = alias.trim();
    saveStats(stats);
  }

  const spinner = p.spinner();
  spinner.start(chalk.cyan('Connecting to global saloon scoreboard...'));

  let scoresList = [];
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      scoresList = await resp.json();
    }
  } catch (e) {}

  const userEntry = {
    alias: stats.alias,
    attendance: stats.averageAttendance || 75.0,
    feedbacks: stats.totalSubmitted || 0,
    score,
    timestamp: Date.now()
  };

  const existingIndex = scoresList.findIndex(e => e.alias.toLowerCase() === stats.alias.toLowerCase());
  if (existingIndex >= 0) {
    if (score > scoresList[existingIndex].score) {
      scoresList[existingIndex] = userEntry;
    }
  } else {
    scoresList.push(userEntry);
  }

  scoresList.sort((a, b) => b.score - a.score);
  if (scoresList.length > 50) scoresList = scoresList.slice(0, 50);

  let online = false;
  try {
    const pushResp = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(scoresList),
      headers: { 'Content-Type': 'application/json' }
    });
    if (pushResp.ok) {
      online = true;
    }
  } catch (e) {}

  spinner.stop(online ? chalk.green('✓ Synced with global scoreboard!') : chalk.yellow('⚠️ Saloon scoreboard offline. Showing local stats only.'));
  
  if (!online) {
    return [userEntry];
  }
  return scoresList.slice(0, 10);
}

function renderLeaderboardTable(topList, userAlias) {
  const LINE = '─'.repeat(74);
  console.log('  ' + chalk.magenta('┌' + LINE + '┐'));
  console.log('  ' + chalk.magenta('│') + '  ' + chalk.bold.white('🏆 ADAMAS OUTLAW LEAGUE SCORES') + ' '.repeat(74 - 32) + chalk.magenta('│'));
  console.log('  ' + chalk.magenta('├' + LINE + '┤'));
  
  const headers = chalk.dim(pad('Rank', 6) + pad('Cowboy Alias', 24) + pad('Attendance', 12) + pad('Feedbacks', 12) + pad('Score', 10) + 'Title');
  console.log('  ' + chalk.magenta('│') + '  ' + pad(headers, 72) + chalk.magenta('│'));
  console.log('  ' + chalk.magenta('├' + LINE + '┤'));

  let rank = 1;
  for (const entry of topList) {
    let aliasStr = entry.alias;
    if (aliasStr.toLowerCase() === userAlias.toLowerCase()) {
      aliasStr = chalk.yellow.bold(`🤠 ${aliasStr} (You)`);
    } else {
      aliasStr = `👤 ${aliasStr}`;
    }

    const attStr = `${entry.attendance.toFixed(1)}%`;
    const fdbStr = entry.feedbacks.toString();
    const scrStr = entry.score.toString();
    
    let title = 'Greenhorn';
    if (entry.score >= 1200) title = chalk.red.bold('Legend');
    else if (entry.score >= 950) title = chalk.magenta.bold('Gunslinger');
    else if (entry.score >= 800) title = chalk.cyan.bold('Outlaw');
    else if (entry.score >= 600) title = chalk.green('Ranger');
    
    const rowStr = pad(rank.toString(), 6) +
                   pad(aliasStr, 24) +
                   pad(attStr, 12) +
                   pad(fdbStr, 12) +
                   pad(scrStr, 8) +
                   title;
                   
    const visualLen = stripAnsi(rowStr).length;
    const finalRow = rowStr + ' '.repeat(Math.max(0, 72 - visualLen));
    console.log('  ' + chalk.magenta('│') + '  ' + finalRow + chalk.magenta('│'));
    rank++;
  }
  
  console.log('  ' + chalk.magenta('└' + LINE + '┘'));
  console.log();
}

// ── Startup & Router ──────────────────────────────────────────────────────────
const creds = await getCredentials();
const stats = loadStats();

if (isSyncMode) {
  await runSyncOperation(creds);
  process.exit(0);
}

if (isAttendanceMode) {
  await runAttendanceOperation(creds, stats);
  process.exit(0);
}

if (isLeaderboardMode) {
  const topList = await syncLeaderboard(stats);
  if (topList) {
    renderLeaderboardTable(topList, stats.alias);
  }
  process.exit(0);
}

// ── Interactive Menu Loop ──────────────────────────────────────────────────────
if (!stats.leaderboardDiscovered) {
  console.log();
  p.note(
    chalk.white('We have added a brand new ') + chalk.cyan.bold('🏆 Global Cowboy Leaderboard') + chalk.white('!\n') +
    chalk.white('You can now set up an anonymous ') + chalk.yellow.bold('Cowboy Alias') + chalk.white(' and compare\n') +
    chalk.white('your academic attendance and feedback stats with other riders.\n\n') +
    chalk.dim('Choose the Leaderboard option in the Main Menu to get started! 🤠'),
    '🎉 NEW FEATURE ADDED!'
  );
  stats.leaderboardDiscovered = true;
  saveStats(stats);
}

while (true) {
  console.log();
  p.intro(chalk.bgCyan.black.bold('  MAIN MENU  '));
  
  const choice = await p.select({
    message: 'Select an operation:',
    options: [
      { value: 'feedback', label: '🚀 Run Feedback Bot (Autofill)', hint: 'Automatically submits pending feedbacks' },
      { value: 'attendance', label: '📊 View Attendance Stats & Calculator', hint: 'Check bunk counts and targets' },
      { value: 'sync', label: '⚡ Sync Biometric Logs (Bypass)', hint: 'Force refresh biometric databases' },
      { value: 'leaderboard', label: '🏆 Cowboy Leaderboard', hint: 'View rankings & compare scores' },
      { value: 'exit', label: '🚪 Exit Saloon', hint: 'Quit feedback-au' }
    ]
  });

  if (p.isCancel(choice) || choice === 'exit') {
    p.outro(chalk.yellow('Happy trails, cowboy! 👋'));
    process.exit(0);
  }

  if (choice === 'feedback') {
    await runFeedbackOperation(creds, stats);
  } else if (choice === 'attendance') {
    await runAttendanceOperation(creds, stats);
  } else if (choice === 'sync') {
    await runSyncOperation(creds);
  } else if (choice === 'leaderboard') {
    const topList = await syncLeaderboard(stats);
    if (topList) {
      renderLeaderboardTable(topList, stats.alias);
    }
  }
}
