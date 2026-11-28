#!/usr/bin/env node
// proves folded proposals end to end (lane 12). usage: node tools/e2e-fold.mjs [--no-build] [--frames]
// 1 a temp copy of the fixture with a canned report of 40 proposals in its one concept and 2 with no
//   concept, on a --write live server, driven headless with real clicks and keys: the first view is
//   folded and fits, the rows add up to the bar's count, a click, Enter and Space fold and unfold and
//   keep the concept's header in place, Tab reaches the rows, the bar's count and ?focus unfold, accept
//   and undo work inside an unfolded concept, a live update keeps what was unfolded, and the view fits
//   again on a resize unless the person moved it, and F fits.
// 2 when the main checkout holds a real inference report: a temp copy of this repo with that report and
//   a canned drift report. 50 to 80 proposals, every declared node in the first view, none drawn, no
//   wire across a box. skipped with a note when there is no report.
// --frames writes the lane frames to .runs/frames-lane12. no model call: every report is canned or copied.
// prints one line per step, then PASS|FAIL e2e-fold (time) - note. exit 0 only on pass.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const wantFrames = args.includes('--frames');
const t0 = Date.now();
const secs = (from = t0) => Math.round((Date.now() - from) / 100) / 10;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = join(root, '.runs', 'e2e-fold', stamp);
const framesDir = join(root, '.runs', 'frames-lane12');
mkdirSync(runDir, { recursive: true });
if (wantFrames) mkdirSync(framesDir, { recursive: true });

// limits from the lane note
const SHOW_LIMIT_MS = 6000;
const STOP_LIMIT_MS = 10000;
const ANCHOR_PX = 40;
const IN_CONCEPT = 40;
const NO_CONCEPT = 2;
const REPO_MIN = 50;
const REPO_MAX = 80;
const SAMPLES = 40;

