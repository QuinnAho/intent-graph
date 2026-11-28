#!/usr/bin/env node
// proves an intent opens in place to list its code (lane 13). usage: node tools/e2e-nested.mjs [--no-build] [--frames]
// 1 a temp copy of the fixture on a --write live server, driven headless with real clicks and keys. one intent
//   cites a symbol and a bare file, one cites a symbol, one cites only code that is not there, one cites none.
//   checks the server's list, the count, the rows' order and words, open and close by click, O and the menu,
//   the title stays put, a row selects its code in a browser tab, open survives a rename, a move with undo
//   and a live update, every intent open with no overlap, every intent closed puts every node back within 1 px,
//   the menu near the right edge with the panel open, and 480 px.
// 2 the same copy on a server without --write: open, close and a row click send only GET.
// 3 when the main checkout holds a real inference report: a temp copy of this repo with that report, one
//   proposal accepted and opened. click to settled layout, median of 5, under the lane's limit.
// --frames writes the lane frames to .runs/frames-lane13. no model call: every report is canned or copied.
// prints one line per step, then PASS|FAIL e2e-nested (time) - note. exit 0 only on pass.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const wantFrames = args.includes('--frames');
const t0 = Date.now();
const secs = (from = t0) => Math.round((Date.now() - from) / 100) / 10;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = join(root, '.runs', 'e2e-nested', stamp);
const framesDir = join(root, '.runs', 'frames-lane13');
mkdirSync(runDir, { recursive: true });
if (wantFrames) mkdirSync(framesDir, { recursive: true });

// limits from the lane note
const SHOW_LIMIT_MS = 6000;
const STOP_LIMIT_MS = 10000;
const ANCHOR_PX = 40;
const BACK_PX = 1;
const OPEN_MEDIAN_MS = 1500;
const TIMED_RUNS = 5;

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
  console.log(`${ok ? 'PASS' : 'FAIL'} e2e-nested (${secs()}s) - ${note}`);
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

const node = (id) => `.react-flow__node[data-id="${id}"]`;
const TWO = 'intent-adds-numbers';
const ONE = 'intent-greets-by-name';
const NONE = 'intent-has-no-checks';
const LOST = 'intent-finds-nothing';
const CONCEPT = 'concept-calculator';
const OTHER = 'concept-greeter';
const WITH_CODE = [TWO, ONE, LOST];

