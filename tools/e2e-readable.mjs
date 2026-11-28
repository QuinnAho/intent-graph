#!/usr/bin/env node
// proves a first view you can read (lane 17). usage: node tools/e2e-readable.mjs [--no-build] [--frames]
// 1 a temp copy of this repo with the real inference report from the main checkout, read only, driven
//   headless: at 1440, 700 and 480 px the first view's titles are 9 px or more, the view starts at the
//   top left of the spec block, F shows all, F again goes back, the line at the foot comes and goes,
//   the minimap moves the view, the bar names the folder.
// 2 a temp copy of the example on a --write live server: the legend of a first visit covers no node,
//   closing it fits again, the "?" words under 700 px, the Checks words, pin areas, the toast after
//   accept, the sheet under 600 px and the bar's two lines at 480.
// --frames writes the lane frames to .runs/frames-lane17. no model call: every report is canned or copied.
// prints one line per step, then PASS|FAIL e2e-readable (time) - note. exit 0 only on pass.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const runDir = join(root, '.runs', 'e2e-readable', stamp);
const framesDir = join(root, '.runs', 'frames-lane17');
mkdirSync(runDir, { recursive: true });
if (wantFrames) mkdirSync(framesDir, { recursive: true });

// limits from the lane note
const TEXT_MIN_PX = 9;
const FLOOR = 0.7;
const INSET_PX = 24;
const CORNER_TOL_PX = 3;
const SHOW_LIMIT_MS = 6000;
const STOP_LIMIT_MS = 10000;
const PIN_MIN_PX = 12;
const ACCEPT_LIMIT_MS = 2000;

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
  console.log(`${ok ? 'PASS' : 'FAIL'} e2e-readable (${secs()}s) - ${note}`);
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

const frame = async (p, name, opts = {}) => {
  await p.screenshot({ path: join(runDir, `${name}.jpg`), type: 'jpeg', quality: 85, ...opts });
  if (wantFrames) await p.screenshot({ path: join(framesDir, `${name}.jpg`), type: 'jpeg', quality: 85, ...opts });
};
const viewOf = (p) => p.evaluate(() => getComputedStyle(document.querySelector('.react-flow__viewport')).transform);

