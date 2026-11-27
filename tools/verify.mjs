#!/usr/bin/env node
// one way to check this repo. usage: node tools/verify.mjs check|build|all
// prints one line per step, then PASS|FAIL <verb> (time) - note. exit 0 only on pass.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// root comes from this file, so any worktree runs its own copy
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const verb = process.argv[2];
const verbs = { check: ['typecheck', 'lint', 'test'], build: ['build'], all: ['typecheck', 'lint', 'test', 'build'] };
if (!verbs[verb]) {
  console.log('FAIL verify (0s) - usage: node tools/verify.mjs check|build|all');
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = join(root, '.runs', 'verify', stamp);
mkdirSync(runDir, { recursive: true });
const reportPath = join(runDir, 'vitest.json');

const cmds = {
  typecheck: 'pnpm typecheck',
  lint: 'pnpm lint',
  test: `pnpm exec vitest run --reporter=default --reporter=json --outputFile.json="${reportPath}"`,
  build: 'pnpm build',
};
const timeoutMs = 15 * 60 * 1000;

function run(name) {
  return new Promise((done) => {
    const log = join(runDir, `${name}.log`);
    const out = createWriteStream(log);
    const t0 = Date.now();
    const child = spawn(cmds[name], { cwd: root, shell: true, env: { ...process.env, FORCE_COLOR: '0', CI: '1' } });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      // kill the whole tree, a plain kill leaves pnpm children running on windows
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f']);
      else child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.pipe(out, { end: false });
    child.stderr.pipe(out, { end: false });
    child.on('error', (e) => out.write(`spawn error: ${e.message}\n`));
    child.on('close', (code) => {
      clearTimeout(timer);
      out.end(() => {
        const seconds = Math.round((Date.now() - t0) / 100) / 10;
        done({ name, code, seconds, log, timedOut });
      });
    });
  });
}

function firstErrors(log, n = 6) {
  // strip colour codes so lines read cleanly, and skip passing-file lines
  const lines = readFileSync(log, 'utf8').replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/);
  const hits = lines.filter((l) => /error|ERR_|FAIL|TS\d{4}/.test(l) && !l.includes('✓') && l.trim());
  return (hits.length ? hits : lines.filter((l) => l.trim()).slice(-n)).slice(0, n);
}

// what a green build must leave behind. add a line when a package gains a build output.
const BUILD_ARTIFACTS = [
  'packages/shared/dist/index.js',
  'packages/skill/dist/index.js',
  'packages/skill/dist/index.d.ts',
  'packages/extension/dist/extension.js',
  'packages/webview/dist/index.html',
];

function judge(r) {
  const step = { name: r.name, result: 'FAIL', seconds: r.seconds, log: r.log, note: '' };
  const text = readFileSync(r.log, 'utf8');
  if (r.timedOut) { step.note = 'timed out'; return step; }
  if (r.code !== 0) { step.note = `exit ${r.code}`; return step; }
  if (/Segmentation fault|FATAL ERROR|Unhandled Rejection|Unhandled error/.test(text)) { step.note = 'crash string in log'; return step; }
  if (r.name === 'test') {
    if (!existsSync(reportPath)) { step.note = 'vitest report missing'; return step; }
    let rep;
    try { rep = JSON.parse(readFileSync(reportPath, 'utf8')); } catch { step.note = 'vitest report unreadable'; return step; }
    const files = (rep.testResults || []).length;
    step.tests = { total: rep.numTotalTests, passed: rep.numPassedTests, failed: rep.numFailedTests, skipped: (rep.numPendingTests || 0) + (rep.numTodoTests || 0), files };
    if (!rep.numTotalTests) { step.note = 'zero tests ran'; return step; }
    if (rep.numFailedTests || !rep.success) { step.note = `${rep.numFailedTests} failed`; return step; }
    step.note = `${rep.numPassedTests} tests in ${files} files`;
  }
  if (r.name === 'build') {
    // a build that exits 0 without its artifacts is a fail. the list is explicit because not
    // every package emits a dist: agent-skill's build only checks that the skill was built.
    const missing = BUILD_ARTIFACTS.filter((rel) => !existsSync(join(root, rel)));
    if (missing.length) { step.note = `missing build output: ${missing.join(', ')}`; return step; }
  }
  step.result = 'PASS';
  return step;
}

const t0 = Date.now();
const steps = [];
for (const name of verbs[verb]) {
  const r = await run(name);
  const s = judge(r);
  steps.push(s);
  console.log(`${s.result} ${name} (${s.seconds}s)${s.note ? ' - ' + s.note : ''}`);
  if (s.result === 'FAIL') {
    if (name === 'test' && existsSync(reportPath)) {
      try {
        const rep = JSON.parse(readFileSync(reportPath, 'utf8'));
        const bad = [];
        for (const f of rep.testResults || []) for (const a of f.assertionResults || []) if (a.status === 'failed') bad.push(`${a.fullName} (${f.name.split(root).join('').split(String.fromCharCode(92)).join('/')})`);
        for (const b of bad.slice(0, 8)) console.log(`  failing: ${b}`);
      } catch { /* fall through to log lines */ }
    }
    for (const l of firstErrors(r.log)) console.log(`  ${l.slice(0, 200)}`);
    break; // later steps would only hide the first cause
  }
}

const ok = steps.length === verbs[verb].length && steps.every((s) => s.result === 'PASS');
const secs = Math.round((Date.now() - t0) / 100) / 10;
const failed = steps.find((s) => s.result === 'FAIL');
const tt = steps.find((s) => s.tests)?.tests;
const note = ok ? `${steps.length} steps${tt ? `, ${tt.passed} tests` : ''}` : `${failed?.name} failed`;
const summary = { verb, result: ok ? 'PASS' : 'FAIL', seconds: secs, root, runDir, steps };
writeFileSync(join(root, '.runs', 'verify', 'latest.json'), JSON.stringify(summary, null, 2));
console.log(`${ok ? 'PASS' : 'FAIL'} ${verb} (${secs}s) - ${note}. logs ${runDir}`);
process.exit(ok ? 0 : 1);