// the temp copy: two anchors with one a bare path, one intent whose code is not there, a second concept
function seedWork(work) {
  cpSync(fixture, work, { recursive: true });
  const two = join(work, 'spec', 'intents', 'adds-numbers.md');
  writeFileSync(two, readFileSync(two, 'utf8').replace('realized_by:\n  - src/math.ts#add\n', 'realized_by:\n  - src/math.ts#add\n  - src/greet.ts\n').replace(/realized_by:\r\n  - src\/math.ts#add\r\n/, 'realized_by:\r\n  - src/math.ts#add\r\n  - src/greet.ts\r\n'));
  writeFileSync(join(work, 'spec', 'intents', 'finds-nothing.md'), ['---', `id: ${LOST}`, 'title: Points at code that is not there', `parent: ${CONCEPT}`, 'confidence: asserted', 'target_kinds:', '  - function', 'realized_by:', '  - src/gone.ts#vanished', '  - src/math.ts#missing', '---', '', '# Points at code that is not there', '', 'One anchor names a file that is gone, one a symbol that is gone.', ''].join('\n'));
  writeFileSync(join(work, 'spec', 'concepts', 'greeter.md'), ['---', `id: ${OTHER}`, 'title: Greeter', 'parent: null', 'confidence: asserted', 'regeneration_scope: atomic', '---', '', '# Greeter', '', 'A second concept, so an intent can move.', ''].join('\n'));
}

// runs in the page: the count on each intent and the rows of each open one
function readNest() {
  const out = {};
  for (const el of document.querySelectorAll('.react-flow__node')) {
    const id = el.getAttribute('data-id');
    const t = el.querySelector('[data-nest-toggle]');
    if (!t) continue;
    const rows = [...el.querySelectorAll('[data-code-row]')].map((r) => ({
      raw: r.getAttribute('data-code-raw'),
      state: r.getAttribute('data-code-state'),
      text: [...r.querySelectorAll('[data-code-name], [data-code-path], [data-code-note]')].map((s) => s.textContent).join(' | '),
      title: r.getAttribute('title') ?? '',
      height: r.getBoundingClientRect().height,
      border: getComputedStyle(r).borderStyle,
      pins: r.querySelectorAll('.react-flow__handle').length,
      inNode: r.closest('.react-flow__node') === el,
    }));
    out[id] = { count: Number(t.getAttribute('data-nest-count')), open: t.getAttribute('data-nest-open') === 'true', text: t.textContent.trim(), title: t.getAttribute('title') ?? '', rows };
  }
  return out;
}
// runs in the page: every node's place and size in flow space, independent of the view
function readPlaces() {
  const out = {};
  for (const el of document.querySelectorAll('.react-flow__node')) {
    const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform);
    out[el.getAttribute('data-id')] = { x: m ? Number(m[1]) : NaN, y: m ? Number(m[2]) : NaN, w: el.offsetWidth, h: el.offsetHeight };
  }
  return out;
}
// runs in the page: pairs of drawn nodes that overlap, a box and what is inside it do not count
function readOverlaps(parents) {
  const els = [...document.querySelectorAll('.react-flow__node')].map((el) => ({ id: el.getAttribute('data-id'), r: el.getBoundingClientRect() }));
  const up = (id) => { const s = new Set(); let cur = id; for (let i = 0; cur && i < 50; i++) { s.add(cur); cur = parents[cur]; } return s; };
  const hits = [];
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i];
      const b = els[j];
      if (up(a.id).has(b.id) || up(b.id).has(a.id)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 1 && h > 1) hits.push(`${a.id} x ${b.id}`);
    }
  }
  return hits;
}
const headerAt = (p, id) => p.evaluate((nid) => {
  const el = document.querySelector(`.react-flow__node[data-id="${nid}"] [data-node-title]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top };
}, id);
const moved = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity);
function placesDiff(a, b) {
  let worst = 0;
  let what = '';
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const p = a[id];
    const q = b[id];
    if (!p || !q) return { worst: Infinity, what: `${id} drawn only ${p ? 'before' : 'after'}` };
    const d = Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.w - q.w), Math.abs(p.h - q.h));
    if (d > worst) { worst = d; what = `${id} ${JSON.stringify(p)} -> ${JSON.stringify(q)}`; }
  }
  return { worst, what };
}
async function graphShape(url) {
  const graph = await (await fetch(new URL('graph.json', url))).json();
  const kindOf = new Map(graph.nodes.map((n) => [n.id, n.kind]));
  const parents = {};
  for (const n of graph.nodes) if (n.parent_id && kindOf.get(n.parent_id) === 'concept') parents[n.id] = n.parent_id;
  return { graph, parents };
}
const frame = async (p, name, opts = {}) => {
  await p.screenshot({ path: join(runDir, `${name}.jpg`), type: 'jpeg', quality: 85, ...opts });
  if (wantFrames) await p.screenshot({ path: join(framesDir, `${name}.jpg`), type: 'jpeg', quality: 85, ...opts });
};
const closeLegend = async (p) => {
  if (await p.locator('[data-legend]').count()) {
    await p.locator('[data-legend-button]').click();
    await p.waitForTimeout(400);
  }
};
const waitOpen = (p, id, open) => p.waitForFunction(([nid, o]) => document.querySelector(`.react-flow__node[data-id="${nid}"] [data-nest-toggle]`)?.getAttribute('data-nest-open') === (o ? 'true' : 'false'), [id, open], { timeout: SHOW_LIMIT_MS });
// the layout is settled once no node moved or changed size for a few frames
const settled = (p) => p.evaluate(() => new Promise((done) => {
  let last = '';
  let same = 0;
  const tick = () => {
    const now = [...document.querySelectorAll('.react-flow__node')].map((e) => `${e.style.transform}|${e.offsetWidth}|${e.offsetHeight}`).join(';');
    same = now === last ? same + 1 : 0;
    last = now;
    if (same >= 3) done();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));
const toggleClick = async (p, id, open) => {
  await p.locator(`${node(id)} [data-nest-toggle]`).click();
  await waitOpen(p, id, open);
  await settled(p);
};
const waitVersion = async (p, before) => {
  await p.waitForFunction((v) => document.documentElement.dataset.graphVersion !== v, before, { timeout: SHOW_LIMIT_MS });
  await settled(p);
};
// a node outside the view is not drawn, so fit first and read the count from the drawn node
const openNow = async (p, id) => {
  await p.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await p.keyboard.press('f');
  await settled(p);
  return (await p.evaluate(readNest))[id]?.open === true;
};
const graphVersion = (p) => p.evaluate(() => document.documentElement.dataset.graphVersion ?? '');

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

  // 1 the fixture on a --write server
  const work = mkdtempSync(join(tmpdir(), 'ig-nested-fixture-'));
  works.push(work);
  seedWork(work);
  const srv = await startServer('server-fixture', work, true);

  // the server's list: order, raw text, path, name, target, line, and no absolute path anywhere
  const shape0 = await graphShape(srv.url);
  const byId = new Map(shape0.graph.nodes.map((n) => [n.id, n]));
  const codeOfId = (id) => byId.get(id)?.code ?? null;
  const two = codeOfId(TWO);
  if (!two || two.map((r) => r.raw).join() !== 'src/math.ts#add,src/greet.ts') await fail(`server list for ${TWO}: ${JSON.stringify(two)}`);
  if (!two[0].target?.startsWith('code_symbol:src/math.ts#add#') || two[0].line !== 1 || two[0].name !== 'add' || two[0].symbol_missing) await fail(`server entry 1 for ${TWO}: ${JSON.stringify(two[0])}`);
  if (two[1].target !== 'code_module:src/greet.ts' || two[1].line !== undefined || two[1].name !== undefined) await fail(`server entry 2 for ${TWO}: ${JSON.stringify(two[1])}`);
  const lost = codeOfId(LOST);
  if (!lost || lost[0].target !== null || lost[1].target !== 'code_module:src/math.ts' || !lost[1].symbol_missing) await fail(`server list for ${LOST}: ${JSON.stringify(lost)}`);
  if (codeOfId(NONE) !== null) await fail(`${NONE} has a list: ${JSON.stringify(codeOfId(NONE))}`);
  const text0 = JSON.stringify(shape0.graph);
  const slash = work.replace(/\\/g, '/');
  if (text0.includes('file://') || text0.includes(slash) || text0.includes(JSON.stringify(work).slice(1, -1))) await fail('graph.json still holds an absolute path');
  const codeNodes = shape0.graph.nodes.filter((n) => n.kind === 'code_module' || n.kind === 'code_symbol');
  if (codeNodes.some((n) => typeof n.path !== 'string') || codeNodes.filter((n) => n.kind === 'code_symbol').some((n) => !(n.line >= 1))) await fail('a code node has no path from the root or a symbol no line');
  const realizes0 = shape0.graph.edges.filter((e) => e.kind === 'realizes').map((e) => e.id).sort();
  console.log(`ok server (${secs()}s) - ${TWO} lists ${two.length} in order with line ${two[0].line}, ${LOST} not found and symbol missing, ${NONE} none, ${codeNodes.length} code nodes with a path from the root, no absolute path, ${realizes0.length} realizes edges`);

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(page, 'fixture');
  await page.goto(srv.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-nest-toggle]').length >= 3, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  await closeLegend(page);
  await settled(page);
  let nest = await page.evaluate(readNest);
  const want = { [TWO]: 2, [ONE]: 1, [LOST]: 2 };
  for (const [id, n] of Object.entries(want)) {
    if (nest[id]?.count !== n || nest[id].text !== `${n} code` || nest[id].open || nest[id].rows.length !== 0 || !nest[id].title) await fail(`closed count on ${id}: ${JSON.stringify(nest[id])}`);
  }
  if (nest[NONE]) await fail(`${NONE} shows a count`);
  if (Object.keys(nest).length !== 3) await fail(`counts on ${Object.keys(nest).join(', ')}, want 3`);
  // one count per node: no pin chip on an intent with code says "code", the count's title keeps the wire meaning
  const chips = await page.evaluate((ids) => ids.map((id) => [...document.querySelectorAll(`.react-flow__node[data-id="${id}"] [data-pin-count]`)].map((c) => c.textContent).join()), WITH_CODE);
  if (chips.some((c) => /code/.test(c))) await fail(`an intent with code still has a code chip: ${JSON.stringify(chips)}`);
  if (!/1 wire from the code block is not drawn/.test(nest[ONE].title)) await fail(`the count's title lost the wire meaning: ${nest[ONE].title}`);
  const places0 = await page.evaluate(readPlaces);
  await frame(page, 'n0-fixture-closed');
  console.log(`ok closed (${secs()}s) - counts ${WITH_CODE.map((id) => `"${nest[id].text}"`).join(', ')}, none on ${NONE}, nothing open`);

  // open by click: rows in the file's order, the title stays put, a row is part of the node and not a node
  let h0 = await headerAt(page, TWO);
  await toggleClick(page, TWO, true);
  let h1 = await headerAt(page, TWO);
  nest = await page.evaluate(readNest);
  const rows = nest[TWO].rows;
  if (rows.map((r) => r.text).join(' / ') !== 'add | src/math.ts / src/greet.ts') await fail(`rows of ${TWO}: ${rows.map((r) => r.text).join(' / ')}`);
  if (rows.some((r) => r.pins !== 0 || !r.inNode || r.border !== 'none' || Math.abs(r.height - 26) > 2)) await fail(`a row looks like a node: ${JSON.stringify(rows)}`);
  if (rows.some((r) => !r.title)) await fail('a row has no title');
  if (!/select it in the graph/.test(rows[0].title)) await fail(`row title in a browser tab: ${rows[0].title}`);
  if (moved(h0, h1) > ANCHOR_PX) await fail(`the title moved ${Math.round(moved(h0, h1))} px on open`);
  let over = await page.evaluate(readOverlaps, shape0.parents);
  if (over.length) await fail(`open by click overlaps: ${over.join(', ')}`);
  await frame(page, 'n1-fixture-one-open');
  const closeUp = await page.locator(node(TWO)).boundingBox();
  if (wantFrames) await page.screenshot({ path: join(framesDir, 'n2-open-node-close.jpg'), type: 'jpeg', quality: 92, clip: { x: Math.max(0, closeUp.x - 12), y: Math.max(0, closeUp.y - 12), width: closeUp.width + 24, height: closeUp.height + 24 } });
  await toggleClick(page, TWO, false);
  let h2 = await headerAt(page, TWO);
  let back = placesDiff(places0, await page.evaluate(readPlaces));
  if (back.worst > BACK_PX) await fail(`close by click left a node ${back.worst} px off: ${back.what}`);
  console.log(`ok click (${secs()}s) - rows "${rows.map((r) => r.text).join('" then "')}", 26 px, no border, no pins, title moved ${Math.round(moved(h0, h1))} and ${Math.round(moved(h0, h2))} px, no overlap, closed back within ${back.worst} px`);

  // the key O on the selected node, the focus stays on it. Tab reaches the node and each row.
  const focusedNode = () => page.evaluate(() => document.activeElement?.closest('.react-flow__node')?.getAttribute('data-id') ?? null);
  await page.locator(`${node(TWO)} [data-node-title]`).click();
  await page.waitForTimeout(400);
  await page.locator(node(TWO)).focus();
  await page.keyboard.press('o');
  await waitOpen(page, TWO, true);
  await settled(page);
  if ((await focusedNode()) !== TWO) await fail(`after O the focus is on ${await focusedNode()}`);
  await page.keyboard.press('o');
  await waitOpen(page, TWO, false);
  await settled(page);
  if ((await focusedNode()) !== TWO) await fail(`after a second O the focus is on ${await focusedNode()}`);
  // O on a node with no code does nothing
  await page.locator(`${node(NONE)} [data-node-title]`).click();
  await page.locator(node(NONE)).focus();
  await page.keyboard.press('o');
  await page.waitForTimeout(400);
  if (Object.values(await page.evaluate(readNest)).some((x) => x.open)) await fail('O on a node with no code opened something');
  // Tab from the node before reaches the node, O opens it, Tab reaches its rows and Enter on a row does what a click does
  await page.keyboard.press('Escape');
  await page.locator('[data-edit-panel]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  await page.locator(node(TWO)).focus();
  await page.keyboard.press('o');
  await waitOpen(page, TWO, true);
  await settled(page);
  const tabbed = [];
  for (let i = 0; i < 6 && tabbed.length < 2; i++) {
    await page.keyboard.press('Tab');
    const at = await page.evaluate(() => { const a = document.activeElement; return a?.hasAttribute('data-code-row') ? { row: a.getAttribute('data-code-row'), ring: getComputedStyle(a).outlineStyle !== 'none' } : null; });
    if (at && !tabbed.some((t) => t.row === at.row)) tabbed.push(at);
  }
  if (tabbed.length !== 2 || tabbed.some((t) => !t.ring)) await fail(`Tab reached rows ${JSON.stringify(tabbed)} of 2`);
  const target0 = two[0].target;
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.waitForFunction((id) => document.querySelector(`.react-flow__node[data-id="${id}"]`)?.classList.contains('selected'), target0, { timeout: SHOW_LIMIT_MS }).catch(() => {});
  if (!(await page.evaluate((id) => document.querySelector(`.react-flow__node[data-id="${id}"]`)?.classList.contains('selected'), target0))) await fail('Enter on a row did not select its code');
  await page.locator(node(TWO)).focus();
  await page.keyboard.press('o');
  await waitOpen(page, TWO, false);
  await settled(page);
  console.log(`ok keys (${secs()}s) - O opens and closes with the focus kept on the node, O on no code does nothing, Tab reaches ${tabbed.length} rows with a ring, Enter on a row selects its code`);

  // a rename field takes the letter, nothing toggles
  await page.locator(`${node(TWO)} [data-node-title]`).click();
  await page.keyboard.press('F2');
  const field = page.locator('[data-rename-field]');
  await field.waitFor({ timeout: 3000 });
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-rename-field'), null, { timeout: 3000 }).catch(() => {});
  if (!(await page.evaluate(() => document.activeElement?.hasAttribute('data-rename-field')))) await field.click();
  await page.keyboard.press('End');
  await page.keyboard.type('o');
  await page.waitForTimeout(300);
  const typed = await field.inputValue();
  if (!typed.endsWith('o') || (await page.evaluate(readNest))[TWO].open) await fail(`O in the rename field: "${typed}", open ${(await page.evaluate(readNest))[TWO].open}`);
  await page.keyboard.press('Escape');
  await field.waitFor({ state: 'detached', timeout: 3000 });
  await page.keyboard.press('Escape');
  await page.locator('[data-edit-panel]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});

  // the menu: show, hide, and disabled with its reason on a node with no code
  const menuPick = async (id, item) => {
    await page.locator(`${node(id)} [data-node-title]`).click({ button: 'right' });
    await page.locator('[data-context-menu="intent"]').waitFor({ timeout: 3000 });
    const entry = page.locator(`[data-menu-item="${item}"]`);
    const info = { label: (await entry.innerText()).trim(), disabled: (await entry.getAttribute('aria-disabled')) === 'true', title: (await entry.getAttribute('title')) ?? '' };
    return { entry, info };
  };
  let m = await menuPick(TWO, 'toggle-code');
  if (m.info.label !== 'Show code' || m.info.disabled) await fail(`menu entry on a closed node: ${JSON.stringify(m.info)}`);
  await m.entry.click();
  await waitOpen(page, TWO, true);
  await settled(page);
  m = await menuPick(TWO, 'toggle-code');
  if (m.info.label !== 'Hide code') await fail(`menu entry on an open node: ${JSON.stringify(m.info)}`);
  await m.entry.click();
  await waitOpen(page, TWO, false);
  await settled(page);
  m = await menuPick(NONE, 'toggle-code');
  const reason = await page.locator('[data-menu-reason]').innerText().catch(() => '');
  if (!m.info.disabled || !m.info.title || !/no code/i.test(reason)) await fail(`menu entry on a node with no code: ${JSON.stringify(m.info)}, note "${reason}"`);
  await m.entry.click({ force: true });
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  if (Object.values(await page.evaluate(readNest)).some((x) => x.open)) await fail('the disabled menu entry opened something');
  console.log(`ok menu (${secs()}s) - "Show code" opens, "Hide code" closes, disabled on ${NONE} with "${reason}"`);

  // code that is not there: one row says not found, one says the symbol is missing
  await toggleClick(page, LOST, true);
  nest = await page.evaluate(readNest);
  const lostRows = nest[LOST].rows;
  if (lostRows.map((r) => r.state).join() !== 'not-found,symbol-missing') await fail(`not found rows: ${JSON.stringify(lostRows)}`);
  if (lostRows[0].text !== 'vanished | src/gone.ts | code not found' || lostRows[1].text !== 'missing | src/math.ts | symbol not found, file linked') await fail(`not found words: ${lostRows.map((r) => r.text).join(' / ')}`);
  await frame(page, 'n3-not-found');
  const lostBox = await page.locator(node(LOST)).boundingBox();
  if (wantFrames) await page.screenshot({ path: join(framesDir, 'n3-not-found-close.jpg'), type: 'jpeg', quality: 92, clip: { x: Math.max(0, lostBox.x - 12), y: Math.max(0, lostBox.y - 12), width: lostBox.width + 24, height: lostBox.height + 24 } });
  // a click on a row that was not found does nothing
  const sel0 = await page.evaluate(() => [...document.querySelectorAll('.react-flow__node.selected')].map((e) => e.getAttribute('data-id')).join());
  // the row is aria-disabled, playwright will not click that without force
  await page.locator(`${node(LOST)} [data-code-row="0"]`).click({ force: true });
  await page.waitForTimeout(300);
  const sel1 = await page.evaluate(() => [...document.querySelectorAll('.react-flow__node.selected')].map((e) => e.getAttribute('data-id')).join());
  if (sel1 !== sel0) await fail(`a click on a row not found changed the selection: ${sel0} -> ${sel1}`);
  await toggleClick(page, LOST, false);
  console.log(`ok not found (${secs()}s) - "${lostRows[0].text}" and "${lostRows[1].text}", a click on the first does nothing`);

  // a click on a row in a browser tab selects the code node and brings it into view
  await toggleClick(page, TWO, true);
  await page.locator(`${node(TWO)} [data-code-row="1"]`).click();
  await page.waitForFunction(() => document.querySelector('.react-flow__node[data-id="code_module:src/greet.ts"]')?.classList.contains('selected'), null, { timeout: SHOW_LIMIT_MS }).catch(() => {});
  await page.waitForTimeout(500);
  const shown = await page.evaluate(() => {
    const el = document.querySelector('.react-flow__node[data-id="code_module:src/greet.ts"]');
    const c = document.querySelector('.react-flow').getBoundingClientRect();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { selected: el.classList.contains('selected'), inView: r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom };
  });
  if (!shown?.selected || !shown.inView) await fail(`a row click in a browser tab: ${JSON.stringify(shown)}`);
  // a double-click and Enter on a code node change nothing in a browser tab
  const before = await page.evaluate(readPlaces);
  await page.locator(node('code_module:src/greet.ts')).dblclick();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  if (placesDiff(before, await page.evaluate(readPlaces)).worst > BACK_PX) await fail('a double-click or Enter on a code node changed the graph in a browser tab');
  console.log(`ok row click (${secs()}s) - a row selected code_module:src/greet.ts and brought it into view, a double-click and Enter on it changed nothing`);

  // open survives a rename in place, a move into another concept, its undo and a live update
  const twoFile = join(work, 'spec', 'intents', 'adds-numbers.md');
  // the row click centred the code node, the intent may be outside the view and not drawn
  await page.keyboard.press('f');
  await settled(page);
  let v = await graphVersion(page);
  await page.locator(`${node(TWO)} [data-node-title]`).click();
  await page.keyboard.press('F2');
  await field.waitFor({ timeout: 3000 });
  await field.fill('Adding two numbers gives the sum');
  await page.keyboard.press('Enter');
  await waitVersion(page, v);
  if (!readFileSync(twoFile, 'utf8').includes('title: Adding two numbers gives the sum')) await fail('the rename did not reach the file');
  if (!(await page.evaluate(readNest))[TWO]?.open) await fail('a rename in place closed the node');
  await page.keyboard.press('Escape');
  await page.locator('[data-edit-panel]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  v = await graphVersion(page);
  const token = await page.evaluate(() => window.__INTENTGRAPH_LIVE__.token);
  const st = await page.evaluate(async ([id, parent, t]) => (await fetch(`/api/parent?id=${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-intentgraph-token': t }, body: JSON.stringify({ parent }) })).status, [TWO, OTHER, token]);
  if (st !== 200) await fail(`the move answered ${st}`);
  await waitVersion(page, v);
  if (!readFileSync(twoFile, 'utf8').includes(`parent: ${OTHER}`)) await fail('the move did not reach the file');
  if (!(await openNow(page, TWO))) await fail('a move into another concept closed the node');
  over = await page.evaluate(readOverlaps, (await graphShape(srv.url)).parents);
  if (over.length) await fail(`after the move overlaps: ${over.join(', ')}`);
  v = await graphVersion(page);
  await page.keyboard.press('Control+z');
  await waitVersion(page, v);
  if (!readFileSync(twoFile, 'utf8').includes(`parent: ${CONCEPT}`)) await fail('undo did not move the node back');
  if (!(await openNow(page, TWO))) await fail('undo of the move closed the node');
  v = await graphVersion(page);
  writeFileSync(twoFile, readFileSync(twoFile, 'utf8').replace(/  - src\/greet\.ts(\r?\n)/, '  - src/greet.ts$1  - src/math.ts$1'));
  await waitVersion(page, v);
  nest = await page.evaluate(readNest);
  if (!nest[TWO]?.open || nest[TWO].rows.map((r) => r.text).join(' / ') !== 'add | src/math.ts / src/greet.ts / src/math.ts') await fail(`after a live update: ${JSON.stringify(nest[TWO])}`);
  over = await page.evaluate(readOverlaps, (await graphShape(srv.url)).parents);
  if (over.length) await fail(`after the live update overlaps: ${over.join(', ')}`);
  const realizesNow = (await graphShape(srv.url)).graph.edges.filter((e) => e.kind === 'realizes').length;
  console.log(`ok survives (${secs()}s) - still open after a rename, a move to ${OTHER}, its undo and a live update that added a third row, ${realizesNow} realizes edges`);

  // every intent open: no overlap. every intent closed: every node back within 1 px.
  await toggleClick(page, TWO, false);
  await page.keyboard.press('f');
  await settled(page);
  const shapeAll = await graphShape(srv.url);
  const placesClosed = await page.evaluate(readPlaces);
  const fitThen = async (id, open) => { await page.keyboard.press('f'); await settled(page); await toggleClick(page, id, open); };
  for (const id of WITH_CODE) await fitThen(id, true);
  await page.keyboard.press('f');
  await settled(page);
  over = await page.evaluate(readOverlaps, shapeAll.parents);
  if (over.length) await fail(`every intent open overlaps: ${over.join(', ')}`);
  await frame(page, 'n4-fixture-all-open');
  const counted = Object.values(await page.evaluate(readNest)).reduce((a, x) => a + x.rows.length, 0);
  for (const id of WITH_CODE) await fitThen(id, false);
  back = placesDiff(placesClosed, await page.evaluate(readPlaces));
  if (back.worst > BACK_PX) await fail(`closing every intent left a node ${back.worst} px off: ${back.what}`);
  const codeBlock = (pl) => Object.keys(pl).filter((id) => id.startsWith('code_')).sort().join();
  if (codeBlock(placesClosed) !== codeBlock(await page.evaluate(readPlaces))) await fail('the code block changed after opening and closing');
  console.log(`ok all open (${secs()}s) - ${WITH_CODE.length} open with ${counted} rows and no overlap, all closed back within ${back.worst} px`);

  // the menu near the right edge with the panel open: inside the window, above the panel, the first entry takes the click
  await page.keyboard.press('f');
  await settled(page);
  await page.locator(`${node(TWO)} [data-node-title]`).click();
  await page.locator(`[data-edit-panel="${TWO}"]`).waitFor({ timeout: 3000 });
  await page.waitForTimeout(500);
  const panelBox = await page.locator('[data-edit-panel]').boundingBox();
  const nb = await page.locator(node(TWO)).boundingBox();
  const dx = Math.round(panelBox.x - 70 - nb.x);
  await page.mouse.move(12, 300);
  await page.mouse.down();
  await page.mouse.move(12 + dx / 2, 300, { steps: 4 });
  await page.mouse.move(12 + dx, 300, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const nb2 = await page.locator(node(TWO)).boundingBox();
  await page.mouse.click(nb2.x + 30, nb2.y + 20, { button: 'right' });
  await page.locator('[data-context-menu="intent"]').waitFor({ timeout: 3000 });
  await page.waitForTimeout(200);
  const menuAt = await page.evaluate(() => {
    const m = document.querySelector('[data-context-menu]');
    const r = m.getBoundingClientRect();
    const first = m.querySelector('[data-menu-item]');
    const f = first.getBoundingClientRect();
    const hit = document.elementFromPoint(f.left + f.width / 2, f.top + f.height / 2);
    const panel = document.querySelector('[data-edit-panel]').getBoundingClientRect();
    return { inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, overPanel: r.right > panel.left, onTop: first.contains(hit), first: first.getAttribute('data-menu-item'), right: r.right, win: innerWidth };
  });
  await frame(page, 'n6-menu-right-edge');
  if (!menuAt.inside || !menuAt.onTop) await fail(`the menu near the right edge: ${JSON.stringify(menuAt)}`);
  await page.locator(`[data-menu-item="${menuAt.first}"]`).click();
  await page.locator('[data-rename-field]').waitFor({ timeout: 3000 }).catch(() => {});
  if ((await page.locator('[data-rename-field]').count()) !== 1) await fail(`a click on the first menu entry (${menuAt.first}) did not land`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('[data-edit-panel]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  console.log(`ok menu edge (${secs()}s) - with the panel open the menu ends at ${Math.round(menuAt.right)} of ${menuAt.win} px, ${menuAt.overPanel ? 'over the panel and on top' : 'clear of the panel'}, a click on "${menuAt.first}" landed`);

  // 480 px: open one with the key, no sideways scroll, rows cut with the full text in the title
  const p480 = await browser.newPage({ viewport: { width: 480, height: 800 } });
  watch(p480, '480');
  await p480.goto(srv.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p480.waitForFunction(() => document.querySelectorAll('[data-nest-toggle]').length >= 3, null, { timeout: 30000 });
  await closeLegend(p480);
  await settled(p480);
  await p480.locator(node(TWO)).focus();
  await p480.keyboard.press('o');
  await waitOpen(p480, TWO, true);
  await settled(p480);
  await p480.keyboard.press('f');
  await settled(p480);
  const narrow = await p480.evaluate((id) => ({ sideways: document.documentElement.scrollWidth > innerWidth, rows: document.querySelectorAll(`.react-flow__node[data-id="${id}"] [data-code-row]`).length, titled: [...document.querySelectorAll(`.react-flow__node[data-id="${id}"] [data-code-row]`)].every((r) => (r.getAttribute('title') ?? '').length > 0) }), TWO);
  if (narrow.sideways || narrow.rows !== 3 || !narrow.titled) await fail(`at 480 px: ${JSON.stringify(narrow)}`);
  await frame(p480, 'n5-480-one-open');
  await p480.close();
  console.log(`ok 480 (${secs()}s) - O opened ${TWO} with ${narrow.rows} rows, no sideways scroll, every row titled`);
  await page.close();
  if (!(await stopServer(srv))) await fail('fixture server did not stop');

  // 2 the same copy on a server without --write: open, close, a key, the menu and a row click send only GET
  const ro = await startServer('server-read-only', work, false);
  const rp = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(rp, 'read-only');
  const methods = [];
  rp.on('request', (r) => { if (r.url().startsWith(ro.url.replace(/\/$/, ''))) methods.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await rp.goto(ro.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await rp.waitForFunction(() => document.querySelectorAll('[data-nest-toggle]').length >= 3, null, { timeout: 30000 });
  await closeLegend(rp);
  await settled(rp);
  await toggleClick(rp, ONE, true);
  await rp.locator(`${node(ONE)} [data-code-row="0"]`).click();
  await rp.waitForTimeout(400);
  await rp.keyboard.press('f');
  await settled(rp);
  await toggleClick(rp, ONE, false);
  await rp.locator(node(TWO)).focus();
  await rp.keyboard.press('o');
  await waitOpen(rp, TWO, true);
  await settled(rp);
  await rp.locator(`${node(TWO)} [data-node-title]`).click({ button: 'right' });
  await rp.locator('[data-menu-item="toggle-code"]').waitFor({ timeout: 3000 });
  const roEntry = await rp.locator('[data-menu-item="toggle-code"]').getAttribute('aria-disabled');
  await rp.locator('[data-menu-item="toggle-code"]').click();
  await waitOpen(rp, TWO, false);
  const notGet = methods.filter((x) => !x.startsWith('GET '));
  if (roEntry === 'true' || notGet.length) await fail(`read only: menu entry disabled ${roEntry}, requests ${notGet.join(', ')}`);
  await rp.close();
  if (!(await stopServer(ro))) await fail('read-only server did not stop');
  console.log(`ok read only (${secs()}s) - click, row, O and the menu work without --write, ${methods.length} requests all GET`);

  // 3 this repo with the real report from the main checkout: accept one proposal, open it, time it
  const mainRoot = resolve(root, '..', '..');
  const latest = join(mainRoot, '.runs', 'infer', 'latest.json');
  let repoNote = 'repo block skipped, no real report in the main checkout';
  if (existsSync(latest) && mainRoot !== root) {
    const named = String(JSON.parse(readFileSync(latest, 'utf8')).report ?? '');
    const reportPath = isAbsolute(named) ? named : join(mainRoot, named);
    const rwork = mkdtempSync(join(tmpdir(), 'ig-nested-repo-'));
    works.push(rwork);
    const skip = new Set(['node_modules', '.git', '.runs', '.wt', 'dist', '.turbo']);
    cpSync(root, rwork, { recursive: true, filter: (src) => !skip.has(basename(src)) });
    mkdirSync(join(rwork, '.runs', 'infer', 'run-real'), { recursive: true });
    cpSync(reportPath, join(rwork, '.runs', 'infer', 'run-real', 'report.json'));
    writeFileSync(join(rwork, '.runs', 'infer', 'latest.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'copied', report: '.runs/infer/run-real/report.json' }));
    const rsrv = await startServer('server-repo', rwork, true);
    const rshape = await graphShape(rsrv.url);
    const found = new Map();
    for (const e of rshape.graph.edges) if (e.kind === 'realizes') found.set(e.dst, (found.get(e.dst) ?? 0) + 1);
    const pick = rshape.graph.nodes.filter((n) => n.inferred && (found.get(n.id) ?? 0) > 0).sort((a, b) => (found.get(b.id) ?? 0) - (found.get(a.id) ?? 0))[0];
    if (!pick) await fail('no proposal in the real report cites code that is in the graph');
    // the accept route takes the node id, inferred:<proposal id>
    const pid = pick.id;
    const rpage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    watch(rpage, 'repo');
    await rpage.goto(rsrv.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await rpage.waitForFunction(() => document.querySelectorAll('[data-nest-toggle]').length > 0 || document.querySelectorAll('[data-fold-row]').length > 0, null, { timeout: 60000 });
    await closeLegend(rpage);
    const tok = await rpage.evaluate(() => window.__INTENTGRAPH_LIVE__.token);
    const acc = await rpage.evaluate(async ([id, t]) => { const r = await fetch(`/api/inferred/accept?id=${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-intentgraph-token': t }, body: '{}' }); return { status: r.status, body: await r.json() }; }, [pid, tok]);
    if (acc.status !== 201) await fail(`accept answered ${acc.status}: ${JSON.stringify(acc.body)}`);
    const iid = acc.body.id;
    // the repo's rebuild can take a while, wait for the server to hold the new intent with its code
    const until = Date.now() + 60000;
    while (Date.now() < until && !(await graphShape(rsrv.url)).graph.nodes.some((n) => n.id === iid && n.code)) await new Promise((r) => setTimeout(r, 250));
    await rpage.goto(`${rsrv.url}?focus=${encodeURIComponent(iid)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await rpage.locator(`${node(iid)} [data-nest-toggle]`).waitFor({ timeout: 60000 });
    await closeLegend(rpage);
    await settled(rpage);
    const times = [];
    for (let i = 0; i < TIMED_RUNS * 2; i++) {
      const open = i % 2 === 0;
      const t = Date.now();
      await toggleClick(rpage, iid, open);
      if (open) times.push(Date.now() - t);
      if (open && i === 0) {
        await frame(rpage, 'n7-repo-accepted-open');
        const rnest = (await rpage.evaluate(readNest))[iid];
        repoNote = `${iid} accepted from ${pid} with ${rnest.rows.length} rows`;
        const rover = await rpage.evaluate(readOverlaps, (await graphShape(rsrv.url)).parents);
        if (rover.length) await fail(`repo copy open overlaps: ${rover.slice(0, 3).join(', ')}`);
      }
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    if (median > OPEN_MEDIAN_MS) await fail(`repo copy: click to settled ${median} ms median of ${TIMED_RUNS}, limit ${OPEN_MEDIAN_MS}: ${times.join(', ')}`);
    repoNote += `, click to settled median ${median} ms of ${times.join(', ')}`;
    await rpage.close();
    if (!(await stopServer(rsrv))) await fail('repo server did not stop');
  }
  console.log(`ok repo (${secs()}s) - ${repoNote}`);

  if (errors.length) await fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  await finish(true, 'all steps passed');
} catch (err) {
  await fail(`crashed: ${err && err.stack ? err.stack.split('\n').slice(0, 3).join(' ') : err}`);
}