// runs in the page: the zoom, the drawn title size in px, where the spec block's top left sits, and what is cut off
function readView(specIds) {
  const c = document.querySelector('.react-flow').getBoundingClientRect();
  const m = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform);
  const zoom = m.a;
  const titles = [...document.querySelectorAll('[data-node-title]')];
  const sizes = titles.map((t) => parseFloat(getComputedStyle(t).fontSize) * (t.getBoundingClientRect().height / Math.max(1, t.offsetHeight)));
  const ids = new Set(specIds);
  let left = Infinity;
  let top = Infinity;
  const outside = [];
  let readable = 0;
  for (const el of document.querySelectorAll('.react-flow__node')) {
    const id = el.getAttribute('data-id');
    if (!ids.has(id)) continue;
    const r = el.getBoundingClientRect();
    left = Math.min(left, r.left - c.left);
    top = Math.min(top, r.top - c.top);
    if (r.left < c.left - 1 || r.top < c.top - 1 || r.right > c.right + 1 || r.bottom > c.bottom + 1) outside.push(id);
  }
  for (const t of titles) {
    const r = t.getBoundingClientRect();
    if (r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom && r.width > 0) readable += 1;
  }
  const drawn = new Set([...document.querySelectorAll('.react-flow__node')].map((e) => e.getAttribute('data-id')));
  return {
    zoom,
    textPx: sizes.length ? Math.min(...sizes) : 0,
    left,
    top,
    outside,
    missing: specIds.filter((id) => !drawn.has(id)),
    titlesInView: readable,
    hint: document.querySelector('[data-partial-hint]')?.textContent ?? null,
    minimap: document.querySelector('.react-flow__minimap') !== null,
    docWidth: document.documentElement.scrollWidth,
    winWidth: innerWidth,
  };
}
// a canned proposal row, every field InferProposalRowSchema asks for (as e2e-fold)
const row = (id, title, over = {}) => ({
  id, folder: 'src', title, body: `${title}. Read from the code in src.`, anchors: ['src/math.ts'], belongs_under: 'concept-calculator', restates: null, confidence: 'inferred', planned: false, code_hash: `hash-${id}`, ...over,
});
function writeInfer(work, proposals) {
  const dir = join(work, '.runs', 'infer', 'run-1');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', report: { incomplete: false, stopped: null, proposals } }));
  writeFileSync(join(work, '.runs', 'infer', 'latest.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', report: '.runs/infer/run-1/report.json' }));
}
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ACCEPT_RUNS = 5;
// wcag contrast in node, from the colours the page computed
const rgbOf = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const lum = (c) => { const l = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const mix = (a, b, t) => a.map((v, i) => t * v + (1 - t) * b[i]);
const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// accepts a proposal by its row on the canvas and times click to drawn as declared. returns ms, the toast and whether the new one is selected
async function acceptTimed(p, work, proposalId, title) {
  const sel = `.react-flow__node[data-id="inferred:${proposalId}"]`;
  await p.locator(sel).waitFor({ timeout: SHOW_LIMIT_MS });
  await p.locator(sel).click({ position: { x: 30, y: 30 } });
  await p.waitForTimeout(400);
  const t = Date.now();
  await p.keyboard.press('Enter');
  const id = `intent-${slug(title)}`;
  await p.waitForFunction((nid) => { const el = document.querySelector(`.react-flow__node[data-id="${nid}"]`); return el && !el.querySelector('[data-inferred]'); }, id, { timeout: 30000 });
  const ms = Date.now() - t;
  await p.waitForTimeout(400);
  const after = await p.evaluate((nid) => ({ toast: document.querySelector('[data-notice]')?.textContent ?? '', undo: document.querySelector('[data-notice-undo]') !== null, selected: document.querySelector(`.react-flow__node[data-id="${nid}"]`)?.classList.contains('selected') === true }), id);
  const file = join(work, 'spec', 'intents', `${slug(title)}.md`);
  return { ms, id, file, written: existsSync(file), ...after };
}
const overlap = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const rectOf = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null; }, sel);

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

  // 1 this repo with the real report from the main checkout
  const mainRoot = resolve(root, '..', '..');
  const latest = join(mainRoot, '.runs', 'infer', 'latest.json');
  if (!existsSync(latest) || mainRoot === root) await fail('no real inference report in the main checkout, the lane needs one');
  const named = String(JSON.parse(readFileSync(latest, 'utf8')).report ?? '');
  const reportPath = isAbsolute(named) ? named : join(mainRoot, named);
  const rwork = mkdtempSync(join(tmpdir(), 'ig-readable-repo-'));
  works.push(rwork);
  const skip = new Set(['node_modules', '.git', '.runs', '.wt', 'dist', '.turbo']);
  cpSync(root, rwork, { recursive: true, filter: (src) => !skip.has(basename(src)) });
  mkdirSync(join(rwork, '.runs', 'infer', 'run-real'), { recursive: true });
  cpSync(reportPath, join(rwork, '.runs', 'infer', 'run-real', 'report.json'));
  writeFileSync(join(rwork, '.runs', 'infer', 'latest.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'copied', report: '.runs/infer/run-real/report.json' }));
  const rsrv = await startServer('server-repo', rwork, false);
  const graph = await (await fetch(new URL('graph.json', rsrv.url))).json();
  const specIds = graph.nodes.filter((n) => ['intent', 'constraint', 'decision', 'concept'].includes(n.kind) && !n.inferred).map((n) => n.id);
  const open = async (w, h, url = rsrv.url) => {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    watch(p, `repo-${w}`);
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => document.querySelectorAll('[data-fold-row]').length > 0, null, { timeout: 60000 });
    await p.waitForTimeout(800);
    return p;
  };

  const sizes = [[1440, 900], [700, 800], [480, 800]];
  const seen = [];
  for (const [w, h] of sizes) {
    const p = await open(w, h);
    // the legend of a first visit lies over the canvas at 1440 and 700, close it so the corner is what is measured
    if (await p.locator('[data-legend]').count()) {
      await p.locator('[data-legend-button]').click();
      await p.waitForTimeout(500);
    }
    const v = await p.evaluate(readView, specIds);
    if (v.zoom < FLOOR - 1e-6) await fail(`at ${w} the first view is at zoom ${v.zoom.toFixed(3)}, under ${FLOOR}`);
    if (v.textPx < TEXT_MIN_PX) await fail(`at ${w} the smallest title is ${v.textPx.toFixed(1)} px, want ${TEXT_MIN_PX} or more`);
    if (v.titlesInView === 0) await fail(`at ${w} the first view holds no whole title, it starts on empty canvas`);
    if (v.docWidth > v.winWidth) await fail(`at ${w} the page scrolls sideways`);
    const partial = v.outside.length > 0 || v.missing.length > 0;
    if (partial) {
      if (Math.abs(v.left - INSET_PX) > CORNER_TOL_PX || Math.abs(v.top - INSET_PX) > CORNER_TOL_PX) await fail(`at ${w} the spec block's top left is at ${v.left.toFixed(1)}, ${v.top.toFixed(1)}, want ${INSET_PX}, ${INSET_PX}`);
      if (!v.hint || !/F shows all/.test(v.hint)) await fail(`at ${w} the view holds part of the graph but the line says ${JSON.stringify(v.hint)}`);
    } else if (v.hint) await fail(`at ${w} the whole block is in view but the line shows`);
    if ((w >= 700) !== v.minimap) await fail(`at ${w} the minimap is ${v.minimap ? 'there' : 'missing'}`);
    if (v.minimap && v.hint && overlap(await rectOf(p, '.react-flow__minimap'), await rectOf(p, '[data-partial-hint]'))) await fail(`at ${w} the minimap covers the line`);
    await frame(p, `repo-${w}x${h}-first`);
    // F shows all of the spec block, the line goes
    await p.locator('.react-flow__pane').focus().catch(() => {});
    await p.keyboard.press('f');
    await p.waitForTimeout(400);
    const all = await p.evaluate(readView, specIds);
    if (all.outside.length || all.missing.length) await fail(`at ${w} F left ${all.outside.length + all.missing.length} declared nodes out of view`);
    if (all.hint) await fail(`at ${w} the line is still there after F`);
    await frame(p, `repo-${w}x${h}-after-f`);
    // F again goes back to the readable start
    await p.keyboard.press('f');
    await p.waitForTimeout(400);
    const back = await p.evaluate(readView, specIds);
    if (Math.abs(back.zoom - v.zoom) > 1e-3 || Math.abs(back.left - v.left) > CORNER_TOL_PX || Math.abs(back.top - v.top) > CORNER_TOL_PX) await fail(`at ${w} F again went to zoom ${back.zoom.toFixed(3)} at ${back.left.toFixed(0)}, ${back.top.toFixed(0)}, not the start`);
    seen.push(`${w}: zoom ${v.zoom.toFixed(2)}, text ${v.textPx.toFixed(1)} px, ${partial ? `starts at ${v.left.toFixed(0)},${v.top.toFixed(0)}` : 'all in view'}, F zoom ${all.zoom.toFixed(2)}`);
    await p.close();
  }
  console.log(`ok floor (${secs()}s) - ${seen.join(' | ')}`);

  // the line goes when the person moves the view, the minimap moves the view
  {
    const p = await open(1440, 900);
    if (await p.locator('[data-legend]').count()) {
      await p.locator('[data-legend-button]').click();
      await p.waitForTimeout(500);
    }
    if (!(await p.locator('[data-partial-hint]').count())) await fail('no line on the repo at 1440');
    const before = await viewOf(p);
    const mm = await rectOf(p, '.react-flow__minimap');
    await p.mouse.click(mm.left + mm.width * 0.8, mm.top + mm.height * 0.8);
    await p.waitForTimeout(500);
    const after = await viewOf(p);
    if (after === before) await fail('a click on the minimap did not move the view');
    if (await p.locator('[data-partial-hint]').count()) await fail('the line stayed after a click on the minimap');
    const p2 = await open(1440, 900);
    if (await p2.locator('[data-legend]').count()) { await p2.locator('[data-legend-button]').click(); await p2.waitForTimeout(500); }
    const m2 = await rectOf(p2, '.react-flow__minimap');
    const v0 = await viewOf(p2);
    await p2.mouse.move(m2.left + m2.width * 0.2, m2.top + m2.height * 0.2);
    await p2.mouse.down();
    await p2.mouse.move(m2.left + m2.width * 0.6, m2.top + m2.height * 0.7, { steps: 6 });
    await p2.mouse.up();
    await p2.waitForTimeout(300);
    if ((await viewOf(p2)) === v0) await fail('a drag on the minimap did not move the view');
    const p3 = await open(1440, 900);
    if (await p3.locator('[data-legend]').count()) { await p3.locator('[data-legend-button]').click(); await p3.waitForTimeout(500); }
    await p3.mouse.move(700, 400);
    await p3.mouse.down();
    await p3.mouse.move(600, 350, { steps: 5 });
    await p3.mouse.up();
    await p3.waitForTimeout(300);
    if (await p3.locator('[data-partial-hint]').count()) await fail('the line stayed after a pan');
    await p.close();
    await p2.close();
    await p3.close();
    console.log(`ok line and minimap (${secs()}s) - the line goes on a minimap click and on a pan, a click and a drag on the minimap move the view`);
  }
  if (!(await stopServer(rsrv))) await fail('repo server did not stop');

  // 2 the example on a write server
  const work = mkdtempSync(join(tmpdir(), 'ig-readable-example-'));
  works.push(work);
  cpSync(fixture, work, { recursive: true });
  // a canned report: proposals to accept in the concept, and a planned one with no concept
  writeInfer(work, [
    ...Array.from({ length: ACCEPT_RUNS }, (_, i) => row(`inf-a${i}`, `Readable proposal ${i + 1} for the calculator`)),
    row('inf-plan', 'Keeps a helper for later', { planned: true, belongs_under: null, confidence: 'semantic' }),
  ]);
  const srv = await startServer('server-example', work, true);
  const ex = async (w, h) => {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    watch(p, `example-${w}`);
    await p.goto(srv.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.locator('.react-flow__node').first().waitFor({ timeout: 30000 });
    await p.waitForTimeout(800);
    return p;
  };
  {
    const p = await ex(1440, 900);
    const legend = await rectOf(p, '[data-legend]');
    if (!legend) await fail('the legend did not open on a first visit at 1440');
    const under = await p.evaluate((l) => [...document.querySelectorAll('.react-flow__node')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > l.left && r.left < l.right && r.bottom > l.top && r.top < l.bottom; }).map((e) => e.getAttribute('data-id')), legend);
    if (under.length) await fail(`the legend covers ${under.join(', ')}`);
    await frame(p, 'example-legend-open');
    const v0 = await viewOf(p);
    await p.locator('[data-legend-button]').click();
    await p.waitForTimeout(500);
    if ((await viewOf(p)) === v0) await fail('closing the legend did not fit again');
    await p.close();
    console.log(`ok legend (${secs()}s) - the legend of a first visit covers no node, closing it fits again`);
  }
  {
    const p = await ex(480, 800);
    const words = await p.locator('[data-legend-words]').textContent().catch(() => null);
    if (words !== 'what the marks mean') await fail(`at 480 the "?" says ${JSON.stringify(words)}`);
    await p.locator('[data-legend-button]').click();
    await p.locator('[data-legend]').waitFor({ timeout: 3000 });
    await p.locator('[data-legend-button]').click();
    await p.waitForTimeout(300);
    if (await p.locator('[data-legend-words]').count()) await fail('the "?" keeps its words after the legend was opened');
    await p.close();
    console.log(`ok "?" words (${secs()}s) - at 480 the "?" says "${words}" until the legend was opened once`);
  }
  // part b: the bar names the folder and says it is live, the Checks counts, the pending mark's title
  {
    const p = await ex(1440, 900);
    const place = await p.evaluate(() => {
      const f = document.querySelector('[data-bar-folder]');
      const live = document.querySelector('[data-bar-live]');
      const pend = document.querySelector('.react-flow__node[data-id="intent-has-no-checks"] [data-check-status="pending"]');
      return { folder: f?.getAttribute('data-bar-folder') ?? null, folderText: f?.textContent ?? '', live: live?.getAttribute('title') ?? null, noChecks: document.querySelector('[data-bar-no-checks]') !== null, verified: document.querySelector('[data-bar-count="verified"]') !== null, pending: pend?.getAttribute('title') ?? null };
    });
    if (place.folder !== basename(work) || /[\\/]/.test(place.folderText)) await fail(`the bar names the folder ${JSON.stringify(place)}, want ${basename(work)}`);
    if (!place.live || place.live.length < 10) await fail('no live mark with a title in the bar');
    if (place.noChecks || !place.verified) await fail('the example has linked checks but the bar does not count them');
    if (!place.pending || !/verified_by/.test(place.pending)) await fail(`the pending mark's title says ${JSON.stringify(place.pending)}`);
    await p.close();
    console.log(`ok bar words (${secs()}s) - folder "${place.folder}", live mark, counts with linked checks, pending says "${place.pending}"`);
  }

  // part c: a planned proposal reads 4.5 to 1, every pin is grabbed in 12 px and has a title, the plus says intent,
  // a right-click ends a rename, a title is no field on hover, accept shows a toast and selects the new intent
  {
    const p = await ex(1440, 900);
    if (await p.locator('[data-legend]').count()) { await p.locator('[data-legend-button]').click(); await p.waitForTimeout(400); }
    await p.locator('[data-fold-row="inferred-fold:root"]').click();
    await p.locator('.react-flow__node[data-id="inferred:inf-plan"]').waitFor({ timeout: SHOW_LIMIT_MS });
    await p.waitForTimeout(500);
    const look = await p.evaluate(() => {
      const el = document.querySelector('.react-flow__node[data-id="inferred:inf-plan"]');
      const body = el.querySelector('[data-inferred]');
      const title = el.querySelector('[data-node-title]');
      const words = [...el.querySelectorAll('[data-inferred-word]')].map((w) => ({ text: w.textContent.trim(), title: w.getAttribute('title') ?? '', opacity: Number(getComputedStyle(w).opacity) }));
      return { opacity: Number(getComputedStyle(body).opacity), color: getComputedStyle(title).color, box: getComputedStyle(body).backgroundColor, canvas: getComputedStyle(document.querySelector('.react-flow')).backgroundColor, words };
    });
    const canvas = rgbOf(look.canvas);
    const ratio = contrast(mix(rgbOf(look.color), canvas, look.opacity), mix(rgbOf(look.box), canvas, look.opacity));
    const wordRatio = Math.min(...look.words.map((w) => contrast(mix(rgbOf(look.color), canvas, look.opacity * w.opacity), mix(rgbOf(look.box), canvas, look.opacity * w.opacity))));
    if (ratio < 4.5 || wordRatio < 4.5) await fail(`a planned proposal's text is ${ratio.toFixed(2)} to 1, its words ${wordRatio.toFixed(2)} to 1, want 4.5 or more`);
    if (!(look.opacity < 1)) await fail('a planned proposal is no fainter than the rest');
    if (look.words.some((w) => w.title.length < 20)) await fail(`a proposal tag has no plain title: ${JSON.stringify(look.words)}`);
    const plan = await rectOf(p, '.react-flow__node[data-id="inferred:inf-plan"]');
    const clipTop = Math.max(0, plan.top - 30);
    await frame(p, 'planned-proposal-close', { clip: { x: Math.max(0, plan.left - 20), y: clipTop, width: Math.min(plan.width + 40, 1440), height: Math.min(Math.max(plan.height + 60, 180), 900 - clipTop) } });
    // pins: drawn 10 px at zoom 1, grabbed 6 px out from the centre each way, a title on each
    const pins = await p.evaluate(() => {
      const zoom = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a;
      const out = { zoom, count: 0, untitled: [], small: [], drawn: [] };
      for (const h of document.querySelectorAll('.react-flow__handle')) {
        const r = h.getBoundingClientRect();
        if (r.right < 0 || r.left > innerWidth || r.top < 40 || r.bottom > innerHeight) continue;
        out.count += 1;
        const id = `${h.closest('.react-flow__node')?.getAttribute('data-id')}:${h.getAttribute('data-handleid')}`;
        if (!h.getAttribute('title')) out.untitled.push(id);
        out.drawn.push(Math.round((r.width / zoom) * 10) / 10);
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        for (const [dx, dy] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) {
          const hit = document.elementFromPoint(cx + dx, cy + dy)?.closest('.react-flow__handle');
          if (hit !== h) { out.small.push(id); break; }
        }
      }
      return out;
    });
    if (pins.count === 0) await fail('no pin in view to measure');
    if (pins.untitled.length) await fail(`${pins.untitled.length} pins have no title: ${pins.untitled.slice(0, 3).join(', ')}`);
    if (pins.small.length) await fail(`${pins.small.length} pins are not grabbed 6 px from their centre: ${pins.small.slice(0, 3).join(', ')}`);
    if (pins.drawn.some((d) => Math.abs(d - 10) > 0.5)) await fail(`pins are drawn ${[...new Set(pins.drawn)].join(', ')} px, want 10`);
    // the plus says intent on hover, the concept's menu has Add intent
    const concept = '.react-flow__node[data-id="concept-calculator"]';
    await p.mouse.move(5, 300);
    const wordHidden = await p.evaluate((s) => getComputedStyle(document.querySelector(`${s} [data-add-word]`)).display, concept);
    await p.locator(`${concept} [data-node-title]`).hover();
    await p.waitForTimeout(200);
    const wordShown = await p.evaluate((s) => { const w = document.querySelector(`${s} [data-add-word]`); return getComputedStyle(w).display !== 'none' ? w.textContent : null; }, concept);
    if (wordHidden !== 'none' || wordShown !== 'intent') await fail(`the plus word is ${wordHidden} off hover and ${wordShown} on hover`);
    const titleBg = await p.evaluate((s) => getComputedStyle(document.querySelector(`${s} [data-node-title]`)).backgroundColor, concept);
    if (!/rgba\(0, 0, 0, 0\)|transparent/.test(titleBg)) await fail(`a hovered title looks like a field: ${titleBg}`);
    await p.locator(`${concept} [data-node-title]`).click({ button: 'right' });
    await p.locator('[data-context-menu]').waitFor({ timeout: 3000 });
    const items = await p.locator('[data-context-menu] [role="menuitem"]').allTextContents();
    if (!items.some((t) => /Add intent/.test(t))) await fail(`a concept's menu has ${items.join(', ')}`);
    await p.keyboard.press('Escape');
    // a right-click while a title is a field ends the field
    const intent = '.react-flow__node[data-id="intent-adds-numbers"]';
    await p.locator(`${intent} [data-node-title]`).dblclick();
    await p.locator(`${intent} textarea`).waitFor({ timeout: 3000 });
    await p.locator(intent).click({ button: 'right', position: { x: 30, y: 60 } });
    await p.locator('[data-context-menu]').waitFor({ timeout: 3000 });
    if (await p.locator('.react-flow__node textarea').count()) await fail('a right-click left a title in edit mode behind the menu');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    console.log(`ok proposals and pins (${secs()}s) - planned text ${ratio.toFixed(1)} to 1, words ${wordRatio.toFixed(1)} to 1, opacity ${look.opacity}, ${pins.count} pins drawn 10 px and grabbed 6 px out at zoom ${pins.zoom.toFixed(2)}, all titled, plus says "${wordShown}", menu "${items.join(', ')}", right-click ends a rename`);

    // accept: a toast with the file and Undo, the new intent selected, click to drawn timed five times
    await p.locator('[data-fold-row="concept-calculator"]').click();
    await p.waitForTimeout(600);
    const times = [];
    for (let i = 0; i < ACCEPT_RUNS; i++) {
      const title = `Readable proposal ${i + 1} for the calculator`;
      const a = await acceptTimed(p, work, `inf-a${i}`, title);
      if (!a.written) await fail(`accept did not write ${basename(a.file)}`);
      if (!/Accepted/.test(a.toast) || !a.toast.includes(`${slug(title)}.md`) || !a.undo) await fail(`after accept the toast says ${JSON.stringify(a.toast)}, undo ${a.undo}`);
      if (!a.selected) await fail(`the accepted intent ${a.id} is not selected`);
      times.push(a.ms);
      if (i === 0) await frame(p, 'accept-toast');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
    }
    if (Math.max(...times) >= ACCEPT_LIMIT_MS) await fail(`accept to drawn took ${times.join(', ')} ms on the example, want under ${ACCEPT_LIMIT_MS}`);
    await p.close();
    console.log(`ok accept (${secs()}s) - toast names the file with Undo, the new intent is selected, click to drawn ${times.join(', ')} ms`);
  }
  if (!(await stopServer(srv))) await fail('example server did not stop');
  {
    // a copy with no verified_by anywhere: the Checks group says so in words
    const bare = mkdtempSync(join(tmpdir(), 'ig-readable-bare-'));
    works.push(bare);
    cpSync(fixture, bare, { recursive: true });
    for (const kind of ['intents', 'constraints', 'concepts']) {
      const dir = join(bare, 'spec', kind);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        const file = join(dir, f);
        writeFileSync(file, readFileSync(file, 'utf8').replace(/verified_by:\r?\n(?:\s+- .*\r?\n)*/g, ''));
      }
    }
    const bsrv = await startServer('server-bare', bare, false);
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    watch(p, 'bare');
    await p.goto(bsrv.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.locator('.react-flow__node').first().waitFor({ timeout: 30000 });
    await p.waitForTimeout(600);
    const words = await p.evaluate(() => ({ text: document.querySelector('[data-bar-no-checks]')?.textContent ?? null, title: document.querySelector('[data-bar-group="checks"]')?.getAttribute('title') ?? '', counts: document.querySelectorAll('[data-bar-group="checks"] [data-bar-count]').length }));
    if (words.text !== 'no checks linked yet' || words.counts !== 0) await fail(`with no verified_by the Checks group shows ${JSON.stringify(words)}`);
    if (!/verified_by/.test(words.title)) await fail(`the Checks group's title does not say how to link one: ${words.title}`);
    await frame(p, 'bar-no-checks');
    await p.close();
    if (!(await stopServer(bsrv))) await fail('bare server did not stop');
    console.log(`ok no checks (${secs()}s) - with no verified_by the Checks group reads "${words.text}", its title says how to link one`);
  }

  if (errors.length) await fail(`${errors.length} console error(s): ${errors[0].slice(0, 160)}`);
  await finish(true, `floor, start corner, F twice, line, minimap, legend on this repo and the example, frames in ${relative(root, runDir).split('\\').join('/')}${wantFrames ? ' and .runs/frames-lane17' : ''}`);
} catch (e) {
  await fail(`crashed: ${String((e && e.message) || e).split('\n')[0]}`);
}
