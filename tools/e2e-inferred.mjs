#!/usr/bin/env node
// proves inferred intents on the graph end to end. usage: node tools/e2e-inferred.mjs [--no-build]
// copies the fixture to a temp folder, writes a canned inference report, starts a --write live server
// on a free port and drives the page headless with real keys and clicks: the proposals show dashed with
// their words, Enter accepts into a file with realized_by, a double-click and a new title accept under
// that title, Delete dismisses, Undo takes each back byte for byte, the strip count follows, a new report
// keeps a dismissed id hidden, and a read only server sends nothing. no model call: the report is canned,
// and a spawn spy in the server proves it starts no model process.
// prints one line per step, then PASS|FAIL e2e-inferred (time) - note. exit 0 only on pass.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const t0 = Date.now();
const secs = (from = t0) => Math.round((Date.now() - from) / 100) / 10;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = join(root, '.runs', 'e2e-inferred', stamp);
mkdirSync(runDir, { recursive: true });

// limits for the checks: a write or a report shows on the page within this
const SHOW_LIMIT_MS = 4000;
const STOP_LIMIT_MS = 10000;

const fixture = join(root, 'tests', 'fixtures', 'live-workspace');
const cli = join(root, 'packages', 'skill', 'src', 'live', 'cli.ts');
const webDir = join(root, 'packages', 'webview', 'dist');
let work = null;
const servers = [];
let browser = null;

