#!/usr/bin/env node
import chalk from 'chalk';
import ora from 'ora';
import gradient from 'gradient-string';
import figlet from 'figlet';
import * as p from '@clack/prompts';
import { loginAndScan, runSubmissions } from './bot.js';

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

// ── Banner ───────────────────────────────────────────────────────────────
process.stdout.write('\x1Bc');

const ascii = await figletAsync('FEEDBACK BOT', { font: 'ANSI Shadow' });
console.log(gradient(['#06B6D4', '#818CF8', '#EC4899'])(ascii));

console.log(
  '  ' +
  chalk.cyan('◆') +
  chalk.white.bold('  Adamas University') +
  chalk.dim('  ·  Academic Feedback Automation  ·  v1.0.0')
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

// ── Credentials ───────────────────────────────────────────────────────────────
p.intro(chalk.bgCyan.black.bold('  FEEDBACK BOT  '));

console.log(chalk.dim('\n  Your credentials never leave your machine.\n'));

const creds = await p.group(
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

console.log();

// ── Login + Scan ──────────────────────────────────────────────────────────────
const clackSpinner = p.spinner();
clackSpinner.start(chalk.cyan('Connecting to ADAMAS portal...'));

let session;
try {
  session = await loginAndScan({
    studentId: creds.studentId.trim().toUpperCase(),
    password: creds.pass,
    headless: false,
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

// ── Confirm ───────────────────────────────────────────────────────────────────
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




console.log();
console.log(gradient(['#06B6D4', '#6366F1', '#EC4899'])('  ' + '━'.repeat(56)));
console.log();

console.log('  ' + chalk.dim('© Abhishek Singh  ·  ') + chalk.cyan.underline('github.com/AbhishekS04'));

await browser.close();
