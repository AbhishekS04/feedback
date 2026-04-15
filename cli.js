#!/usr/bin/env node
import chalk from 'chalk';
import ora from 'ora';
import { input, password, confirm } from '@inquirer/prompts';
import { loginAndScan, runSubmissions } from './bot.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const stripAnsi = s => s.replace(/\x1B\[[0-9;]*m/g, '');
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - stripAnsi(s).length));

function box(lines, color = 'cyan') {
  const width = Math.max(...lines.map(l => stripAnsi(l).length)) + 4;
  const c = chalk[color].bold;
  const hr = '═'.repeat(width);
  const output = [c(`╔${hr}╗`)];
  for (const line of lines) {
    const raw = stripAnsi(line);
    const trail = width - raw.length - 2;
    output.push(c('║') + '  ' + line + ' '.repeat(Math.max(0, trail)) + c('║'));
  }
  output.push(c(`╚${hr}╝`));
  return output.join('\n');
}

function progressBar(done, total, width = 30) {
  const pct = total > 0 ? done / total : 0;
  const filled = Math.round(pct * width);
  return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(width - filled));
}

// ── Banner ────────────────────────────────────────────────────────────────────
process.stdout.write('\x1Bc'); // clear terminal

console.log(chalk.cyan.bold(`
╔══════════════════════════════════════════════════════╗
║                                                      ║
║          🎓  ADAMAS FEEDBACK BOT  v1.0.0             ║
║              adamasknowledgecity.ac.in               ║
║                                                      ║
║      Auto-submit all pending academic feedback       ║
║                                                      ║
╚══════════════════════════════════════════════════════╝`));

console.log('\n' + chalk.dim('  ⓘ  Your credentials stay on your machine and are never sent anywhere.\n'));

// ── Collect Credentials ───────────────────────────────────────────────────────
let studentId, pass;
try {
  studentId = await input({
    message: chalk.bold('Student ID'),
    required: true,
    validate: v => v.trim().length > 0 || 'Student ID is required',
  });

  pass = await password({
    message: chalk.bold('Password'),
    mask: '•',
    validate: v => v.length > 0 || 'Password is required',
  });
} catch {
  console.log('\n' + chalk.yellow('  Cancelled. Goodbye! 👋\n'));
  process.exit(0);
}

console.log();

// ── Login + Scan ──────────────────────────────────────────────────────────────
let session;
const loginSpinner = ora({ text: chalk.cyan('Connecting to ADAMAS portal...'), color: 'cyan' }).start();

try {
  session = await loginAndScan({
    studentId: studentId.trim(),
    password: pass,
    headless: false,
    onStatus: msg => { loginSpinner.text = chalk.cyan(msg); },
  });
} catch (err) {
  loginSpinner.fail(chalk.red('  ' + err.message));
  console.log(chalk.dim('\n  Double-check your Student ID and Password and try again.\n'));
  process.exit(1);
}

loginSpinner.succeed(chalk.green('Connected to ADAMAS portal'));
console.log();

// ── Pending Summary ───────────────────────────────────────────────────────────
const { browser, page, subjects } = session;
const totalPending = subjects.reduce((acc, s) => acc + Math.max(0, s.total - s.done), 0);

const tableLines = subjects.map(s => {
  const pending = s.total - s.done;
  const name = pad(s.name.substring(0, 34), 35);
  const status = pending <= 0
    ? chalk.green('✔ All done')
    : chalk.yellow(`${s.done}/${s.total}`) + chalk.dim(` · `) + chalk.bold(`${pending} pending`);
  return name + status;
});

tableLines.push(''); // spacer
if (totalPending === 0) {
  tableLines.push(chalk.green.bold('✅  All feedback already submitted!'));
} else {
  tableLines.push(
    chalk.dim('Total pending:  ') + chalk.yellow.bold(totalPending + ' feedbacks')
  );
}

console.log(box(
  [chalk.bold.white('PENDING FEEDBACK SUMMARY'), '', ...tableLines],
  'cyan'
));
console.log();

if (totalPending === 0) {
  await browser.close();
  process.exit(0);
}

// ── Confirm ───────────────────────────────────────────────────────────────────
let go;
try {
  go = await confirm({
    message: chalk.bold(`Start submitting ${chalk.yellow(totalPending)} feedbacks now?`),
    default: true,
  });
} catch {
  go = false;
}

if (!go) {
  console.log('\n' + chalk.yellow('  Cancelled. Run again whenever you\'re ready. 👋\n'));
  await browser.close();
  process.exit(0);
}

console.log();

// ── Live Submission Progress ──────────────────────────────────────────────────
let submitted = 0;
let failed    = 0;
let spinner   = ora({ color: 'cyan', indent: 2 }).start();

function liveBar(subject) {
  const bar  = progressBar(submitted, totalPending);
  const pct  = totalPending > 0 ? Math.round((submitted / totalPending) * 100) : 0;
  const name = chalk.bold.cyan((subject || '').substring(0, 28));
  return (
    `${name}  [${bar}] ${chalk.dim(pct + '%')}  ` +
    chalk.green(`${submitted}✓`) +
    (failed ? chalk.red(`  ${failed}✗`) : '')
  );
}

await runSubmissions({
  browser,
  page,
  onEvent(ev) {
    switch (ev.type) {

      case 'pass':
        spinner.text = chalk.dim(`  Scanning dashboard — pass ${ev.n}...`);
        break;

      case 'subject_start':
        spinner.text = chalk.bold.cyan(`  ${ev.name}`) + chalk.dim(` — loading feedbacks (${ev.done}/${ev.total})...`);
        break;

      case 'feedback_start':
        spinner.text = liveBar(ev.subject) + (ev.date ? chalk.dim(`  ${ev.date}`) : '');
        break;

      case 'feedback_success':
        submitted++;
        spinner.text = liveBar(ev.subject) + chalk.dim(ev.date ? `  ${ev.date}` : '');
        break;

      case 'feedback_fail':
        failed++;
        spinner.text = liveBar(ev.subject) + chalk.red(`  ✗ ${ev.error.substring(0, 45)}`);
        break;

      case 'subject_done':
        spinner.stopAndPersist({
          symbol: chalk.green('  ✔'),
          text: chalk.bold(ev.name) + '  ' + chalk.green(`${ev.submitted} submitted`) +
                (ev.failed ? chalk.red(` · ${ev.failed} failed`) : '') +
                `  [${progressBar(submitted, totalPending, 20)}] ${submitted}/${totalPending}`,
        });
        spinner = ora({ color: 'cyan', indent: 2 }).start();
        break;

      case 'subject_skip':
        spinner.stopAndPersist({
          symbol: chalk.yellow('  ⏭'),
          text:   chalk.bold(ev.name) + '  ' + chalk.yellow('skipped — too many consecutive errors'),
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
console.log(box([
  chalk.bold.white('🏁  FINISHED'),
  '',
  chalk.green(`✅  ${submitted} form(s) submitted successfully`),
  chalk.red(`❌  ${failed} form(s) failed`),
  ...(submitted + failed < totalPending
    ? [chalk.yellow(`⚠   ${totalPending - submitted - failed} feedback(s) could not be reached`)]
    : []),
  '',
  chalk.dim('Thanks for using feedback-au 🎓'),
], 'cyan'));

console.log();
await browser.close();
