#!/usr/bin/env node
// proves the drift marks end to end. usage: node tools/e2e-drift-marks.mjs [--no-build]
// copies the fixture to a temp folder, starts the live server on a free port, opens the page headless,
// then writes a canned drift report (one drift, one aligned, one unclear) and checks the marks,
// a changed report, a stale mark after a bound file is edited, a removed report and a broken one.
// no model call: the report is canned. a spawn spy in the server proves it starts no model process.
// prints one line per step, then PASS|FAIL e2e-drift-marks (time) - note. exit 0 only on pass.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const t0 = Date.now();
const secs = (from = t0) => Math.round((Date.now() - from) / 100) / 10;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = join(root, '.runs', 'e2e-drift-marks', stamp);
mkdirSync(runDir, { recursive: true });

// limits for the acceptance checks in the lane note
const MARK_LIMIT_MS = 2000;
const STALE_LIMIT_MS = 2000;
const STOP_LIMIT_MS = 10000;

const fixture = join(root, 'tests', 'fixtures', 'live-workspace');
const cli = join(root, 'packages', 'skill', 'src', 'live', 'cli.ts');
const webDir = join(root, 'packages', 'webview', 'dist');
let work = null;
let server = null;
let browser = null;
const lines = [];

function killServer() {
  if (!server || server.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
  else server.kill('SIGKILL');
}
async function finish(ok, note) {
  if (browser) await browser.close().catch(() => {});
  killServer();
  if (work) rmSync(work, { recursive: true, force: true });
  console.log(`${ok ? 'PASS' : 'FAIL'} e2e-drift-marks (${secs()}s) - ${note}`);
  process.exit(ok ? 0 : 1);
}
const fail = (note) => finish(false, note);
process.on('SIGINT', () => void fail('interrupted'));

function freePort() {
  return new Promise((ok, bad) => {
    const s = createServer();
    s.on('error', bad);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
  });
}
function portOpen(port) {
  return new Promise((ok) => {
    const c = createConnection({ port, host: '127.0.0.1' });
    c.once('connect', () => { c.destroy(); ok(true); });
    c.once('error', () => ok(false));
  });
}
function waitForLine(re, ms) {
  return new Promise((ok) => {
    const t = setTimeout(() => ok(null), ms);
    const iv = setInterval(() => {
      const hit = lines.find((l) => re.test(l));
      if (hit) { clearTimeout(t); clearInterval(iv); ok(hit); } else if (server.exitCode !== null) { clearTimeout(t); clearInterval(iv); ok(null); }
    }, 100);
  });
}
async function stopServer() {
  if (!server || server.exitCode !== null) return true;
  const exited = new Promise((ok) => server.once('exit', () => ok(true)));
  server.stdin.write('stop\n');
  return Promise.race([exited, new Promise((ok) => setTimeout(() => ok(false), STOP_LIMIT_MS))]);
}

// a canned DriftPairReport, every field the schema asks for
const pair = (node_id, verdict, evidence, suggested_action, commit = 'a1b2c3d') => ({
  commit, node_id, targets: [], decided_by: 'judge', verdict, confidence: 'inferred', certainty: 'high',
  evidence, evidence_in_diff: true, suggested_action, truncated: false, diff_chars: 120, cost_usd: 0, seconds: 0, judge_model: null, error: null,
});
let reportN = 0;
// written the way tools/drift.mjs writes it: a report folder, then latest.json naming it
function writeReport(text) {
  reportN += 1;
  const dir = join(work, '.runs', 'drift', `run-${reportN}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'report.json');
  writeFileSync(file, text);
  writeFileSync(join(work, '.runs', 'drift', 'latest.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', report: file }));
}
const reportOf = (pairs) => JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', args: [], report: { mode: 'range', pairs } });

const ADDS = 'intent-adds-numbers';
const GREETS = 'intent-greets-by-name';
const NONE = 'intent-has-no-checks';
const sel = (id, what) => `.react-flow__node[data-id="${id}"] ${what}`;

try {
  if (!args.includes('--no-build')) {
    const b = spawnSync('pnpm --filter @intentgraph/webview build', { cwd: root, shell: true, encoding: 'utf8' });
    writeFileSync(join(runDir, 'webview-build.log'), (b.stdout || '') + (b.stderr || ''));
    if (b.status !== 0) await fail(`webview build failed, see ${join(runDir, 'webview-build.log')}`);
  }
  if (!existsSync(join(webDir, 'index.html'))) await fail('no webview build, drop --no-build');
  console.log(`ok webview (${secs()}s) - ${webDir}`);

  // static half of the no-model check: nothing in the live server imports or names the drift judge
  const liveDir = join(root, 'packages', 'skill', 'src', 'live');
  const offenders = readdirSync(liveDir).filter((f) => /\.ts$/.test(f)).filter((f) => /from '\.\.\/drift\/|claude-cli|spawn\([^)]*claude/i.test(readFileSync(join(liveDir, f), 'utf8')));
  if (offenders.length) await fail(`live server code reaches the judge: ${offenders.join(', ')}`);

  work = mkdtempSync(join(tmpdir(), 'intentgraph-drift-'));
  cpSync(fixture, work, { recursive: true });
  // dynamic half: a preload that logs every process the server starts, so the log can be searched for a model
  const spawnLog = join(work, '..', `ig-spawns-${stamp}.log`);
  const preload = join(work, '..', `ig-spy-${stamp}.mjs`);
  writeFileSync(preload, [
    "import cp from 'node:child_process';",
    "import { syncBuiltinESMExports } from 'node:module';",
    "import { appendFileSync } from 'node:fs';",
    `const log = ${JSON.stringify(spawnLog)};`,
    "for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {",
    '  const real = cp[name];',
    "  cp[name] = function (...a) { appendFileSync(log, name + ' ' + a.filter((x) => typeof x === 'string' || Array.isArray(x)).map((x) => [].concat(x).join(' ')).join(' ') + '\\n'); return real.apply(this, a); };",
    '}',
    'syncBuiltinESMExports();',
  ].join('\n'));
  writeFileSync(spawnLog, '');
  const spawnCount = () => readFileSync(spawnLog, 'utf8').split('\n').filter(Boolean).length;

  const port = await freePort();
  const log = createWriteStream(join(runDir, 'server.log'));
  server = spawn(process.execPath, ['--import', pathToFileURL(preload).href, '--import', 'tsx', cli, '--root', work, '--port', String(port), '--web', webDir], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  server.stdout.on('data', (d) => {
    log.write(d);
    buf += d.toString();
    const parts = buf.split(/\r?\n/);
    buf = parts.pop();
    for (const l of parts) lines.push(l);
  });
  server.stderr.on('data', (d) => log.write(d));
  const liveLine = await waitForLine(/^live: /, 60000);
  if (!liveLine) await fail(`server did not start, see ${join(runDir, 'server.log')}`);
  const url = liveLine.slice('live: '.length).trim();
  console.log(`ok server (${secs()}s) - ${url}`);

  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  let loads = 0;
  page.on('load', () => { loads += 1; });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction((id) => document.querySelector(`.react-flow__node[data-id="${id}"] [data-check-status="verified"]`), ADDS, { timeout: 30000 });
  await page.evaluate(() => { window.__e2eMarker = 'same-page'; });
  const loadsStart = loads;

  const drifts = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.react-flow__node [data-drift]')].map((e) => [e.closest('.react-flow__node').getAttribute('data-id'), `${e.getAttribute('data-drift')}${e.getAttribute('data-drift-stale') === 'true' ? '+stale' : ''}`])));
  const waitDrifts = async (want, ms) => {
    const end = Date.now() + ms;
    let got = await drifts();
    while (JSON.stringify(got) !== JSON.stringify(want) && Date.now() < end) {
      await page.waitForTimeout(50);
      got = await drifts();
    }
    return { ok: JSON.stringify(got) === JSON.stringify(want), got };
  };
  const graph = async () => (await fetch(`${url}graph.json`)).json();

  // 1 no report: no marks, no problem
  const before = await waitDrifts({}, 500);
  if (!before.ok) await fail(`marks before any report: ${JSON.stringify(before.got)}`);
  if ((await graph()).problems.length !== 0) await fail('problems before any report');
  console.log(`ok no report (${secs()}s) - no drift marks, no problems`);

  // 2 three marks within 2 s of the report being written
  const spawnsBefore = spawnCount();
  const tWrite = Date.now();
  writeReport(reportOf([
    pair(ADDS, 'drift', 'return a + b became return a - b', 'restore the sum or change the intent', 'd00d001'),
    pair(ADDS, 'aligned', 'whitespace only', 'none', 'd00d000'),
    pair(GREETS, 'aligned', 'a rename inside greet', 'none'),
    pair(NONE, 'unclear', 'the diff touches a helper the intent does not name', 'ask the owner'),
  ]));
  const three = await waitDrifts({ [ADDS]: 'drift', [GREETS]: 'aligned', [NONE]: 'unclear' }, MARK_LIMIT_MS);
  const threeMs = Date.now() - tWrite;
  if (!three.ok) await fail(`marks did not show within ${MARK_LIMIT_MS} ms: ${JSON.stringify(three.got)}`);
  const words = await page.evaluate(() => [...document.querySelectorAll('[data-drift]')].map((e) => e.textContent.trim()));
  if (!['drift', 'aligned', 'unclear'].every((w) => words.includes(w))) await fail(`marks have no word: ${JSON.stringify(words)}`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(runDir, '01-drift-marks.jpg'), type: 'jpeg', quality: 82 });
  console.log(`ok marks (${secs()}s) - drift, aligned, unclear in ${threeMs} ms, words ${words.join('/')}`);

  // 2b the panel for the selected node: verdict, evidence, commit, action. worst of two entries wins.
  await page.locator(`.react-flow__node[data-id="${ADDS}"]`).click();
  try {
    await page.locator('[data-drift-evidence]').waitFor({ timeout: 3000 });
  } catch {
    await fail('side panel shows no drift evidence');
  }
  const panel = await page.evaluate(() => ({
    evidence: document.querySelector('[data-drift-evidence]')?.textContent,
    commit: document.querySelector('[data-drift-commit]')?.textContent,
    action: document.querySelector('[data-drift-action]')?.textContent,
    verdict: document.querySelector('[data-drift-panel]')?.getAttribute('data-drift-panel'),
    entries: document.querySelector('[data-drift-panel]')?.textContent,
  }));
  if (panel.verdict !== 'drift' || panel.commit !== 'd00d001' || !/a - b/.test(panel.evidence || '') || !/restore the sum/.test(panel.action || '') || !/2 entries/.test(panel.entries || '')) await fail(`panel wrong: ${JSON.stringify(panel)}`);
  await page.screenshot({ path: join(runDir, '02-drift-panel.jpg'), type: 'jpeg', quality: 82 });
  console.log(`ok panel (${secs()}s) - drift, commit ${panel.commit}, evidence and action shown, 2 entries`);

  // 3 a changed report updates the mark and the panel with no reload
  const tChange = Date.now();
  writeReport(reportOf([
    pair(ADDS, 'aligned', 'the sum is back', 'none', 'e11e002'),
    pair(GREETS, 'drift', 'greet drops the name', 'restore the name', 'e11e003'),
    pair(NONE, 'unclear', 'still unsure', 'ask the owner'),
  ]));
  const changed = await waitDrifts({ [ADDS]: 'aligned', [GREETS]: 'drift', [NONE]: 'unclear' }, MARK_LIMIT_MS);
  if (!changed.ok) await fail(`changed report not shown within ${MARK_LIMIT_MS} ms: ${JSON.stringify(changed.got)}`);
  const changeMs = Date.now() - tChange;
  await page.waitForFunction(() => document.querySelector('[data-drift-evidence]')?.textContent === 'the sum is back', null, { timeout: 2000 }).catch(() => {});
  const evidenceNow = await page.locator('[data-drift-evidence]').textContent();
  if (evidenceNow !== 'the sum is back') await fail(`panel kept old evidence: ${evidenceNow}`);
  if ((await page.evaluate(() => window.__e2eMarker)) !== 'same-page' || loads !== loadsStart) await fail('page reloaded on a report change');
  console.log(`ok changed report (${secs()}s) - marks and panel updated in ${changeMs} ms, no reload`);

  // the two report writes so far started no process at all
  if (spawnCount() !== spawnsBefore) await fail(`report writes started ${spawnCount() - spawnsBefore} process(es)`);

  // 4 a bound source file edited after the report makes its mark stale
  await page.waitForTimeout(100);
  const mathFile = join(work, 'src', 'math.ts');
  const tEdit = Date.now();
  writeFileSync(mathFile, `${readFileSync(mathFile, 'utf8')}\n// touched after the report\n`);
  const stale = await waitDrifts({ [ADDS]: 'aligned+stale', [GREETS]: 'drift', [NONE]: 'unclear' }, STALE_LIMIT_MS + 1000);
  const staleMs = Date.now() - tEdit;
  if (!stale.ok) await fail(`stale mark not shown: ${JSON.stringify(stale.got)}`);
  if (staleMs > STALE_LIMIT_MS) await fail(`stale mark took ${staleMs} ms, limit ${STALE_LIMIT_MS}`);
  const staleText = await page.locator(sel(ADDS, '[data-drift]')).textContent();
  const staleOpacity = await page.locator(sel(ADDS, '[data-drift]')).evaluate((e) => Number(getComputedStyle(e).opacity));
  const staleNote = await page.locator('[data-drift-stale-note]').count();
  if (!/stale/.test(staleText || '') || staleOpacity >= 1 || staleNote !== 1) await fail(`stale mark does not look stale: "${staleText}" opacity ${staleOpacity} note ${staleNote}`);
  await page.screenshot({ path: join(runDir, '03-drift-stale.jpg'), type: 'jpeg', quality: 82 });
  console.log(`ok stale (${secs()}s) - dimmed and worded "${staleText}" in ${staleMs} ms, panel says so`);

  // 5 a broken report: one problem, no mark from it
  const tBreak = Date.now();
  writeReport('{ not json at all');
  const gone = await waitDrifts({}, MARK_LIMIT_MS);
  if (!gone.ok) await fail(`marks stayed after a broken report: ${JSON.stringify(gone.got)}`);
  let g = await graph();
  const t1 = Date.now();
  while (g.problems.length !== 1 && Date.now() - t1 < 1500) { await page.waitForTimeout(100); g = await graph(); }
  if (g.problems.length !== 1 || !/^\.runs\/drift\/run-\d+\/report\.json$/.test(g.problems[0].file)) await fail(`want one problem for the report, got ${JSON.stringify(g.problems)}`);
  if (g.nodes.some((n) => n.drift)) await fail('a broken report still marked a node');
  // lane 12: the bar's count is the one place a problem shows, and it opens the list with the report's file
  await page.waitForFunction(() => document.querySelector('[data-bar-count="problems"]')?.getAttribute('data-count') === '1', null, { timeout: 2000 });
  await page.locator('[data-state-bar] [data-bar-count="problems"]').click();
  await page.locator(`[data-problem-file="${g.problems[0].file}"]`).waitFor({ timeout: 2000 });
  await page.keyboard.press('Escape');
  console.log(`ok broken report (${secs()}s) - 1 problem "${g.problems[0].message}", no marks, in ${Date.now() - tBreak} ms`);

  // a schema mismatch counts the same
  writeReport(JSON.stringify({ report: { pairs: [{ node_id: ADDS, verdict: 'maybe' }] } }));
  await page.waitForTimeout(1200);
  g = await graph();
  if (g.problems.length !== 1 || !/schema/.test(g.problems[0].message) || g.nodes.some((n) => n.drift)) await fail(`schema mismatch: ${JSON.stringify(g.problems)}`);
  console.log(`ok schema mismatch (${secs()}s) - 1 problem, no marks`);

  // 6 a good report again, then removing the report folder takes the marks away and clears the problem
  writeReport(reportOf([pair(GREETS, 'drift', 'again', 'fix')]));
  const again = await waitDrifts({ [GREETS]: 'drift' }, MARK_LIMIT_MS);
  if (!again.ok) await fail(`good report after a broken one: ${JSON.stringify(again.got)}`);
  if ((await graph()).problems.length !== 0) await fail('problem stayed after a good report');
  const tRemove = Date.now();
  rmSync(join(work, '.runs'), { recursive: true, force: true });
  const removed = await waitDrifts({}, MARK_LIMIT_MS);
  if (!removed.ok) await fail(`marks stayed after the report was removed: ${JSON.stringify(removed.got)}`);
  if ((await graph()).problems.length !== 0) await fail('problem after removal');
  console.log(`ok removed (${secs()}s) - marks gone in ${Date.now() - tRemove} ms, no problems`);

  // 7 no model process
  const spawnsAfter = spawnCount();
  const all = readFileSync(spawnLog, 'utf8');
  if (/claude|drift\.mjs|tools[\\/]drift/i.test(all)) await fail(`the server started a model or drift process: ${all.split('\n').find((l) => /claude|drift/i.test(l))}`);
  console.log(`ok no model (${secs()}s) - ${spawnsAfter} processes started in all (linked test runs), none named claude or drift, 0 during the report writes`);
  if (errors.length) await fail(`${errors.length} console error(s): ${errors[0].slice(0, 160)}`);
  await browser.close();
  browser = null;

  // 8 clean stop
  if (!(await stopServer())) await fail(`server did not exit within ${STOP_LIMIT_MS} ms of stop`);
  let open = await portOpen(port);
  for (let i = 0; i < 25 && open; i++) { await new Promise((r) => setTimeout(r, 200)); open = await portOpen(port); }
  if (open) await fail(`port ${port} still open after stop`);
  rmSync(spawnLog, { force: true });
  rmSync(preload, { force: true });
  console.log(`ok stop (${secs()}s) - exit ${server.exitCode}, port closed`);
  await finish(true, `marks ${threeMs} ms, change ${changeMs} ms, stale ${staleMs} ms, no model process, frames in ${runDir}`);
} catch (e) {
  await fail(`crashed: ${String((e && e.message) || e).split('\n')[0]}`);
}
