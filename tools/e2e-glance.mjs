#!/usr/bin/env node
// proves the project state bar, the legend and the robot end to end (lane 11).
// usage: node tools/e2e-glance.mjs [--no-build]
//        node tools/e2e-glance.mjs --frames-only --root <dir> [--no-build]   frames of another workspace, read only
// copies the fixture to a temp folder with a canned inference report and a canned drift report, starts a
// --write live server and drives the page headless with real clicks and keys: every number in the bar equals
// what this script counts in /graph.json, a click on each count selects a node in that state and brings it in
// view, the numbers follow an accept and a changed test with no reload, the legend opens on the first visit and
// stays closed after a reload, the robot sits on every inferred thing and on no declared one, read only is said
// in the bar, and the bar never overlaps the canvas or the side panel. no model call: both reports are canned.
// prints one line per step, then PASS|FAIL e2e-glance (time) - note. exit 0 only on pass.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const framesOnly = args.includes('--frames-only');
const t0 = Date.now();
const secs = (from = t0) => Math.round((Date.now() - from) / 100) / 10;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = join(root, '.runs', framesOnly ? 'e2e-glance-frames' : 'e2e-glance', stamp);
mkdirSync(runDir, { recursive: true });

// limits for the checks: a change shows in the bar within this. the test run after a changed test is slower.
const SHOW_LIMIT_MS = 6000;
const CHECK_LIMIT_MS = 30000;
const STOP_LIMIT_MS = 10000;
// the bar is one row, about this tall
const BAR_MAX_PX = 40;
const FRAME = { type: 'jpeg', quality: 85 };

const fixture = join(root, 'tests', 'fixtures', 'live-workspace');
const cli = join(root, 'packages', 'skill', 'src', 'live', 'cli.ts');
const webDir = join(root, 'packages', 'webview', 'dist');
let work = null;
let ownWork = false;
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
  if (work && ownWork) rmSync(work, { recursive: true, force: true });
  console.log(`${ok ? 'PASS' : 'FAIL'} e2e-glance (${secs()}s) - ${note}`);
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
async function startServer(name, write) {
  const port = await freePort();
  const log = createWriteStream(join(runDir, `${name}.log`));
  const proc = spawn(process.execPath, ['--import', 'tsx', cli, '--root', work, '--port', String(port), '--web', webDir, ...(write ? ['--write'] : [])], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
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
  const end = Date.now() + 90000;
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

// canned reports, written the way tools/infer.mjs and tools/drift.mjs write them
const row = (id, title, anchors, over = {}) => ({
  id, folder: 'src', title, body: `${title}. Read from the code in src.`, anchors, belongs_under: 'concept-calculator', restates: null, confidence: 'inferred', planned: false, code_hash: `hash-${id}`, ...over,
});
function writeInfer(proposals) {
  const dir = join(work, '.runs', 'infer', 'run-1');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', report: { incomplete: false, stopped: null, proposals } }));
  writeFileSync(join(work, '.runs', 'infer', 'latest.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', report: '.runs/infer/run-1/report.json' }));
}
const pair = (node_id, verdict, decided_by) => ({
  commit: 'a1b2c3d', node_id, targets: [], decided_by, verdict, confidence: 'inferred', certainty: 'high',
  evidence: `canned ${verdict}`, evidence_in_diff: true, suggested_action: 'none', truncated: false, diff_chars: 120, cost_usd: 0, seconds: 0, judge_model: null, error: null,
});
function writeDrift(pairs) {
  const dir = join(work, '.runs', 'drift', 'run-1');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'report.json');
  writeFileSync(file, JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', args: [], report: { mode: 'range', pairs } }));
  writeFileSync(join(work, '.runs', 'drift', 'latest.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', report: file }));
}

// the bar's rule, written again from the graph.json fields, so the page is checked against the server
const SPEC = ['concept', 'intent', 'constraint', 'decision'];
function statesOf(n) {
  if (n.inferred) return ['inferred'];
  const out = [];
  if (SPEC.includes(n.kind)) out.push(n.kind);
  if (['verified', 'failed', 'pending'].includes(n.status)) out.push(n.status);
  if (n.drift && ['drift', 'unclear', 'aligned'].includes(n.drift.verdict)) out.push(n.drift.stale ? 'stale' : n.drift.verdict);
  return out;
}
const STATES = [...SPEC, 'verified', 'failed', 'pending', 'drift', 'unclear', 'aligned', 'stale', 'inferred'];
function expected(g) {
  const want = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const n of g.nodes) for (const s of statesOf(n)) want[s] += 1;
  want.problems = (g.problems ?? []).length;
  want.driftReport = g.nodes.some((n) => n.drift);
  return want;
}

