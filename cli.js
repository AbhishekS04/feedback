#!/usr/bin/env node
import chalk from 'chalk';
import ora from 'ora';
import gradient from 'gradient-string';
import figlet from 'figlet';
import * as p from '@clack/prompts';
import os from 'os';
import { loginAndScan, runSubmissions } from './bot.js';
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
  console.log(`  ${chalk.cyan('--status')}       View your lifetime stats graphical dashboard`);
  console.log(`  ${chalk.cyan('--help, -h')}     Show this help message\n`);
  process.exit(0);
}

// Watch mode detection
const isWatchMode = process.argv.includes('--watch') || process.argv.includes('--show');
const headlessMode = !isWatchMode;
// ── Utils ─────────────────────────────────────────────────────────────────────
const figletAsync = (text, opts) =>
  new Promise((res, rej) =>
    figlet.text(text, opts, (err, out) => (err ? rej(err) : res(out)))
  );

const stripAnsi = s => s.replace(/\x1B\[[0-9;]*m/g, '');
const pad = (str, len) => str + ' '.repeat(Math.max(0, len - stripAnsi(str).length));

// Analytics mode detection
const isAnalyticsMode = process.argv.includes('--status');
const statsPath = path.join(os.homedir(), '.feedback-au-stats.json');

if (isAnalyticsMode) {
  process.stdout.write('\x1Bc');
  const ascii = await figletAsync('LIFETIME STATS', { font: 'ANSI Shadow' });
  console.log(gradient(['#EC4899', '#8B5CF6', '#06B6D4'])(ascii));
  console.log();

  let stats = { totalSubmitted: 0, totalRuns: 0, vibes: { good: 0, neutral: 0, bad: 0 } };
  if (fs.existsSync(statsPath)) {
    try { stats = JSON.parse(fs.readFileSync(statsPath, 'utf8')); } catch(e){}
  }

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

function progressBar(done, total, width = 20) {
  const pct = total > 0 ? done / total : 0;
  const filled = Math.round(pct * width);
  return chalk.cyan('█'.repeat(filled)) + chalk.dim('░'.repeat(width - filled));
}
const percent = (d, t) => (t > 0 ? Math.round((d / t) * 100) : 0);

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
  if (npmData.version && npmData.version !== cliVersion) {
    p.note(
      chalk.yellow(`A new version is available: ${chalk.bold(npmData.version)}\nRun: `) + chalk.cyan('npx feedback-au@latest'),
      chalk.green('Update Available')
    );
  }
} catch (e) {
  // ignore network errors for updater
}

// ── Credentials ───────────────────────────────────────────────────────────────
p.intro(chalk.bgCyan.black.bold('  FEEDBACK BOT  '));

const credPath = path.join(os.homedir(), '.feedback-au-credentials.json');
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

// ── Execution Mode ───────────────────────────────────────────────────────────────────
console.log();
const executionMode = await p.select({
  message: 'How do you want to assign ratings today?',
  options: [
    { value: 'bulk', label: '🌎 Global Vibe', hint: 'Apply one rating to all subjects' },
    { value: 'sniper', label: '🎯 Sniper Mode', hint: 'Handpick ratings for each subject' }
  ]
});
if (p.isCancel(executionMode)) { p.cancel('Cancelled.'); process.exit(0); }

let globalVibeStr = 'good';
if (executionMode === 'bulk') {
  globalVibeStr = await p.select({
    message: 'What\'s the global vibe today?',
    options: [
      { value: 'good', label: '😇 Good Boy', hint: 'Max positive ratings' },
      { value: 'neutral', label: '😐 Meh', hint: 'Average 50% ratings' },
      { value: 'bad', label: '👿 I Chose Violence', hint: 'Min negative ratings' }
    ]
  });
  if (p.isCancel(globalVibeStr)) { p.cancel('Cancelled.'); process.exit(0); }
}

console.log();

// ── Login + Scan ──────────────────────────────────────────────────────────────
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
  process.exit(1);
}

clackSpinner.stop(chalk.green('✔  Connected to ADAMAS portal'));
console.log();

// ── Subject Overview Table ────────────────────────────────────────────────────
const { browser, page, subjects } = session;
const totalPending = subjects.reduce((acc, s) => acc + Math.max(0, s.total - s.done), 0);

// Table header
const LINE = '─'.repeat(64);
console.log('  ' + chalk.cyan('┌' + LINE + '┐'));
console.log(
  '  ' + chalk.cyan('│') +
  '  ' + chalk.bold.white('SUBJECT OVERVIEW') +
  ' '.repeat(64 - 18) +
  chalk.cyan('│')
);
console.log('  ' + chalk.cyan('├' + LINE + '┤'));