function killAll() {
  for (const s of servers) {
    if (s.proc.exitCode !== null) continue;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(s.proc.pid), '/t', '/f'], { stdio: 'ignore' });
    else s.proc.kill('SIGKILL');
  }
}
async function finish(ok, note) {
  if (browser) await browser.close().catch(() => {});
  killAll();
  if (work) rmSync(work, { recursive: true, force: true });
  console.log(`${ok ? 'PASS' : 'FAIL'} e2e-inferred (${secs()}s) - ${note}`);
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

async function startServer(name, write, preload) {
  const port = await freePort();
  const log = createWriteStream(join(runDir, `${name}.log`));
  const proc = spawn(process.execPath, ['--import', pathToFileURL(preload).href, '--import', 'tsx', cli, '--root', work, '--port', String(port), '--web', webDir, ...(write ? ['--write'] : [])], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  const s = { name, port, proc, lines: [] };
  servers.push(s);
  let buf = '';
  proc.stdout.on('data', (d) => {
    log.write(d);
    buf += d.toString();
    const parts = buf.split(/\r?\n/);
    buf = parts.pop();
    for (const l of parts) s.lines.push(l);
  });
  proc.stderr.on('data', (d) => log.write(d));
  const end = Date.now() + 60000;
  while (Date.now() < end && proc.exitCode === null && !s.lines.some((l) => l.startsWith('live: '))) await new Promise((r) => setTimeout(r, 100));
  const live = s.lines.find((l) => l.startsWith('live: '));
  if (!live) await fail(`${name} did not start, see ${join(runDir, `${name}.log`)}`);
  s.url = live.slice('live: '.length).trim();
  return s;
}
async function stopServer(s) {
  if (s.proc.exitCode !== null) return true;
  const exited = new Promise((ok) => s.proc.once('exit', () => ok(true)));
  s.proc.stdin.write('stop\n');
  const done = await Promise.race([exited, new Promise((ok) => setTimeout(() => ok(false), STOP_LIMIT_MS))]);
  if (!done) return false;
  let open = await portOpen(s.port);
  for (let i = 0; i < 25 && open; i++) { await new Promise((r) => setTimeout(r, 200)); open = await portOpen(s.port); }
  return !open;
}

// a canned proposal row, every field InferProposalRowSchema asks for
const row = (id, title, anchors, over = {}) => ({
  id, folder: 'src', title, body: `${title}. Read from the code in src.`, anchors, belongs_under: 'concept-calculator', restates: null, confidence: 'inferred', planned: false, code_hash: `hash-${id}`, ...over,
});
const P_ADD = row('inf-add', 'Adds numbers for the calculator', ['src/math.ts#add', 'src/math.ts']);
const P_GREET = row('inf-greet', 'Greets a person by their name', ['src/greet.ts#greet', 'src/greet.ts'], { restates: 'intent-greets-by-name', confidence: 'semantic' });
const P_PLAN = row('inf-plan', 'Keeps a helper for later', ['src/math.ts', 'src/greet.ts'], { planned: true, belongs_under: null, confidence: 'semantic' });
const P_NEW = row('inf-new', 'Checks the sum of two numbers', ['src/math.ts#add', 'tests/math.test.ts']);
let reportN = 0;
// written the way tools/infer.mjs writes it: a run folder, then latest.json naming it relative to the root
function writeReport(proposals) {
  reportN += 1;
  const dir = join(work, '.runs', 'infer', `run-${reportN}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', report: { incomplete: false, stopped: null, proposals } }));
  writeFileSync(join(work, '.runs', 'infer', 'latest.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', report: `.runs/infer/run-${reportN}/report.json` }));
}

// every byte under spec/, so an undo can be checked byte for byte
function specBytes() {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[relative(work, p).split('\\').join('/')] = readFileSync(p).toString('base64');
    }
  };
  walk(join(work, 'spec'));
  return out;
}
const sameBytes = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const settledFile = () => join(work, '.runs', 'infer', 'settled.json');
const readOr = (f) => (existsSync(f) ? readFileSync(f).toString('base64') : null);

const node = (id) => `.react-flow__node[data-id="${id}"]`;
const inf = (p) => `inferred:${p.id}`;

try {
  if (!args.includes('--no-build')) {
    const b = spawnSync('pnpm --filter @intentgraph/webview build', { cwd: root, shell: true, encoding: 'utf8' });
    writeFileSync(join(runDir, 'webview-build.log'), (b.stdout || '') + (b.stderr || ''));
    if (b.status !== 0) await fail(`webview build failed, see ${join(runDir, 'webview-build.log')}`);
  }
  if (!existsSync(join(webDir, 'index.html'))) await fail('no webview build, drop --no-build');
  console.log(`ok webview (${secs()}s) - ${webDir}`);

  // static half of the no-model check: nothing in the live server reaches the inference runner or a model cli
  const liveDir = join(root, 'packages', 'skill', 'src', 'live');
  const offenders = readdirSync(liveDir).filter((f) => /\.ts$/.test(f)).filter((f) => /from '\.\.\/infer\/|from '\.\.\/drift\/|claude-cli|spawn\([^)]*claude/i.test(readFileSync(join(liveDir, f), 'utf8')));
  if (offenders.length) await fail(`live server code reaches a model: ${offenders.join(', ')}`);

  work = mkdtempSync(join(tmpdir(), 'intentgraph-inferred-'));
  cpSync(fixture, work, { recursive: true });
  writeReport([P_ADD, P_GREET, P_PLAN]);
  // dynamic half: a preload that logs every process the server starts
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

  const srv = await startServer('server-write', true, preload);
  console.log(`ok server (${secs()}s) - ${srv.url} with --write`);

  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(srv.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-inferred]').length === 3, null, { timeout: 30000 });
  await page.waitForTimeout(400);

  const count = () => page.evaluate(() => Number(document.querySelector('[data-inferred-count]')?.getAttribute('data-inferred-count') ?? 0));
  const waitCount = async (want) => {
    const end = Date.now() + SHOW_LIMIT_MS;
    while ((await count()) !== want && Date.now() < end) await page.waitForTimeout(50);
    return count();
  };
  const waitFile = async (f, want) => {
    const end = Date.now() + SHOW_LIMIT_MS;
    while (existsSync(f) !== want && Date.now() < end) await page.waitForTimeout(50);
    return existsSync(f) === want;
  };
  // the canvas draws only what is in view, so presence is read from the graph the page is fed
  const graphIds = async () => ((await (await fetch(`${srv.url}graph.json`)).json()).nodes.map((n) => n.id));
  const waitNode = async (id, want) => {
    const end = Date.now() + SHOW_LIMIT_MS;
    while ((await graphIds()).includes(id) !== want && Date.now() < end) await page.waitForTimeout(50);
    return (await graphIds()).includes(id) === want;
  };
  // the count in the strip selects the next proposal and the page brings it into view, so a step
  // reaches the node it wants the way a person would, then clicks it so the keys go to the canvas
  const clickNode = async (p, id) => {
    const pid = id.slice('inferred:'.length);
    const shown = () => p.evaluate(() => document.querySelector('[data-inferred-panel]')?.getAttribute('data-inferred-panel') ?? null);
    for (let i = 0; i < 6 && (await shown()) !== pid; i++) {
      const was = await shown();
      await p.locator('[data-inferred-count] button').click();
      // the panel opens once the selection settles, wait for it before deciding to click again
      await p.waitForFunction((w) => (document.querySelector('[data-inferred-panel]')?.getAttribute('data-inferred-panel') ?? null) !== w, was, { timeout: SHOW_LIMIT_MS });
    }
    await p.locator(`[data-inferred-panel="${pid}"]`).waitFor({ timeout: SHOW_LIMIT_MS });
    // the view settles after a selection before it pans
    await p.waitForTimeout(700);
    await p.locator(node(id)).click({ position: { x: 30, y: 60 } });
  };

  // 1 the proposals show beside the declared intents, dashed and worded, never by colour alone
  const look = await page.evaluate(() => [...document.querySelectorAll('[data-inferred]')].map((e) => ({
    id: e.getAttribute('data-inferred'),
    border: getComputedStyle(e).borderTopStyle,
    opacity: Number(getComputedStyle(e).opacity),
    words: [...e.querySelectorAll('[data-inferred-word]')].map((w) => w.textContent.trim()),
    same: e.querySelector('[data-inferred-same]')?.textContent.trim() ?? null,
  })));
  const byId = Object.fromEntries(look.map((l) => [l.id, l]));
  if (look.some((l) => l.border !== 'dashed' || l.words[0] !== 'inferred')) await fail(`not dashed or not worded: ${JSON.stringify(look)}`);
  if (!byId['inf-add'].words.includes('confidence inferred') || !byId['inf-greet'].words.includes('confidence semantic')) await fail(`no confidence word: ${JSON.stringify(look)}`);
  if (!byId['inf-plan'].words.includes('planned') || byId['inf-plan'].opacity >= byId['inf-add'].opacity) await fail(`planned is not marked and fainter: ${JSON.stringify(byId['inf-plan'])}`);
  if (byId['inf-greet'].same !== 'same as Greeting uses the given name' && !/^same as /.test(byId['inf-greet'].same ?? '')) await fail(`restated proposal does not say same as: ${byId['inf-greet'].same}`);
  const declared = await page.evaluate(() => [...document.querySelectorAll('.react-flow__node-intent')].filter((e) => !e.querySelector('[data-inferred]')).length);
  if (declared < 3) await fail(`declared intents not drawn beside the proposals: ${declared}`);
  const solidDeclared = await page.evaluate(() => getComputedStyle(document.querySelector('.react-flow__node[data-id="intent-adds-numbers"] .ig-node-body')).borderTopStyle);
  if (solidDeclared !== 'solid') await fail(`declared intent is not solid: ${solidDeclared}`);
  if ((await waitCount(3)) !== 3) await fail(`strip count is ${await count()}, want 3`);
  const stripText = await page.locator('[data-inferred-count] button').textContent();
  if (stripText.trim() !== '3 inferred') await fail(`strip says "${stripText}"`);
  await page.screenshot({ path: join(runDir, '01-inferred-beside-declared.jpg'), type: 'jpeg', quality: 82 });
  await page.locator('[data-inferred-count]').screenshot({ path: join(runDir, '04-count-in-strip.jpg'), type: 'jpeg', quality: 90 });
  console.log(`ok look (${secs()}s) - 3 dashed with "inferred" and the confidence word, planned fainter, same as shown, ${declared} declared solid, strip "${stripText.trim()}"`);

  // 2 a click on the count selects the next one and its panel shows body, folder and evidence
  await page.locator('[data-inferred-count] button').click();
  await page.locator('[data-inferred-panel]').waitFor({ timeout: 3000 });
  const panel = await page.evaluate(() => ({
    id: document.querySelector('[data-inferred-panel]')?.getAttribute('data-inferred-panel'),
    body: document.querySelector('[data-inferred-body]')?.textContent,
    folder: document.querySelector('[data-inferred-folder]')?.textContent,
    evidence: [...document.querySelectorAll('[data-inferred-evidence] li')].map((l) => l.textContent),
  }));
  if (panel.id !== 'inf-add' || !/Read from the code/.test(panel.body ?? '') || panel.folder !== 'src' || panel.evidence.join(',') !== 'src/math.ts#add,src/math.ts') await fail(`panel wrong: ${JSON.stringify(panel)}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(runDir, '02-inferred-panel.jpg'), type: 'jpeg', quality: 82 });
  console.log(`ok panel (${secs()}s) - count click selected ${panel.id}, body, folder ${panel.folder}, ${panel.evidence.length} evidence lines`);

  // 3 Enter accepts: a real intent file with realized_by, the notice with Undo, the count goes down one
  const spec0 = specBytes();
  const settled0 = readOr(settledFile());
  await clickNode(page, inf(P_ADD));
  await page.keyboard.press('Enter');
  const addFile = join(work, 'spec', 'intents', 'adds-numbers-for-the-calculator.md');
  if (!(await waitFile(addFile, true))) await fail('Enter did not write the intent file');
  const addText = readFileSync(addFile, 'utf8');
  if (!/realized_by:\n {2}- src\/math\.ts#add\n {2}- src\/math\.ts\n/.test(addText) || !/parent: concept-calculator/.test(addText) || !/Read from the code in src\./.test(addText)) await fail(`accepted file is wrong:\n${addText}`);
  if ((await waitCount(2)) !== 2) await fail(`count after accept is ${await count()}, want 2`);
  if (!(await waitNode('intent-adds-numbers-for-the-calculator', true))) await fail('accepted intent is not drawn');
  const turned = await page.evaluate(() => {
    const e = document.querySelector('.react-flow__node[data-id="intent-adds-numbers-for-the-calculator"] .ig-node-body');
    return { border: getComputedStyle(e).borderTopStyle, inferred: e.hasAttribute('data-inferred') };
  });
  if (turned.border !== 'solid' || turned.inferred) await fail(`accepted node did not turn solid: ${JSON.stringify(turned)}`);
  const notice = await page.locator('[data-notice="done"]').textContent({ timeout: 3000 });
  if (!/^Accepted "Adds numbers for the calculator" as spec\/intents\/adds-numbers-for-the-calculator\.md\./.test(notice ?? '')) await fail(`accept notice: ${notice}`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(runDir, '03-accepted-with-notice.jpg'), type: 'jpeg', quality: 82 });
  console.log(`ok accept (${secs()}s) - Enter wrote ${relative(work, addFile).split('\\').join('/')} with realized_by, node solid, notice "${notice.replace(/Undo$/, '').trim()}", count 2`);

  // 4 Undo on the notice takes it back byte for byte
  await page.locator('[data-notice-undo]').click();
  if (!(await waitFile(addFile, false))) await fail('undo did not remove the accepted file');
  if (!sameBytes(specBytes(), spec0)) await fail('spec/ is not byte for byte as before the accept');
  if ((await waitCount(3)) !== 3) await fail(`count after undo is ${await count()}, want 3`);
  if (!(await waitNode(inf(P_ADD), true))) await fail('proposal did not come back after undo');
  console.log(`ok undo accept (${secs()}s) - file removed, spec/ byte for byte, proposal back, count 3`);

  // 5 a double-click opens the rename field, a new title and Enter accept under that title
  await clickNode(page, inf(P_ADD));
  await page.locator(node(inf(P_ADD))).locator('[data-node-title]').dblclick();
  await page.locator(`[data-rename-field="${inf(P_ADD)}"]`).waitFor({ timeout: 3000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Sums two numbers: a + b');
  await page.keyboard.press('Enter');
  const sumFile = join(work, 'spec', 'intents', 'sums-two-numbers-a-b.md');
  if (!(await waitFile(sumFile, true))) await fail('double-click, new title and Enter did not write the file');
  const sumText = readFileSync(sumFile, 'utf8');
  if (!/^title: 'Sums two numbers: a \+ b'$/m.test(sumText) || !/realized_by:/.test(sumText)) await fail(`renamed accept is wrong:\n${sumText}`);
  if ((await waitCount(2)) !== 2) await fail(`count after renamed accept is ${await count()}, want 2`);
  const renamedNotice = await page.locator('[data-notice="done"]').textContent({ timeout: 3000 });
  if (!/Sums two numbers: a \+ b/.test(renamedNotice ?? '')) await fail(`renamed accept notice: ${renamedNotice}`);
  console.log(`ok edit first (${secs()}s) - double-click, typed title, Enter wrote ${relative(work, sumFile).split('\\').join('/')}, count 2`);

  // Ctrl+Z takes it back byte for byte
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  if (!(await waitFile(sumFile, false))) await fail('Ctrl+Z did not remove the renamed accept');
  if (!sameBytes(specBytes(), spec0)) await fail('spec/ is not byte for byte after Ctrl+Z');
  if ((await waitCount(3)) !== 3) await fail(`count after Ctrl+Z is ${await count()}, want 3`);
  console.log(`ok undo edit (${secs()}s) - Ctrl+Z removed it, spec/ byte for byte, count 3`);

  // 6 Delete dismisses: only .runs/infer changes, the node goes, the count goes down one, Undo puts the bytes back
  if (!(await waitNode(inf(P_GREET), true))) await fail('restated proposal is not drawn');
  const settled1 = readOr(settledFile());
  await clickNode(page, inf(P_GREET));
  await page.locator('[data-inferred-panel="inf-greet"]').waitFor({ timeout: 3000 });
  const greetPanelSame = await page.locator('[data-inferred-panel] [data-inferred-same]').textContent();
  if (!/^Same as /.test(greetPanelSame.trim())) await fail(`panel of a restated proposal: ${greetPanelSame}`);
  await page.keyboard.press('Delete');
  if (!(await waitNode(inf(P_GREET), false))) await fail('Delete did not remove the proposal');
  if ((await waitCount(2)) !== 2) await fail(`count after dismiss is ${await count()}, want 2`);
  if (!sameBytes(specBytes(), spec0)) await fail('dismiss touched spec/');
  const dismissed = JSON.parse(readFileSync(settledFile(), 'utf8')).dismissed;
  if (!dismissed.some((d) => d.id === 'inf-greet' && d.code_hash === 'hash-inf-greet')) await fail(`settled list: ${JSON.stringify(dismissed)}`);
  const dismissNotice = await page.locator('[data-notice="done"]').textContent({ timeout: 3000 });
  if (!/^Dismissed "Greets a person by their name"/.test(dismissNotice ?? '')) await fail(`dismiss notice: ${dismissNotice}`);
  await page.locator('[data-notice-undo]').click();
  const endU = Date.now() + SHOW_LIMIT_MS;
  while (readOr(settledFile()) !== settled1 && Date.now() < endU) await page.waitForTimeout(50);
  if (readOr(settledFile()) !== settled1) await fail('undo did not put the settled list back byte for byte');
  if ((await waitCount(3)) !== 3) await fail(`count after undo dismiss is ${await count()}, want 3`);
  console.log(`ok dismiss (${secs()}s) - Delete hid it, only .runs/infer/settled.json changed, undo put its bytes back, count 3 (settled ${settled0 === null ? 'made by the first accept' : 'there before'})`);

  // 7 dismiss again, then a new report with the same id and code: it stays hidden, the new one shows
  await clickNode(page, inf(P_GREET));
  await page.keyboard.press('Delete');
  if ((await waitCount(2)) !== 2) await fail(`count after the second dismiss is ${await count()}, want 2`);
  writeReport([P_ADD, P_GREET, P_PLAN, P_NEW]);
  if (!(await waitNode(inf(P_NEW), true))) await fail('the new report did not show its new proposal');
  if ((await waitCount(3)) !== 3) await fail(`count after the new report is ${await count()}, want 3`);
  if ((await graphIds()).includes(inf(P_GREET))) await fail('a dismissed id came back on a new report');
  console.log(`ok new report (${secs()}s) - the dismissed id stays hidden, the new proposal shows, count 3`);

  if (errors.length) await fail(`${errors.length} console error(s): ${errors[0].slice(0, 160)}`);
  await page.close();
  if (!(await stopServer(srv))) await fail('write server did not stop cleanly');

  // 8 read only: proposals show, accept, edit and dismiss are disabled with the reason, nothing is sent
  const ro = await startServer('server-read-only', false, preload);
  const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page2.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errors.push(m.text()); });
  page2.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const posts = [];
  page2.on('request', (r) => { if (r.method() !== 'GET') posts.push(r.url()); });
  await page2.goto(ro.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page2.waitForFunction(() => document.querySelectorAll('[data-inferred]').length === 3, null, { timeout: 30000 });
  const specRo = specBytes();
  const settledRo = readOr(settledFile());
  await clickNode(page2, inf(P_ADD));
  await page2.locator('[data-inferred-panel]').waitFor({ timeout: 3000 });
  await page2.keyboard.press('Enter');
  await page2.keyboard.press('Delete');
  await page2.keyboard.press('F2');
  await page2.locator(node(inf(P_ADD))).locator('[data-node-title]').dblclick();
  const buttons = await page2.evaluate(() => ['accept', 'edit', 'dismiss'].map((k) => document.querySelector(`[data-inferred-${k}]`)?.disabled));
  const reason = await page2.locator('[data-inferred-readonly]').textContent();
  await page2.locator(node(inf(P_ADD))).click({ button: 'right', position: { x: 30, y: 60 } });
  const menu = await page2.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((m) => ({ text: m.textContent, disabled: m.getAttribute('aria-disabled') === 'true', reason: m.getAttribute('title') ?? '' })));
  const menuReason = await page2.locator('[data-menu-reason]').textContent().catch(() => '');
  await page2.screenshot({ path: join(runDir, '05-read-only.jpg'), type: 'jpeg', quality: 82 });
  await page2.keyboard.press('Escape');
  await page2.waitForTimeout(500);
  if (buttons.some((d) => d !== true)) await fail(`read only buttons not disabled: ${JSON.stringify(buttons)}`);
  if (!/--write/.test(reason ?? '')) await fail(`read only reason missing: ${reason}`);
  if (menu.length !== 3 || menu.some((m) => !m.disabled) || !menu.every((m) => /--write/.test(m.reason)) || !/--write/.test(menuReason ?? '')) await fail(`read only menu: ${JSON.stringify(menu)} ${menuReason}`);
  if (posts.length) await fail(`read only page sent ${posts.length} write(s): ${posts[0]}`);
  if (!sameBytes(specBytes(), specRo) || readOr(settledFile()) !== settledRo) await fail('read only page changed a file');
  if (await page2.locator('[data-rename-field]').count()) await fail('read only page opened the rename field');
  console.log(`ok read only (${secs()}s) - 3 proposals shown, keys, double-click and menu sent nothing, buttons and menu disabled with "${reason.trim()}"`);
  await page2.close();
  if (!(await stopServer(ro))) await fail('read only server did not stop cleanly');

  // 9 no model process, no console error
  const all = readFileSync(spawnLog, 'utf8');
  if (/claude|infer\.mjs|tools[\\/]infer|drift\.mjs/i.test(all)) await fail(`the server started a model process: ${all.split('\n').find((l) => /claude|infer|drift/i.test(l))}`);
  const spawns = all.split('\n').filter(Boolean).length;
  if (errors.length) await fail(`${errors.length} console error(s): ${errors[0].slice(0, 160)}`);
  console.log(`ok no model (${secs()}s) - ${spawns} processes started in all (linked test runs), none named claude, infer or drift, 0 console errors`);
  rmSync(spawnLog, { force: true });
  rmSync(preload, { force: true });
  const frames = readdirSync(runDir).filter((f) => f.endsWith('.jpg') && statSync(join(runDir, f)).size > 0);
  await finish(true, `accept, edit first, dismiss and undo by keys and clicks, read only sends nothing, ${frames.length} frames in ${relative(root, runDir).split('\\').join('/')}`);
} catch (e) {
  await fail(`crashed: ${String((e && e.message) || e).split('\n')[0]}`);
}