try {
  if (!args.includes('--no-build')) {
    const b = spawnSync('pnpm --filter @intentgraph/webview build', { cwd: root, shell: true, encoding: 'utf8' });
    writeFileSync(join(runDir, 'webview-build.log'), (b.stdout || '') + (b.stderr || ''));
    if (b.status !== 0) await fail(`webview build failed, see ${join(runDir, 'webview-build.log')}`);
  }
  if (!existsSync(join(webDir, 'index.html'))) await fail('no webview build, drop --no-build');
  console.log(`ok webview (${secs()}s) - ${webDir}`);

  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true });
  const errors = [];
  const watch = (p) => {
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errors.push(m.text()); });
    p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  };
  const barCounts = (p) => p.evaluate(() => {
    const out = {};
    for (const b of document.querySelectorAll('[data-state-bar] [data-bar-count]')) {
      out[b.getAttribute('data-bar-count')] = { n: Number(b.getAttribute('data-count')), text: b.textContent.trim(), title: b.getAttribute('title') ?? '', dim: Number(getComputedStyle(b).opacity) < 1 };
    }
    out.noDrift = document.querySelector('[data-state-bar] [data-bar-no-drift]') !== null;
    return out;
  });
  const selectedId = (p) => p.evaluate(() => document.querySelector('.react-flow__node.selected')?.getAttribute('data-id') ?? null);

  // ---- frames of another workspace, read only, no assertions past the bar being there
  if (framesOnly) {
    const dir = argOf('--root');
    if (!dir || !existsSync(dir)) await fail('--frames-only needs --root <dir>');
    work = resolve(dir);
    const srv = await startServer('server-read', false);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    watch(page);
    await page.goto(srv.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('[data-state-bar]').waitFor({ timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length > 0, null, { timeout: 60000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: join(runDir, '01-first-view.jpg'), ...FRAME });
    await page.keyboard.press('Escape');
    await page.locator('[data-legend-button]').click();
    await page.locator('[data-legend]').waitFor({ timeout: 3000 });
    await page.screenshot({ path: join(runDir, '02-legend-open.jpg'), ...FRAME });
    await page.locator('[data-legend] button[aria-label="Close legend"]').click();
    const c = await barCounts(page);
    const state = ['failed', 'drift', 'inferred', 'intent'].find((s) => (c[s]?.n ?? 0) > 0);
    if (state) {
      await page.locator(`[data-state-bar] [data-bar-count="${state}"]`).click();
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: join(runDir, '03-after-count-click.jpg'), ...FRAME });
    await page.locator('[data-state-bar]').screenshot({ path: join(runDir, '04-read-only-bar.jpg'), ...FRAME });
    await page.close();
    const stopped = await stopServer(srv);
    if (errors.length) await fail(`console errors: ${errors.slice(0, 3).join(' | ')}`);
    await finish(stopped, `frames in ${runDir}, clicked ${state ?? 'nothing'}, counts ${JSON.stringify(Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'noDrift').map(([k, v]) => [k, v.n])))}`);
  }

  work = mkdtempSync(join(tmpdir(), 'intentgraph-glance-'));
  ownWork = true;
  cpSync(fixture, work, { recursive: true });
  writeInfer([
    row('inf-add', 'Adds numbers for the calculator', ['src/math.ts#add', 'src/math.ts']),
    row('inf-greet', 'Greets a person by their name', ['src/greet.ts#greet', 'src/greet.ts'], { confidence: 'semantic' }),
  ]);
  // one verdict from the judge model, one from the hash, one unclear from the judge
  writeDrift([pair('intent-adds-numbers', 'drift', 'judge'), pair('intent-greets-by-name', 'aligned', 'hash'), pair('intent-has-no-checks', 'unclear', 'judge')]);
  // a spec file the parser rejects, so the problems count has something to open
  writeFileSync(join(work, 'spec', 'intents', 'broken.md'), '---\nid: intent-broken\ntitle: [unclosed\n  bad: : yaml\n---\nbody\n');

  const srv = await startServer('server-write', true);
  console.log(`ok server (${secs()}s) - ${srv.url} with --write`);
  const graph = async (s = srv) => (await fetch(`${s.url}graph.json`)).json();

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  watch(page);
  let loads = 0;
  page.on('load', () => { loads += 1; });
  await page.goto(srv.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('[data-state-bar]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-inferred]').length === 2, null, { timeout: 30000 });

  // 1 the legend opens by itself on the first visit
  const legendFirst = await page.locator('[data-legend]').waitFor({ timeout: 3000 }).then(() => true, () => false);
  if (!legendFirst) await fail('the legend did not open on the first visit');
  // the checks run once at start, wait for them so the numbers are settled
  await page.waitForFunction(() => document.querySelector('.react-flow__node[data-id="intent-adds-numbers"] [data-check-status="verified"]'), null, { timeout: CHECK_LIMIT_MS });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(runDir, '01-first-view.jpg'), ...FRAME });
  // the legend draws the real marks
  const legendMarks = await page.evaluate(() => ({
    checks: [...document.querySelectorAll('[data-legend] [data-check-status]')].map((e) => e.getAttribute('data-check-status')),
    drift: [...document.querySelectorAll('[data-legend] [data-drift]')].map((e) => e.getAttribute('data-drift')),
    robots: document.querySelectorAll('[data-legend] [data-robot]').length,
    keys: [...document.querySelectorAll('[data-legend] kbd')].map((e) => e.textContent),
  }));
  if (legendMarks.checks.join() !== 'verified,failed,pending' || !['aligned', 'unclear', 'drift'].every((d) => legendMarks.drift.includes(d)) || legendMarks.robots < 2) await fail(`legend marks: ${JSON.stringify(legendMarks)}`);
  for (const k of ['Enter', 'F2 or double-click', 'Delete', 'Ctrl+Z', 'Right-click', 'Drag from a pin']) if (!legendMarks.keys.includes(k)) await fail(`legend lacks the key ${k}`);
  // Esc closes it and the focus goes back to the "?"
  await page.locator('[data-legend] h2').click();
  await page.keyboard.press('Escape');
  await page.locator('[data-legend]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => fail('Esc did not close the legend'));
  await page.waitForTimeout(100);
  if (!(await page.evaluate(() => document.activeElement?.hasAttribute('data-legend-button')))) await fail('focus did not go back to the legend button');
  // a reload: the legend stays closed, the "?" opens it again
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('[data-inferred]').length === 2, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  if ((await page.locator('[data-legend]').count()) !== 0) await fail('the legend opened again after a reload');
  await page.locator('[data-legend-button]').click();
  await page.locator('[data-legend]').waitFor({ timeout: 3000 });
  await page.screenshot({ path: join(runDir, '02-legend-open.jpg'), ...FRAME });
  await page.locator('[data-legend] button[aria-label="Close legend"]').click();
  await page.locator('[data-legend]').waitFor({ state: 'detached', timeout: 3000 });
  console.log(`ok legend (${secs()}s) - opened on the first visit, real marks and ${legendMarks.keys.length} keys, Esc closed it with focus back on "?", closed after a reload`);

  await page.evaluate(() => { window.__e2eMarker = 'same-page'; });
  const loadsStart = loads;

  // 2 every number in the bar equals what graph.json says, every count has its word and title
  const compare = async () => {
    const want = expected(await graph());
    const got = await barCounts(page);
    const bad = [];
    for (const s of [...STATES, 'problems']) {
      if (s !== 'problems' && ['drift', 'unclear', 'aligned', 'stale'].includes(s) && !want.driftReport) continue;
      const g = got[s];
      if (!g) { bad.push(`${s} missing`); continue; }
      if (g.n !== want[s]) bad.push(`${s} ${g.n} want ${want[s]}`);
      if (!new RegExp(`^${want[s]} [a-z]+`).test(g.text)) bad.push(`${s} text "${g.text}"`);
      if (g.title.length < 10) bad.push(`${s} no title`);
      if ((want[s] === 0) !== g.dim) bad.push(`${s} dim=${g.dim} at ${want[s]}`);
    }
    if (want.driftReport === got.noDrift) bad.push(`no-drift shown=${got.noDrift} with report=${want.driftReport}`);
    return { ok: bad.length === 0, bad, want, got };
  };
  const waitEqual = async (limit) => {
    const end = Date.now() + limit;
    let r = await compare();
    while (!r.ok && Date.now() < end) { await page.waitForTimeout(150); r = await compare(); }
    return r;
  };
  const eq = await waitEqual(SHOW_LIMIT_MS);
  if (!eq.ok) await fail(`bar differs from graph.json: ${eq.bad.join('; ')}`);
  const nums = Object.fromEntries([...STATES, 'problems'].map((s) => [s, eq.want[s]]));
  console.log(`ok numbers (${secs()}s) - bar equals graph.json: ${JSON.stringify(nums)}`);

  // 3 the bar is one row above the canvas, and never over the canvas or the side panel
  const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height } : null; }, sel);
  const overlap = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  // 4 a click on each count selects a node in that state and brings it in view, clear of the panel
  const inView = (id) => page.evaluate((nid) => {
    const el = [...document.querySelectorAll('.react-flow__node')].find((e) => e.getAttribute('data-id') === nid);
    if (!el) return { drawn: false };
    const r = el.getBoundingClientRect();
    const c = document.querySelector('.react-flow').getBoundingClientRect();
    const pe = document.querySelector('[data-edit-panel]');
    const pr = pe ? pe.getBoundingClientRect() : null;
    const inside = r.left >= c.left && r.top >= c.top && r.right <= c.right && r.bottom <= c.bottom;
    const clear = !pr || r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom;
    return { drawn: true, inside, clear, panel: pr !== null };
  }, id);
  const waitInView = async (id) => {
    const end = Date.now() + SHOW_LIMIT_MS;
    let st = await inView(id);
    while (!(st.drawn && st.inside && st.clear && st.panel) && Date.now() < end) { await page.waitForTimeout(100); st = await inView(id); }
    return st;
  };
  const g0 = await graph();
  const stateOfId = Object.fromEntries(g0.nodes.map((n) => [n.id, statesOf(n)]));
  const visited = [];
  let afterClickFrame = false;
  for (const s of STATES) {
    const n = eq.want[s];
    if (n === 0) {
      const before = await selectedId(page);
      // aria-disabled, so playwright would wait for it to be enabled. a person can still click it.
      await page.locator(`[data-state-bar] [data-bar-count="${s}"]`).click({ force: true });
      await page.waitForTimeout(150);
      if ((await selectedId(page)) !== before) await fail(`a click on the zero count ${s} changed the selection`);
      continue;
    }
    const ids = [];
    for (let i = 0; i < Math.min(2, n); i++) {
      const was = await selectedId(page);
      await page.locator(`[data-state-bar] [data-bar-count="${s}"]`).click();
      await page.waitForFunction((w) => { const v = document.querySelector('.react-flow__node.selected')?.getAttribute('data-id') ?? null; return v !== null && v !== w; }, was, { timeout: SHOW_LIMIT_MS })
        .catch(() => (n === 1 && was !== null ? null : fail(`a click on ${s} selected nothing new`)));
      const id = await selectedId(page);
      if (!stateOfId[id]?.includes(s)) await fail(`a click on ${s} selected ${id}, which is ${JSON.stringify(stateOfId[id])}`);
      const st = await waitInView(id);
      if (!(st.drawn && st.inside && st.clear && st.panel)) await fail(`${id} from ${s} is not in view clear of the panel: ${JSON.stringify(st)}`);
      ids.push(id);
    }
    if (n >= 2 && ids[0] === ids[1]) await fail(`a second click on ${s} stayed on ${ids[0]}`);
    visited.push(`${s}:${ids.join('>')}`);
    if (!afterClickFrame && s === 'failed') { await page.screenshot({ path: join(runDir, '03-after-count-click.jpg'), ...FRAME }); afterClickFrame = true; }
  }
  if (!afterClickFrame) await page.screenshot({ path: join(runDir, '03-after-count-click.jpg'), ...FRAME });
  // measured with the panel open
  const bar = await rect('[data-state-bar]');
  const canvas = await rect('.react-flow');
  const panelBox = await rect('[data-edit-panel]');
  if (!bar || !canvas || !panelBox) await fail(`missing box: bar ${!!bar} canvas ${!!canvas} panel ${!!panelBox}`);
  if (bar.height > BAR_MAX_PX) await fail(`the bar is ${bar.height}px tall, more than one row`);
  if (bar.bottom > canvas.top) await fail(`the bar's bottom ${bar.bottom} is below the canvas top ${canvas.top}`);
  if (overlap(bar, panelBox)) await fail(`the bar overlaps the side panel: ${JSON.stringify({ bar, panelBox })}`);
  const barFits = await page.evaluate(() => { const b = document.querySelector('[data-state-bar]'); return b.scrollWidth <= b.clientWidth + 1; });
  if (!barFits) await fail('the bar runs out of its row at 1280 px');
  console.log(`ok clicks (${secs()}s) - ${visited.join(', ')}, each in view clear of the panel`);
  console.log(`ok layout (${secs()}s) - bar ${Math.round(bar.height)}px, bottom ${Math.round(bar.bottom)} <= canvas top ${Math.round(canvas.top)}, clear of the panel, fits at 1280 px`);

  // the problems count opens the list
  if (eq.want.problems > 0) {
    await page.locator('[data-state-bar] [data-bar-count="problems"]').click();
    await page.locator('[data-problems-count] ul').waitFor({ timeout: 3000 }).catch(() => fail('the problems count did not open the list'));
    await page.locator('[data-state-bar] [data-bar-count="problems"]').click();
    await page.locator('[data-problems-count] ul').waitFor({ state: 'detached', timeout: 3000 }).catch(() => fail('a second click did not close the problems list'));
  }

  // 5 the robot sits on every inferred thing and on no declared one, but for a verdict the judge gave
  const robots = await page.evaluate(() => {
    const out = { inferredWithout: [], declaredWith: [], judgeDrift: {} };
    for (const n of document.querySelectorAll('.react-flow__node')) {
      const id = n.getAttribute('data-id');
      const inf = n.querySelector('[data-inferred]');
      if (inf && !inf.querySelector('[data-inferred-row] [data-robot]')) out.inferredWithout.push(id);
      if (!inf) {
        const outside = [...n.querySelectorAll('[data-robot]')].filter((r) => !r.closest('[data-drift]'));
        if (outside.length) out.declaredWith.push(id);
        const d = n.querySelector('[data-drift]');
        if (d) out.judgeDrift[id] = d.querySelector('[data-robot]') !== null;
      }
    }
    out.count = document.querySelector('[data-inferred-count] [data-robot]') !== null;
    out.robotTitle = document.querySelector('[data-inferred] [data-robot]')?.getAttribute('title') ?? '';
    out.sparkles = document.querySelectorAll('.lucide-sparkles').length;
    return out;
  });
  const judged = Object.fromEntries(g0.nodes.filter((n) => n.drift && !n.inferred).map((n) => [n.id, n.drift.decided_by === 'judge']));
  if (robots.inferredWithout.length) await fail(`inferred without the robot: ${robots.inferredWithout.join(', ')}`);
  if (robots.declaredWith.length) await fail(`declared with the robot: ${robots.declaredWith.join(', ')}`);
  for (const [id, want] of Object.entries(robots.judgeDrift)) if (judged[id] !== want) await fail(`drift mark on ${id}: robot ${want}, judge ${judged[id]}`);
  if (!robots.count || !/model/.test(robots.robotTitle) || robots.sparkles !== 0) await fail(`robot: ${JSON.stringify(robots)}`);
  // the panel header of a proposal carries it too
  await page.locator('[data-state-bar] [data-bar-count="inferred"]').click();
  await page.locator('[data-inferred-panel] [data-robot]').waitFor({ timeout: SHOW_LIMIT_MS }).catch(() => fail('the inferred panel header has no robot'));
  console.log(`ok robot (${secs()}s) - on every proposal, the count and the panel, on judge verdicts ${JSON.stringify(robots.judgeDrift)}, on no declared node`);

  // 6 key hints: a proposal shows its keys on hover before it is selected
  await page.keyboard.press('Escape');
  await page.locator('[data-edit-panel]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  const hintId = (await graph()).nodes.find((n) => n.inferred)?.id;
  const hintNode = page.locator(`.react-flow__node[data-id="${hintId}"]`);
  await page.mouse.move(5, 790);
  const hiddenBefore = await hintNode.locator('[data-key-hint]').isVisible();
  await hintNode.hover({ position: { x: 30, y: 20 } });
  await page.waitForTimeout(150);
  const hintShown = await hintNode.locator('[data-key-hint]').isVisible();
  const hintText = (await hintNode.locator('[data-key-hint]').textContent()) ?? '';
  if (hiddenBefore || !hintShown || !/Enter/.test(hintText) || !/Delete/.test(hintText)) await fail(`key hint: before ${hiddenBefore}, on hover ${hintShown}, "${hintText}"`);
  console.log(`ok hints (${secs()}s) - "${hintText}" on hover only`);

  // 7 the numbers follow an accept, with no reload
  const before = await compare();
  await page.locator('[data-state-bar] [data-bar-count="inferred"]').click();
  await page.locator('[data-inferred-panel]').waitFor({ timeout: SHOW_LIMIT_MS });
  await page.waitForTimeout(700);
  const pid = await selectedId(page);
  await page.locator(`.react-flow__node[data-id="${pid}"]`).click({ position: { x: 30, y: 20 } });
  await page.keyboard.press('Enter');
  const end1 = Date.now() + SHOW_LIMIT_MS;
  let after = await compare();
  while (!(after.ok && after.want.inferred === before.want.inferred - 1) && Date.now() < end1) { await page.waitForTimeout(150); after = await compare(); }
  if (after.want.inferred !== before.want.inferred - 1 || after.want.intent !== before.want.intent + 1 || !after.ok) await fail(`after accept: ${after.bad.join('; ')} inferred ${before.want.inferred}->${after.want.inferred}, intents ${before.want.intent}->${after.want.intent}`);
  console.log(`ok accept (${secs()}s) - inferred ${before.want.inferred}->${after.want.inferred}, intents ${before.want.intent}->${after.want.intent}`);

  // 8 and a changed test
  const flip = join(work, 'tests', 'flip.test.ts');
  writeFileSync(flip, readFileSync(flip, 'utf8').split("toBe('hello ada')").join("toBe('goodbye ada')"));
  const end2 = Date.now() + CHECK_LIMIT_MS;
  let flipped = await compare();
  while (!(flipped.ok && flipped.want.failed > after.want.failed) && Date.now() < end2) { await page.waitForTimeout(250); flipped = await compare(); }
  if (!(flipped.ok && flipped.want.failed > after.want.failed)) await fail(`after a changed test: failing ${after.want.failed}->${flipped.want.failed}, ${flipped.bad.join('; ')}`);
  const same = await page.evaluate(() => window.__e2eMarker);
  if (same !== 'same-page' || loads !== loadsStart) await fail(`the page reloaded (${loads - loadsStart} loads)`);
  console.log(`ok follows (${secs()}s) - failing ${after.want.failed}->${flipped.want.failed}, verified ${after.want.verified}->${flipped.want.verified}, no reload`);
  // the page goes first, or its event stream logs the refused reconnects as console errors
  await page.close();
  if (!(await stopServer(srv))) await fail('the write server did not stop');

  // 9 read only is said once in the bar, with the reason
  const ro = await startServer('server-read', false);
  const rpage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  watch(rpage);
  await rpage.goto(ro.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await rpage.locator('[data-state-bar]').waitFor({ timeout: 30000 });
  await rpage.waitForFunction(() => document.querySelectorAll('.react-flow__node').length > 0, null, { timeout: 30000 });
  await rpage.keyboard.press('Escape');
  await rpage.waitForTimeout(600);
  const roState = await rpage.evaluate(() => ({
    n: document.querySelectorAll('[data-state-bar] [data-bar-read-only]').length,
    text: document.querySelector('[data-state-bar] [data-bar-read-only]')?.textContent ?? '',
    title: document.querySelector('[data-state-bar] [data-bar-read-only]')?.getAttribute('title') ?? '',
  }));
  if (roState.n !== 1 || !/read only/i.test(roState.text) || !/--write/.test(roState.title)) await fail(`read only in the bar: ${JSON.stringify(roState)}`);
  await rpage.screenshot({ path: join(runDir, '04-read-only.jpg'), ...FRAME });
  await rpage.close();
  if (!(await stopServer(ro))) await fail('the read only server did not stop');
  console.log(`ok read only (${secs()}s) - "${roState.text}" once in the bar`);

  if (errors.length) await fail(`console errors: ${errors.slice(0, 3).join(' | ')}`);
  await finish(true, `bar equals graph.json and follows it, clicks land in view, legend, robot, hints, read only, frames in ${runDir}`);
} catch (err) {
  await fail(`crashed: ${err?.stack || err}`);
}