// Column headers
const colHeaders = chalk.dim(pad('Subject', 34) + pad('Progress', 22) + 'Status');
console.log('  ' + chalk.cyan('│') + '  ' + pad(colHeaders, 62) + chalk.cyan('│'));
console.log('  ' + chalk.cyan('├' + LINE + '┤'));

for (const s of subjects) {
  const pending = s.total - s.done;
  const name = pad(s.name.length > 32 ? s.name.substring(0, 29) + '...' : s.name, 34);
  const b = progressBar(s.done, s.total, 14);
  const info = chalk.dim(`${s.done}/${s.total}`);
  const barCol = b + ' ' + info;

  let status;
  if (pending <= 0) {
    status = chalk.green('✓ done');
  } else {
    status = chalk.yellow.bold(pending + ' left');
  }

  const rowContent = chalk.white(name) + pad(barCol, 22) + status;
  console.log('  ' + chalk.cyan('│') + '  ' + pad(rowContent, 62) + chalk.cyan('│'));
}

console.log('  ' + chalk.cyan('├' + LINE + '┤'));

if (totalPending === 0) {
  const msg = '  ✓  All feedback already submitted!';
  console.log('  ' + chalk.cyan('│') + chalk.green(msg) + ' '.repeat(64 - msg.length) + chalk.cyan('│'));
  console.log('  ' + chalk.cyan('└' + LINE + '┘\n'));
  await browser.close();
  process.exit(0);
}

const summaryLeft = chalk.dim('  Total pending  ');
const summaryRight = chalk.yellow.bold(totalPending + ' feedbacks');
const summaryRaw = '  Total pending  ' + totalPending + ' feedbacks';
console.log(
  '  ' + chalk.cyan('│') + summaryLeft + summaryRight +
  ' '.repeat(Math.max(0, 64 - summaryRaw.length)) + chalk.cyan('│')
);
console.log('  ' + chalk.cyan('└' + LINE + '┘'));
console.log();

// ── Sniper Mode Selection ───────────────────────────────────────────────────────
let finalVibeConfig = globalVibeStr;

if (executionMode === 'sniper') {
  console.log('  ' + chalk.magenta.bold('🎯 Sniper Mode Activated'));
  console.log('  ' + chalk.dim('Choose the vibe for each pending subject below:\n'));
  
  const vibeMap = {};
  for (const s of subjects) {
    const pending = s.total - s.done;
    if (pending > 0) {
      const v = await p.select({
        message: `${chalk.cyan('➜')} ${chalk.white.bold(s.name)} ${chalk.dim(`(${pending} pending)`)}`,
        options: [
          { value: 'good', label: '😇 Good Boy', hint: 'Max ratings' },
          { value: 'neutral', label: '😐 Meh', hint: 'Average ratings' },
          { value: 'bad', label: '👿 I Chose Violence', hint: 'Min ratings' }
        ]
      });
      if (p.isCancel(v)) { p.cancel('Cancelled.'); await browser.close(); process.exit(0); }
      vibeMap[s.name] = v;
    }
  }
  finalVibeConfig = vibeMap;
  console.log();
} else {
  // ── Confirm (Only for Bulk) ─────────────
  const go = await p.confirm({
    message: chalk.white(`Submit all ${chalk.yellow.bold(totalPending + '')} pending feedbacks now?`),
    initialValue: true,
  });

  if (p.isCancel(go) || !go) {
    p.cancel(chalk.yellow('Cancelled. Run again whenever you\'re ready.'));
    await browser.close();
    process.exit(0);
  }
  console.log();
}

// ── Live Submission Progress ──────────────────────────────────────────────────
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

// ── Final Summary ─────────────────────────────────────────────────────────────
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

// ── Cowboy jokes ─────────────────────────────────────────────────────────────
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

// ── Save Stats ─────────────────────────────────────────────────────────────
let ds = { totalSubmitted: 0, totalRuns: 0, vibes: { good: 0, neutral: 0, bad: 0 } };
try {
  if (fs.existsSync(statsPath)) ds = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
} catch(e){}

ds.totalRuns += 1;
ds.totalSubmitted += submitted;
if (executionMode === 'bulk' && ds.vibes[globalVibeStr] !== undefined) {
    ds.vibes[globalVibeStr] += 1;
} else if (executionMode === 'sniper') {
    // If sniper, pick the most common vibe or count them all? We'll just count them proportional or skip.
    // Easiest is to add to the first vibe found, or split it. We'll add 1 to 'neutral' to denote a mixed run.
    ds.vibes['neutral'] += 1;
}

try {
  fs.writeFileSync(statsPath, JSON.stringify(ds), { mode: 0o600 });
} catch(e){}

console.log();
console.log(gradient(['#06B6D4', '#6366F1', '#EC4899'])('  ' + '━'.repeat(56)));
console.log();

console.log('  ' + chalk.dim('© Abhishek Singh  ·  ') + chalk.cyan.underline('github.com/AbhishekS04'));

await browser.close();