const fixture = join(root, 'tests', 'fixtures', 'live-workspace');
const cli = join(root, 'packages', 'skill', 'src', 'live', 'cli.ts');
const webDir = join(root, 'packages', 'webview', 'dist');
const works = [];
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
  for (const w of works) rmSync(w, { recursive: true, force: true });
  console.log(`${ok ? 'PASS' : 'FAIL'} e2e-fold (${secs()}s) - ${note}`);
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
async function startServer(name, dir, write) {
  const port = await freePort();
  const log = createWriteStream(join(runDir, `${name}.log`));
  const proc = spawn(process.execPath, ['--import', 'tsx', cli, '--root', dir, '--port', String(port), '--web', webDir, ...(write ? ['--write'] : [])], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
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

// a canned proposal row, every field InferProposalRowSchema asks for
const row = (id, title, over = {}) => ({
  id, folder: 'src', title, body: `${title}. Read from the code in src.`, anchors: ['src/math.ts'], belongs_under: 'concept-calculator', restates: null, confidence: 'inferred', planned: false, code_hash: `hash-${id}`, ...over,
});
export const cannedProposals = (n = IN_CONCEPT, loose = NO_CONCEPT) => [
  ...Array.from({ length: n }, (_, i) => row(`inf-c${String(i).padStart(2, '0')}`, `Proposal ${i + 1} for the calculator`)),
  ...Array.from({ length: loose }, (_, i) => row(`inf-l${i}`, `Loose proposal ${i + 1}`, { belongs_under: null })),
];
function writeInfer(work, proposals, n) {
  const dir = join(work, '.runs', 'infer', `run-${n}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', report: { incomplete: false, stopped: null, proposals } }));
  writeFileSync(join(work, '.runs', 'infer', 'latest.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', report: `.runs/infer/run-${n}/report.json` }));
}

const node = (id) => `.react-flow__node[data-id="${id}"]`;
const CONCEPT = 'concept-calculator';
const ROOT_BOX = 'inferred-fold:root';

// runs in the page: the drawn boxes, the rows and the bar's count
function readFold() {
  const rows = [...document.querySelectorAll('[data-fold-row]')].map((b) => ({ key: b.getAttribute('data-fold-row'), count: Number(b.getAttribute('data-fold-count')), open: b.getAttribute('data-fold-open') === 'true', text: b.textContent.trim(), title: b.getAttribute('title') ?? '' }));
  return {
    rows,
    drawnInferred: document.querySelectorAll('[data-inferred]').length,
    bar: Number(document.querySelector('[data-inferred-count]')?.getAttribute('data-inferred-count') ?? -1),
  };
}
// runs in the page: every drawn node's box inside the canvas, none cut off
function readFit() {
  const c = document.querySelector('.react-flow').getBoundingClientRect();
  const out = [];
  for (const el of document.querySelectorAll('.react-flow__node')) {
    const r = el.getBoundingClientRect();
    if (r.left < c.left - 1 || r.top < c.top - 1 || r.right > c.right + 1 || r.bottom > c.bottom + 1) out.push(el.getAttribute('data-id'));
  }
  return { outside: out, nodes: document.querySelectorAll('.react-flow__node').length, width: Math.round(c.width), docWidth: document.documentElement.scrollWidth, winWidth: innerWidth };
}
// runs in the page: wire samples inside a box that is not an end of the wire and does not hold one
function readCrossing({ parents, ends, samples }) {
  const boxes = [...document.querySelectorAll('.react-flow__node')].map((el) => ({ id: el.getAttribute('data-id'), r: el.getBoundingClientRect() }));
  const up = (id) => { const s = new Set(); let cur = id; for (let i = 0; cur && i < 50; i++) { s.add(cur); cur = parents[cur]; } return s; };
  const inside = (p, r) => p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom;
  let wires = 0;
  let cross = 0;
  for (const g of document.querySelectorAll('.react-flow__edge')) {
    const id = g.getAttribute('data-id');
    const path = g.querySelector('path.react-flow__edge-path') ?? g.querySelector('path');
    const m = path?.getScreenCTM();
    const len = path?.getTotalLength() ?? 0;
    if (!m || !(len > 0)) continue;
    wires += 1;
    const end = ends[id];
    const skip = new Set([...(end ? up(end[0]) : []), ...(end ? up(end[1]) : [])]);
    for (let i = 0; i < samples; i++) {
      const q = path.getPointAtLength((len * i) / (samples - 1));
      const p = { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f };
      if (boxes.some((b) => !skip.has(b.id) && inside(p, b.r))) cross += 1;
    }
  }
  return { wires, cross };
}
async function graphShape(url) {
  const graph = await (await fetch(new URL('graph.json', url))).json();
  const kindOf = new Map(graph.nodes.map((n) => [n.id, n.kind]));
  const parents = {};
  for (const n of graph.nodes) if (n.parent_id && kindOf.get(n.parent_id) === 'concept') parents[n.id] = n.parent_id;
  const ends = {};
  for (const e of graph.edges) ends[e.id] = [e.src, e.dst];
  return { graph, parents, ends };
}
const frame = async (p, name, opts = {}) => {
  await p.screenshot({ path: join(runDir, `${name}.jpg`), type: 'jpeg', quality: 85, ...opts });
  if (wantFrames) await p.screenshot({ path: join(framesDir, `${name}.jpg`), type: 'jpeg', quality: 85, ...opts });
};
// the legend opens on a first visit and closes on the first click outside it, which changes the
// canvas size and fits again. close it first so a step measures only what it does.
const closeLegend = async (p) => {
  if (await p.locator('[data-legend]').count()) {
    await p.locator('[data-legend-button]').click();
    await p.waitForTimeout(500);
  }
};
const viewOf = (p) => p.evaluate(() => getComputedStyle(document.querySelector('.react-flow__viewport')).transform);
const headerAt = (p, id) => p.evaluate((nid) => {
  const el = document.querySelector(`.react-flow__node[data-id="${nid}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top };
}, id);

try {
  if (!args.includes('--no-build')) {
    const b = spawnSync('pnpm --filter @intentgraph/webview build', { cwd: root, shell: true, encoding: 'utf8' });
    writeFileSync(join(runDir, 'webview-build.log'), (b.stdout || '') + (b.stderr || ''));
    if (b.status !== 0) await fail(`webview build failed, see ${join(runDir, 'webview-build.log')}`);
  }
  if (!existsSync(join(webDir, 'index.html'))) await fail('no webview build, drop --no-build');

  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true });
  const errors = [];
  const watch = (p, name) => {
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errors.push(`${name}: ${m.text()}`); });
    p.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  };

  // 1 the fixture with 42 proposals
  const work = mkdtempSync(join(tmpdir(), 'intentgraph-fold-'));
  works.push(work);
  cpSync(fixture, work, { recursive: true });
  let reportN = 1;
  const all = cannedProposals();
  writeInfer(work, all, reportN);
  const srv = await startServer('server-fixture', work, true);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(page, 'fixture');
  await page.goto(srv.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-fold-row]').length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  await closeLegend(page);
  const total = IN_CONCEPT + NO_CONCEPT;
  let f = await page.evaluate(readFold);
  if (f.bar !== total) await fail(`bar says ${f.bar} inferred, want ${total}`);
  if (f.drawnInferred !== 0) await fail(`${f.drawnInferred} proposals drawn on a first view, want 0`);
  const sum = f.rows.reduce((a, r) => a + r.count, 0);
  if (sum !== f.bar) await fail(`the rows add up to ${sum}, the bar says ${f.bar}: ${JSON.stringify(f.rows)}`);
  const cRow = f.rows.find((r) => r.key === CONCEPT);
  const bRow = f.rows.find((r) => r.key === ROOT_BOX);
  if (!cRow || cRow.text !== `${IN_CONCEPT} inferred` || cRow.open) await fail(`concept row: ${JSON.stringify(cRow)}`);
  if (!bRow || bRow.text !== `${NO_CONCEPT} inferred, no concept yet`) await fail(`root box: ${JSON.stringify(bRow)}`);
  if (f.rows.some((r) => !r.title)) await fail('a fold row has no title');
  const rowH = await page.evaluate((k) => document.querySelector(`[data-fold-row="${k}"]`).getBoundingClientRect().height, CONCEPT);
  const fit0 = await page.evaluate(readFit);
  if (fit0.outside.length) await fail(`first view cuts off ${fit0.outside.join(', ')}`);
  await frame(page, 'f1-fixture-folded');
  await page.locator(`[data-fold-row="${CONCEPT}"]`).screenshot({ path: join(runDir, 'f2-fold-row-close.jpg'), type: 'jpeg', quality: 92 });
  if (wantFrames) {
    const r = await page.evaluate((id) => { const b = document.querySelector(`.react-flow__node[data-id="${id}"]`).getBoundingClientRect(); return { x: b.left, y: b.bottom - 120, width: b.width, height: 120 }; }, CONCEPT);
    await page.screenshot({ path: join(framesDir, 'fold-row-close-example.jpg'), type: 'jpeg', quality: 92, clip: { x: Math.max(0, r.x - 10), y: Math.max(0, r.y), width: Math.min(r.width + 20, 1440), height: r.height + 10 } });
  }
  console.log(`ok folded (${secs()}s) - 0 of ${total} drawn, rows ${f.rows.map((r) => `"${r.text}"`).join(' and ')} add up to the bar's ${f.bar}, row ${Math.round(rowH)} px high, ${fit0.nodes} nodes all in view`);

  // a click unfolds, the header stays put, the row reads fold, a second click folds
  const h0 = await headerAt(page, CONCEPT);
  await page.locator(`[data-fold-row="${CONCEPT}"]`).click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-inferred]').length >= n, IN_CONCEPT, { timeout: SHOW_LIMIT_MS }).catch(() => {});
  await page.waitForTimeout(400);
  f = await page.evaluate(readFold);
  const h1 = await headerAt(page, CONCEPT);
  const moved = Math.hypot(h1.x - h0.x, h1.y - h0.y);
  if (f.rows.find((r) => r.key === CONCEPT)?.text !== `fold ${IN_CONCEPT} inferred`) await fail(`unfolded row says ${JSON.stringify(f.rows)}`);
  const drawnIds = await page.evaluate(() => [...document.querySelectorAll('.react-flow__node')].map((e) => e.getAttribute('data-id')));
  const shownIn = drawnIds.filter((id) => id.startsWith('inferred:inf-c')).length;
  // the canvas draws only what is in view, so the count of drawn ones can be lower than 40 but not 0
  if (shownIn === 0) await fail('a click on the row drew no proposal');
  if (moved > ANCHOR_PX) await fail(`the concept's header moved ${Math.round(moved)} px on unfold`);
  const order = await page.evaluate((id) => {
    const top = (nid) => document.querySelector(`.react-flow__node[data-id="${nid}"]`)?.getBoundingClientRect().top ?? null;
    const declared = ['intent-adds-numbers', 'intent-greets-by-name', 'intent-has-no-checks'].map(top).filter((v) => v !== null);
    const props = [...document.querySelectorAll('.react-flow__node')].filter((e) => e.getAttribute('data-id').startsWith('inferred:inf-c')).map((e) => e.getBoundingClientRect().top);
    return { declaredBottom: Math.max(...declared), propsTop: Math.min(...props), id };
  }, CONCEPT);
  if (!(order.propsTop > order.declaredBottom)) await fail(`unfolded proposals are not below the declared ones: ${JSON.stringify(order)}`);
  await frame(page, 'f3-fixture-unfolded');
  await page.locator(`[data-fold-row="${CONCEPT}"]`).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-inferred]').length === 0, null, { timeout: SHOW_LIMIT_MS }).catch(() => {});
  const h2 = await headerAt(page, CONCEPT);
  if ((await page.evaluate(readFold)).drawnInferred !== 0) await fail('a second click did not fold');
  if (Math.hypot(h2.x - h0.x, h2.y - h0.y) > ANCHOR_PX) await fail(`the header moved ${Math.round(Math.hypot(h2.x - h0.x, h2.y - h0.y))} px on fold`);
  console.log(`ok click (${secs()}s) - unfold drew proposals below the declared ones, row "fold ${IN_CONCEPT} inferred", header moved ${Math.round(moved)} px, a second click folded`);

  // keys: Enter and Space on the focused row, and Tab reaches every row with the focus ring
  await page.locator(`[data-fold-row="${CONCEPT}"]`).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction((k) => document.querySelector(`[data-fold-row="${k}"]`)?.getAttribute('data-fold-open') === 'true', CONCEPT, { timeout: SHOW_LIMIT_MS }).catch(() => {});
  if ((await page.evaluate(readFold)).rows.find((r) => r.key === CONCEPT)?.open !== true) await fail('Enter on the row did not unfold');
  await page.locator(`[data-fold-row="${CONCEPT}"]`).focus();
  await page.keyboard.press(' ');
  await page.waitForFunction((k) => document.querySelector(`[data-fold-row="${k}"]`)?.getAttribute('data-fold-open') === 'false', CONCEPT, { timeout: SHOW_LIMIT_MS }).catch(() => {});
  if ((await page.evaluate(readFold)).rows.find((r) => r.key === CONCEPT)?.open !== false) await fail('Space on the row did not fold');
  await page.locator('[data-state-bar]').click({ position: { x: 2, y: 2 } });
  const reached = [];
  let ring = false;
  for (let i = 0; i < 80 && reached.length < 2; i++) {
    await page.keyboard.press('Tab');
    const at = await page.evaluate(() => {
      const a = document.activeElement;
      const key = a?.getAttribute('data-fold-row');
      return key ? { key, ring: getComputedStyle(a).outlineStyle !== 'none' } : null;
    });
    if (at && !reached.includes(at.key)) { reached.push(at.key); ring = ring || at.ring; }
  }
  if (reached.length < 2) await fail(`Tab reached ${reached.length} of 2 fold rows`);
  if (!ring) await fail('a fold row with the focus shows no ring');
  console.log(`ok keys (${secs()}s) - Enter unfolds, Space folds, Tab reaches ${reached.join(' then ')} with a ring`);

  // the bar's count unfolds the concept of the next proposal and selects it
  await page.locator('[data-inferred-count] button').click();
  await page.locator('[data-inferred-panel]').waitFor({ timeout: SHOW_LIMIT_MS });
  const picked = await page.evaluate(() => document.querySelector('[data-inferred-panel]').getAttribute('data-inferred-panel'));
  f = await page.evaluate(readFold);
  const pickedKey = picked.startsWith('inf-l') ? ROOT_BOX : CONCEPT;
  if (f.rows.find((r) => r.key === pickedKey)?.open !== true) await fail(`the bar's count picked ${picked} but did not unfold ${pickedKey}`);
  console.log(`ok bar count (${secs()}s) - a click picked ${picked} and unfolded ${pickedKey}`);

  // accept and undo inside the unfolded concept, and the concept stays unfolded through the live updates
  if (pickedKey !== CONCEPT) await page.locator(`[data-fold-row="${CONCEPT}"]`).click();
  await page.waitForFunction((k) => document.querySelector(`[data-fold-row="${k}"]`)?.getAttribute('data-fold-open') === 'true', CONCEPT, { timeout: SHOW_LIMIT_MS });
  for (let i = 0; i < 6; i++) {
    const shown = await page.evaluate(() => document.querySelector('[data-inferred-panel]')?.getAttribute('data-inferred-panel') ?? null);
    if (shown && shown.startsWith('inf-c')) break;
    await page.locator('[data-inferred-count] button').click();
    await page.waitForTimeout(500);
  }
  const target = await page.evaluate(() => document.querySelector('[data-inferred-panel]')?.getAttribute('data-inferred-panel') ?? null);
  if (!target || !target.startsWith('inf-c')) await fail(`the bar's count never reached a proposal in the concept: ${target}`);
  await page.waitForTimeout(700);
  await page.locator(node(`inferred:${target}`)).click({ position: { x: 30, y: 30 } });
  await page.keyboard.press('Enter');
  const title = all.find((p) => p.id === target).title;
  const file = join(work, 'spec', 'intents', `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.md`);
  const until = Date.now() + SHOW_LIMIT_MS;
  while (!existsSync(file) && Date.now() < until) await page.waitForTimeout(50);
  if (!existsSync(file)) await fail(`Enter inside the unfolded concept did not write ${basename(file)}`);
  await page.waitForFunction((n) => Number(document.querySelector('[data-inferred-count]')?.getAttribute('data-inferred-count')) === n, total - 1, { timeout: SHOW_LIMIT_MS });
  // the canvas draws only what is in view, F brings every row back into it
  await page.waitForTimeout(400);
  await page.keyboard.press('f');
  await page.waitForTimeout(500);
  f = await page.evaluate(readFold);
  if (f.rows.find((r) => r.key === CONCEPT)?.open !== true) await fail('the live update after accept folded the concept again');
  if (f.rows.reduce((a, r) => a + r.count, 0) !== f.bar) await fail(`after accept the rows add up to ${f.rows.reduce((a, r) => a + r.count, 0)}, the bar says ${f.bar}`);
  // the notice went with the F key, so the undo is Ctrl+Z
  await page.keyboard.press('Control+z');
  const until2 = Date.now() + SHOW_LIMIT_MS;
  while (existsSync(file) && Date.now() < until2) await page.waitForTimeout(50);
  if (existsSync(file)) await fail('undo did not remove the accepted file');
  await page.waitForFunction((n) => Number(document.querySelector('[data-inferred-count]')?.getAttribute('data-inferred-count')) === n, total, { timeout: SHOW_LIMIT_MS });
  if ((await page.evaluate(readFold)).rows.find((r) => r.key === CONCEPT)?.open !== true) await fail('the live update after undo folded the concept again');
  console.log(`ok accept and undo (${secs()}s) - Enter accepted ${target} inside the unfolded concept, undo took it back, the concept stayed unfolded, the rows add up`);

  // a new report is a live update too: the concept stays unfolded and the row counts the new one
  reportN += 1;
  writeInfer(work, [...all, row('inf-c99', 'One more proposal for the calculator')], reportN);
  await page.waitForFunction((n) => Number(document.querySelector('[data-inferred-count]')?.getAttribute('data-inferred-count')) === n, total + 1, { timeout: SHOW_LIMIT_MS });
  await page.waitForTimeout(300);
  await page.keyboard.press('f');
  await page.waitForTimeout(500);
  f = await page.evaluate(readFold);
  const cNow = f.rows.find((r) => r.key === CONCEPT);
  if (!cNow?.open || cNow.count !== IN_CONCEPT + 1) await fail(`after a new report the concept row is ${JSON.stringify(cNow)}`);
  console.log(`ok live update (${secs()}s) - a new report kept the concept unfolded, row "${cNow.text}"`);
  await page.close();

  // ?focus on a folded proposal unfolds its concept and fits to it
  const focusId = 'inferred:inf-c05';
  const pf = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(pf, 'focus');
  await pf.goto(`${srv.url}?focus=${encodeURIComponent(focusId)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pf.locator(node(focusId)).waitFor({ timeout: 30000 });
  await pf.waitForTimeout(500);
  const ff = await pf.evaluate(readFold);
  const inView = await pf.evaluate((id) => {
    const r = document.querySelector(`.react-flow__node[data-id="${id}"]`).getBoundingClientRect();
    const c = document.querySelector('.react-flow').getBoundingClientRect();
    return r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom;
  }, focusId);
  if (ff.rows.find((r) => r.key === CONCEPT)?.open !== true || !inView) await fail(`?focus on a folded proposal: open ${JSON.stringify(ff.rows)}, in view ${inView}`);
  console.log(`ok focus (${secs()}s) - ?focus=${focusId} unfolded its concept and the node is in view`);
  await pf.close();

  // the view fits again from 1280 to 480 wide, a pan stops that, F fits
  const pr = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  watch(pr, 'resize');
  await pr.goto(srv.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pr.waitForFunction(() => document.querySelectorAll('[data-fold-row]').length > 0, null, { timeout: 30000 });
  await pr.waitForTimeout(500);
  await closeLegend(pr);
  await frame(pr, 'f4-resize-1280');
  await pr.setViewportSize({ width: 480, height: 800 });
  await pr.waitForTimeout(700);
  const fit480 = await pr.evaluate(readFit);
  if (fit480.outside.length) await fail(`after a resize to 480 these are cut off: ${fit480.outside.join(', ')}`);
  if (fit480.docWidth > fit480.winWidth) await fail(`the page scrolls sideways at 480: ${fit480.docWidth} > ${fit480.winWidth}`);
  await frame(pr, 'f5-resize-480');
  if (wantFrames) await pr.screenshot({ path: join(framesDir, 'example-after-resize-1280-to-480.jpg'), type: 'jpeg', quality: 85 });
  const pane = pr.locator('.react-flow__pane');
  // a wheel zoom is a move the person makes, wherever the pointer is
  await pr.mouse.move(240, 400);
  await pr.mouse.wheel(0, -200);
  await pr.waitForTimeout(400);
  const panned = await viewOf(pr);
  await pr.setViewportSize({ width: 900, height: 800 });
  await pr.waitForTimeout(700);
  if ((await viewOf(pr)) !== panned) await fail('a resize after a pan moved the view');
  await pane.click({ position: { x: 5, y: 5 } });
  await pr.keyboard.press('f');
  await pr.waitForTimeout(500);
  const fit900 = await pr.evaluate(readFit);
  if (fit900.outside.length) await fail(`F at 900 left these cut off: ${fit900.outside.join(', ')}`);
  await pr.setViewportSize({ width: 480, height: 800 });
  await pr.waitForTimeout(700);
  if ((await pr.evaluate(readFit)).outside.length) await fail('after F a resize to 480 did not fit again');
  console.log(`ok fit (${secs()}s) - 1280 to 480 fits with ${fit480.nodes} nodes in view, a pan holds the view through a resize, F fits at 900 and the next resize fits again`);
  await pr.close();

  // a first load in a narrow window fits
  const pn = await browser.newPage({ viewport: { width: 480, height: 800 } });
  watch(pn, 'narrow');
  await pn.goto(srv.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pn.waitForFunction(() => document.querySelectorAll('[data-fold-row]').length > 0, null, { timeout: 30000 });
  await pn.waitForTimeout(600);
  const fitN = await pn.evaluate(readFit);
  if (fitN.outside.length || fitN.docWidth > fitN.winWidth) await fail(`a first load at 480 cuts off ${fitN.outside.join(', ')} or scrolls sideways ${fitN.docWidth}`);
  console.log(`ok narrow (${secs()}s) - a first load at 480 fits ${fitN.nodes} nodes, no sideways scroll`);
  await pn.close();
  if (!(await stopServer(srv))) await fail('fixture server did not stop');

  // 2 this repo with the real report from the main checkout, when there is one
  const mainRoot = resolve(root, '..', '..');
  const latest = join(mainRoot, '.runs', 'infer', 'latest.json');
  let repoNote = 'repo block skipped, no real report in the main checkout';
  if (existsSync(latest) && mainRoot !== root) {
    const named = String(JSON.parse(readFileSync(latest, 'utf8')).report ?? '');
    const reportPath = isAbsolute(named) ? named : join(mainRoot, named);
    const rwork = mkdtempSync(join(tmpdir(), 'intentgraph-fold-repo-'));
    works.push(rwork);
    const skip = new Set(['node_modules', '.git', '.runs', '.wt', 'dist', '.turbo']);
    cpSync(root, rwork, { recursive: true, filter: (src) => !skip.has(basename(src)) });
    mkdirSync(join(rwork, '.runs', 'infer', 'run-real'), { recursive: true });
    cpSync(reportPath, join(rwork, '.runs', 'infer', 'run-real', 'report.json'));
    writeFileSync(join(rwork, '.runs', 'infer', 'latest.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'copied', report: '.runs/infer/run-real/report.json' }));
    // a canned drift report, so the frames show drift marks
    const pair = (node_id, verdict) => ({ commit: 'a1b2c3d', node_id, targets: [], decided_by: 'judge', verdict, confidence: 'inferred', certainty: 'high', evidence: 'canned for the frames', evidence_in_diff: true, suggested_action: 'none', truncated: false, diff_chars: 120, cost_usd: 0, seconds: 0, judge_model: null, error: null });
    const rsrv = await startServer('server-repo', rwork, false);
    const shape = await graphShape(rsrv.url);
    const specIds = shape.graph.nodes.filter((n) => ['intent', 'constraint', 'decision', 'concept'].includes(n.kind) && !n.inferred).map((n) => n.id);
    const dirDrift = join(rwork, '.runs', 'drift', 'run-1');
    mkdirSync(dirDrift, { recursive: true });
    writeFileSync(join(dirDrift, 'report.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', args: [], report: { mode: 'range', pairs: specIds.filter((id) => id.startsWith('intent-')).slice(0, 6).map((id, i) => pair(id, i % 3 === 0 ? 'drift' : 'aligned')) } }));
    writeFileSync(join(rwork, '.runs', 'drift', 'latest.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', report: join(dirDrift, 'report.json') }));
    const proposals = shape.graph.nodes.filter((n) => n.inferred).length;
    if (proposals < REPO_MIN || proposals > REPO_MAX) await fail(`stop clause: this repo's copy shows ${proposals} proposals, the lane allows ${REPO_MIN} to ${REPO_MAX}`);
    const rp = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    watch(rp, 'repo');
    await rp.goto(rsrv.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await rp.waitForFunction(() => document.querySelectorAll('[data-fold-row]').length > 0, null, { timeout: 60000 });
    await rp.waitForFunction(() => document.querySelector('[data-drift]'), null, { timeout: 15000 }).catch(() => {});
    await rp.waitForTimeout(800);
    const rf = await rp.evaluate(readFold);
    const rfit = await rp.evaluate(readFit);
    const drawn = await rp.evaluate(() => [...document.querySelectorAll('.react-flow__node')].map((e) => e.getAttribute('data-id')));
    const missing = specIds.filter((id) => !drawn.includes(id));
    const rc = await rp.evaluate(readCrossing, { parents: shape.parents, ends: shape.ends, samples: SAMPLES });
    if (rf.drawnInferred !== 0) await fail(`repo first view draws ${rf.drawnInferred} proposals`);
    if (rf.rows.reduce((a, r) => a + r.count, 0) !== rf.bar || rf.bar !== proposals) await fail(`repo rows add up to ${rf.rows.reduce((a, r) => a + r.count, 0)}, bar ${rf.bar}, graph ${proposals}`);
    if (missing.length) await fail(`repo first view does not draw ${missing.length} declared nodes: ${missing.slice(0, 4).join(', ')}`);
    if (rfit.outside.length) await fail(`repo first view cuts off ${rfit.outside.slice(0, 4).join(', ')}`);
    if (rc.cross > 0) await fail(`repo first view: ${rc.cross} wire samples cross a box`);
    await frame(rp, 'r1-repo-folded-1440');
    if (wantFrames) await rp.screenshot({ path: join(framesDir, 'repo-folded-1440x900.jpg'), type: 'jpeg', quality: 85 });
    // one concept unfolded
    const biggest = rf.rows.filter((r) => r.key !== ROOT_BOX).sort((a, b) => b.count - a.count)[0];
    await rp.locator(`[data-fold-row="${biggest.key}"]`).click();
    await rp.waitForFunction(() => document.querySelectorAll('[data-inferred]').length > 0, null, { timeout: SHOW_LIMIT_MS }).catch(() => {});
    await rp.waitForTimeout(600);
    const rcOpen = await rp.evaluate(readCrossing, { parents: shape.parents, ends: shape.ends, samples: SAMPLES });
    if (wantFrames) await rp.screenshot({ path: join(framesDir, 'repo-one-concept-unfolded.jpg'), type: 'jpeg', quality: 85 });
    await rp.locator(`[data-fold-row="${biggest.key}"]`).click();
    await rp.waitForTimeout(500);
    // the problems list open, when there is one
    if (wantFrames && (await rp.locator('[data-bar-count="problems"][aria-disabled="false"]').count())) {
      await rp.locator('[data-bar-count="problems"]').click();
      await rp.waitForTimeout(300);
      await rp.screenshot({ path: join(framesDir, 'problems-list-open.jpg'), type: 'jpeg', quality: 85 });
      await rp.keyboard.press('Escape');
    }
    await rp.close();
    const r480 = await browser.newPage({ viewport: { width: 480, height: 900 } });
    watch(r480, 'repo480');
    await r480.goto(rsrv.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await r480.waitForFunction(() => document.querySelectorAll('[data-fold-row]').length > 0, null, { timeout: 60000 });
    await r480.waitForTimeout(800);
    const fit480r = await r480.evaluate(readFit);
    if (fit480r.outside.length || fit480r.docWidth > fit480r.winWidth) await fail(`repo at 480 cuts off ${fit480r.outside.slice(0, 4).join(', ')} or scrolls sideways ${fit480r.docWidth}`);
    if (wantFrames) await r480.screenshot({ path: join(framesDir, 'repo-480.jpg'), type: 'jpeg', quality: 85 });
    await r480.close();
    if (!(await stopServer(rsrv))) await fail('repo server did not stop');
    repoNote = `repo ${proposals} proposals folded into ${rf.rows.length} rows, ${specIds.length} declared nodes in view, ${rc.cross} crossing samples on ${rc.wires} wires (${biggest.key} unfolded: ${rcOpen.cross}), fits at 480`;
    console.log(`ok repo (${secs()}s) - ${repoNote}`);
  } else console.log(`ok repo (${secs()}s) - ${repoNote}`);

  if (errors.length) await fail(`${errors.length} console error(s): ${errors[0].slice(0, 160)}`);
  await finish(true, `fold, unfold, keys, bar count, focus, accept and undo, live update and fit again on the fixture, ${repoNote}, frames in ${relative(root, runDir).split('\\').join('/')}${wantFrames ? ' and .runs/frames-lane12' : ''}`);
} catch (e) {
  await fail(`crashed: ${String((e && e.message) || e).split('\n')[0]}`);
}
