#!/usr/bin/env node
// measures the wires on the live page. usage: node tools/e2e-wires.mjs [--no-build] [--baseline]
// serves a temp copy of the fixture and then this repo through the live server, opens each page
// headless at its first view and samples 40 points along every drawn wire. it counts samples
// inside a node box that is not an end of the wire and not a box holding an end, and wire ends
// farther than 6 px (flow units) from a visible pin. also the share of wires that run left to
// right and the time from page load to a laid-out graph. writes frames under .runs/e2e-wires.
// --baseline only prints the numbers, it never fails on them.
// prints one line per page, then PASS|FAIL e2e-wires (time) - note. exit 0 only on pass.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const baseline = args.includes('--baseline');
const t0 = Date.now();
const secs = (from = t0) => Math.round((Date.now() - from) / 100) / 10;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = join(root, '.runs', 'e2e-wires', stamp);
mkdirSync(runDir, { recursive: true });

// the numbers measured on night-1 before this lane, see the lane note "Results"
const BEFORE = { repoCrossSamples: 105, repoLoadMs: 1908 };
// limits from the lane note's acceptance checks
const SAMPLES = 40;
const LOOSE_PX = 6;
const MAX_CROSS_WIRE_SHARE = 0.05;
const MIN_CROSS_CUT = 0.8;
const MIN_LTR_SHARE = 0.9;
const MAX_LOAD_RATIO = 1.5;
const LOAD_RUNS = 3;

const fixture = join(root, 'tests', 'fixtures', 'live-workspace');
const cli = join(root, 'packages', 'skill', 'src', 'live', 'cli.ts');
const webDir = join(root, 'packages', 'webview', 'dist');
let work = null;
let server = null;
let browser = null;
const testPids = new Set();

function killServer() {
  if (!server || server.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
  else server.kill('SIGKILL');
}
async function finish(ok, note) {
  if (browser) await browser.close().catch(() => {});
  killServer();
  if (work) rmSync(work, { recursive: true, force: true });
  writeFileSync(join(root, '.runs', 'e2e-wires', 'latest.json'), JSON.stringify({ result: ok ? 'PASS' : 'FAIL', note, seconds: secs(), runDir }, null, 2));
  console.log(`${ok ? 'PASS' : 'FAIL'} e2e-wires (${secs()}s) - ${note}`);
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
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function startServer(dir, name) {
  const port = await freePort();
  const log = createWriteStream(join(runDir, `server-${name}.log`));
  const lines = [];
  server = spawn(process.execPath, ['--import', 'tsx', cli, '--root', dir, '--port', String(port), '--web', webDir], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  server.stdout.on('data', (d) => {
    log.write(d);
    buf += d.toString();
    const parts = buf.split(/\r?\n/);
    buf = parts.pop();
    for (const l of parts) {
      lines.push(l);
      const m = /tests started pid (\d+)/.exec(l);
      if (m) testPids.add(Number(m[1]));
    }
  });
  server.stderr.on('data', (d) => log.write(d));
  const until = Date.now() + 90000;
  while (Date.now() < until && server.exitCode === null) {
    const hit = lines.find((l) => l.startsWith('live: '));
    if (hit) return hit.slice('live: '.length).trim();
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}
async function stopServer() {
  if (!server || server.exitCode !== null) return true;
  const exited = new Promise((ok) => server.once('exit', () => ok(true)));
  server.stdin.write('stop\n');
  const ok = await Promise.race([exited, new Promise((r) => setTimeout(() => r(false), 10000))]);
  server = null;
  return ok;
}

// waits for a laid-out, measured graph and returns ms since navigation start
async function loadGraph(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => {
    const nodes = document.querySelectorAll('.react-flow__node');
    if (nodes.length === 0) return false;
    return [...nodes].every((n) => getComputedStyle(n).visibility !== 'hidden');
  }, null, { timeout: 60000, polling: 'raf' });
  return page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(Math.round(performance.now()))))));
}

