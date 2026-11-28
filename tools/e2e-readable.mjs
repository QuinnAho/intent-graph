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
  if (!(await stopServer(srv))) await fail('example server did not stop');

  if (errors.length) await fail(`${errors.length} console error(s): ${errors[0].slice(0, 160)}`);
  await finish(true, `floor, start corner, F twice, line, minimap, legend on this repo and the example, frames in ${relative(root, runDir).split('\\').join('/')}${wantFrames ? ' and .runs/frames-lane17' : ''}`);
} catch (e) {
  await fail(`crashed: ${String((e && e.message) || e).split('\n')[0]}`);
}