// runs in the page. everything in screen px, converted to flow units by the zoom.
// overLabel counts samples inside a leaf node or any node's header where the wire, not the node,
// is on top. a box's own padding is left out, the wires of its children run there by design.
// inView counts only ends inside the window, for views where some nodes are off screen.
function measureInPage({ parents, ends, samples, loosePx, inView }) {
  const vp = document.querySelector('.react-flow__viewport');
  const zoom = Number(/scale\(([\d.e-]+)\)/.exec(vp?.style.transform ?? '')?.[1] ?? 1);
  const boxes = [...document.querySelectorAll('.react-flow__node')].map((el) => ({ id: el.getAttribute('data-id'), r: el.getBoundingClientRect() }));
  const pins = [...document.querySelectorAll('.react-flow__handle')]
    .filter((h) => {
      const s = getComputedStyle(h);
      const r = h.getBoundingClientRect();
      return Number(s.opacity) > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0;
    })
    .map((h) => h.getBoundingClientRect());
  const up = (id) => {
    const out = new Set();
    let cur = id;
    for (let i = 0; cur && i < 50; i++) { out.add(cur); cur = parents[cur]; }
    return out;
  };
  const distToRect = (p, r) => Math.hypot(Math.max(r.left - p.x, 0, p.x - r.right), Math.max(r.top - p.y, 0, p.y - r.bottom));
  const inside = (p, r) => p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom;
  const holders = new Set(Object.values(parents));
  const labels = [
    ...boxes.filter((b) => !holders.has(b.id)).map((b) => b.r),
    ...[...document.querySelectorAll('[data-node-header]')].map((h) => h.getBoundingClientRect()),
  ];
  const onScreen = (p) => p.x >= 0 && p.y >= 0 && p.x <= innerWidth && p.y <= innerHeight;
  const res = { wires: 0, crossSamples: 0, crossWires: 0, looseEnds: 0, ltr: 0, overLabel: 0, crossedBy: {}, loose: [] };
  for (const g of document.querySelectorAll('.react-flow__edge')) {
    const id = g.getAttribute('data-id');
    const path = g.querySelector('path.react-flow__edge-path') ?? g.querySelector('path');
    if (!path) continue;
    const m = path.getScreenCTM();
    const len = path.getTotalLength();
    if (!m || !(len > 0)) continue;
    res.wires += 1;
    const at = (l) => { const q = path.getPointAtLength(l); return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f }; };
    const end = ends[id];
    const skip = new Set([...(end ? up(end[0]) : []), ...(end ? up(end[1]) : [])]);
    let crossed = 0;
    for (let i = 0; i < samples; i++) {
      const p = at((len * i) / (samples - 1));
      if (onScreen(p) && labels.some((r) => inside(p, r))) {
        const top = document.elementFromPoint(p.x, p.y);
        if (top && top.closest('.react-flow__edge')) res.overLabel += 1;
      }
      const hit = boxes.find((b) => !skip.has(b.id) && inside(p, b.r));
      if (hit) {
        crossed += 1;
        res.crossedBy[hit.id] = (res.crossedBy[hit.id] ?? 0) + 1;
      }
    }
    res.crossSamples += crossed;
    if (crossed > 0) res.crossWires += 1;
    const a = at(0);
    const b = at(len);
    if (b.x > a.x) res.ltr += 1;
    for (const p of [a, b]) {
      if (inView && !onScreen(p)) continue;
      const d = pins.length ? Math.min(...pins.map((r) => distToRect(p, r))) / zoom : Infinity;
      if (d > loosePx) {
        res.looseEnds += 1;
        if (res.loose.length < 5) res.loose.push(`${id} ${Math.round(d)}`);
      }
    }
  }
  res.zoom = zoom;
  res.nodes = boxes.length;
  res.pins = pins.length;
  return res;
}

async function measurePage(browser, url, name, errors) {
  const graph = await (await fetch(new URL('graph.json', url))).json();
  const kindOf = new Map(graph.nodes.map((n) => [n.id, n.kind]));
  const parents = {};
  for (const n of graph.nodes) if (n.parent_id && kindOf.get(n.parent_id) === 'concept') parents[n.id] = n.parent_id;
  const ends = {};
  for (const e of graph.edges) ends[e.id] = [e.src, e.dst];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errors.push(`${name}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  const loads = [];
  for (let i = 0; i < (name === 'repo' ? LOAD_RUNS : 1); i++) loads.push(await loadGraph(page, url));
  loads.sort((a, b) => a - b);
  const loadMs = loads[Math.floor(loads.length / 2)];
  await page.waitForTimeout(600);
  const m = await page.evaluate(measureInPage, { parents, ends, samples: SAMPLES, loosePx: LOOSE_PX, inView: false });
  m.loadMs = loadMs;
  m.graphEdges = graph.edges.length;
  return { page, m, parents, ends };
}

function describe(name, m) {
  const ltr = m.wires ? Math.round((100 * m.ltr) / m.wires) : 100;
  const crossShare = m.wires ? Math.round((1000 * m.crossWires) / m.wires) / 10 : 0;
  const top = Object.entries(m.crossedBy).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' ');
  return `${name}: ${m.wires} wires drawn of ${m.graphEdges}, ${m.crossSamples} crossing samples on ${m.crossWires} wires (${crossShare}%), ${m.looseEnds} loose ends, ${m.overLabel} samples over a node, ${ltr}% left to right, laid out in ${m.loadMs} ms, ${m.nodes} nodes, ${m.pins} pins, zoom ${m.zoom.toFixed(2)}${top ? `, most crossed ${top}` : ''}${m.loose.length ? `, loose ${m.loose.join(' ')}` : ''}`;
}

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
  const problems = [];

  // 1 the fixture: its marks frame and one node selected
  work = mkdtempSync(join(tmpdir(), 'intentgraph-wires-'));
  cpSync(fixture, work, { recursive: true });
  let url = await startServer(work, 'fixture');
  if (!url) await fail(`fixture server did not start, see ${runDir}`);
  const fx = await measurePage(browser, url, 'fixture', errors);
  await fx.page.waitForFunction(() => document.querySelector('[data-check-status="verified"]'), null, { timeout: 30000 }).catch(() => {});
  await fx.page.waitForTimeout(400);
  await fx.page.screenshot({ path: join(runDir, 'c-fixture-marks.jpg'), type: 'jpeg', quality: 85 });
  const pick = fx.page.locator('.react-flow__node[data-id="intent-adds-numbers"]');
  if (await pick.count()) {
    await pick.click();
    await fx.page.waitForTimeout(500);
    await fx.page.screenshot({ path: join(runDir, 'd-fixture-selected.jpg'), type: 'jpeg', quality: 85 });
  }
  console.log(`ok ${describe('fixture', fx.m)}`);
  if (fx.m.crossSamples > 0) problems.push(`fixture has ${fx.m.crossSamples} crossing samples`);
  if (fx.m.looseEnds > 0) problems.push(`fixture has ${fx.m.looseEnds} loose ends`);
  if (fx.m.overLabel > 0) problems.push(`fixture has ${fx.m.overLabel} wire samples drawn over a node`);
  if (fx.m.wires && fx.m.ltr / fx.m.wires < MIN_LTR_SHARE) problems.push(`fixture ${fx.m.ltr}/${fx.m.wires} left to right`);
  await fx.page.close();
  if (!(await stopServer())) await fail('fixture server did not stop');

  // 2 this repo, read only. its first view and a zoomed view.
  url = await startServer(root, 'repo');
  if (!url) await fail(`repo server did not start, see ${runDir}`);
  const rp = await measurePage(browser, url, 'repo', errors);
  await rp.page.screenshot({ path: join(runDir, 'a-repo-fit.jpg'), type: 'jpeg', quality: 85 });
  const vp = rp.page.viewportSize();
  await rp.page.mouse.move(vp.width * 0.35, vp.height * 0.4);
  for (let i = 0; i < 4; i++) { await rp.page.mouse.wheel(0, -200); await rp.page.waitForTimeout(120); }
  await rp.page.waitForTimeout(500);
  await rp.page.screenshot({ path: join(runDir, 'b-repo-zoomed.jpg'), type: 'jpeg', quality: 85 });
  const zm = await rp.page.evaluate(measureInPage, { parents: rp.parents, ends: rp.ends, samples: SAMPLES, loosePx: LOOSE_PX, inView: true });
  console.log(`ok ${describe('repo', rp.m)}`);
  console.log(`ok repo zoomed: ${zm.wires} wires, ${zm.looseEnds} loose ends on screen, ${zm.overLabel} samples over a node at zoom ${zm.zoom.toFixed(2)}`);
  if (zm.looseEnds > 0) problems.push(`zoomed repo has ${zm.looseEnds} loose ends on screen`);
  if (zm.overLabel > 0) problems.push(`zoomed repo has ${zm.overLabel} wire samples drawn over a node`);
  await rp.page.close();
  if (!(await stopServer())) await fail('repo server did not stop');

  const m = rp.m;
  if (m.looseEnds > 0) problems.push(`repo has ${m.looseEnds} loose ends`);
  if (m.overLabel > 0) problems.push(`repo has ${m.overLabel} wire samples drawn over a node`);
  if (m.wires && m.crossWires / m.wires > MAX_CROSS_WIRE_SHARE) problems.push(`repo ${m.crossWires}/${m.wires} wires cross a box`);
  if (BEFORE.repoCrossSamples > 0 && m.crossSamples > BEFORE.repoCrossSamples * (1 - MIN_CROSS_CUT)) problems.push(`repo crossing samples ${m.crossSamples}, before ${BEFORE.repoCrossSamples}`);
  if (m.wires && m.ltr / m.wires < MIN_LTR_SHARE) problems.push(`repo ${m.ltr}/${m.wires} left to right`);
  if (BEFORE.repoLoadMs > 0 && m.loadMs > BEFORE.repoLoadMs * MAX_LOAD_RATIO) problems.push(`repo laid out in ${m.loadMs} ms, before ${BEFORE.repoLoadMs}`);
  if (BEFORE.repoCrossSamples === 0 && !baseline) problems.push('no before numbers in the script');
  if (errors.length) problems.push(`${errors.length} console error(s): ${errors[0].slice(0, 160)}`);

  // nothing left behind: a killed tree takes a moment to go on windows, so wait up to 5 s
  let left = [...testPids].filter(alive);
  for (let i = 0; i < 25 && left.length; i++) {
    await new Promise((r) => setTimeout(r, 200));
    left = left.filter(alive);
  }
  if (left.length) problems.push(`test processes left after 5 s: ${left.join(', ')}`);

  const summary = `fixture ${fx.m.crossSamples} crossing ${fx.m.looseEnds} loose, repo ${m.crossSamples} crossing on ${m.crossWires}/${m.wires} wires ${m.looseEnds} loose ${m.loadMs} ms, frames in ${runDir}`;
  if (baseline) await finish(true, `baseline only, ${problems.length} problem(s): ${problems.join('; ') || 'none'}. ${summary}`);
  if (problems.length) await fail(`${problems.join('; ')}. ${summary}`);
  await finish(true, summary);
} catch (e) {
  await fail(`crashed: ${String((e && e.message) || e).split('\n')[0]}`);
}
