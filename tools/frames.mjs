#!/usr/bin/env node
// shows the graph without a human. usage: node tools/frames.mjs [--out <dir>] [--url <url>] [--timeout <sec>]
// seeds graph.json, starts vite on a free port, shoots jpeg frames, stops what it started.
// --url skips starting a server (used to prove the failure path).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync, statSync, existsSync, readFileSync, createWriteStream } from 'node:fs';
import { createServer } from 'node:net';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const outDir = opt('--out') ? resolve(opt('--out')) : null;
const extUrl = opt('--url');
const limitMs = Number(opt('--timeout') || 45) * 1000;

const t0 = Date.now();
const secs = () => Math.round((Date.now() - t0) / 100) / 10;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = join(root, '.runs', 'frames', stamp);
mkdirSync(runDir, { recursive: true });

let server = null;
// vite can spawn helpers, so kill the whole tree, and only the one we started
function stopServer() {
  if (!server || server.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
  else { try { process.kill(-server.pid, 'SIGKILL'); } catch { server.kill('SIGKILL'); } }
}
process.on('SIGINT', () => { stopServer(); process.exit(130); });
process.on('SIGTERM', () => { stopServer(); process.exit(143); });

function finish(ok, note, extra = {}) {
  stopServer();
  writeFileSync(join(root, '.runs', 'frames', 'latest.json'), JSON.stringify({ result: ok ? 'PASS' : 'FAIL', note, seconds: secs(), runDir, ...extra }, null, 2));
  console.log(`${ok ? 'PASS' : 'FAIL'} frames (${secs()}s) - ${note}`);
  process.exit(ok ? 0 : 1);
}
const fail = (note, extra) => finish(false, note, extra);

function freePort() {
  return new Promise((ok, bad) => {
    const s = createServer();
    s.on('error', bad);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
  });
}

// wait until the viewport transform stops changing, fitView and zoom both animate
async function settle(page, rounds) {
  let prev = '';
  let stable = 0;
  for (let i = 0; i < rounds && stable < 4; i += 1) {
    await page.waitForTimeout(250);
    const cur = await page.locator('.react-flow__viewport').getAttribute('style');
    stable = cur === prev ? stable + 1 : 0;
    prev = cur;
  }
}

try {
  // 1 seed, so the page has data in this worktree
  const seed = spawnSync('pnpm tsx scripts/seed-dev-db.ts', { cwd: root, shell: true, encoding: 'utf8' });
  writeFileSync(join(runDir, 'seed.log'), (seed.stdout || '') + (seed.stderr || ''));
  const graphPath = join(root, '.intentgraph', 'graph.json');
  if (!extUrl && (seed.status !== 0 || !existsSync(graphPath))) fail(`seed failed, see ${join(runDir, 'seed.log')}`);
  let graphNodes = null;
  try { graphNodes = (JSON.parse(readFileSync(graphPath, 'utf8')).nodes || []).length; } catch { /* count stays null */ }
  console.log(`ok seed (${secs()}s) - graph.json has ${graphNodes ?? '?'} nodes`);

  // 2 server on a free port
  let url = extUrl;
  if (!url) {
    const port = await freePort();
    url = `http://127.0.0.1:${port}/`;
    const web = join(root, 'packages', 'webview');
    const viteBin = join(web, 'node_modules', 'vite', 'bin', 'vite.js');
    if (!existsSync(viteBin)) fail('vite not installed, run pnpm install');
    const log = join(runDir, 'vite.log');
    const out = createWriteStream(log);
    server = spawn(process.execPath, [viteBin, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: web, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    server.stdout.pipe(out);
    server.stderr.pipe(out);
    let up = false;
    for (let i = 0; i < 100 && !up; i += 1) {
      if (server.exitCode !== null) fail(`vite exited early, see ${log}`);
      try { up = (await fetch(url)).ok; } catch { await new Promise((r) => setTimeout(r, 300)); }
    }
    if (!up) fail(`vite not answering on ${url}`);
  }
  console.log(`ok server (${secs()}s) - ${url}${extUrl ? ' (given, not started)' : ''}`);

  // 3 browser
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('console', (m) => {
      // the dev page has no favicon, a 404 for it is not a page bug
      if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) { fail(`cannot open ${url}: ${String(e.message).split('\n')[0]}`); }

    const nodes = page.locator('.react-flow__node');
    try { await nodes.first().waitFor({ timeout: limitMs }); } catch {
      const text = (await page.locator('body').innerText().catch(() => '')).slice(0, 120).replace(/\s+/g, ' ');
      fail(`no nodes rendered in ${limitMs / 1000}s, page says "${text}"`, { errors });
    }
    await settle(page, 60);
    const rendered = await nodes.count();
    const frames = [];
    const shoot = async (name) => {
      const file = join(runDir, name);
      await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
      frames.push(file);
    };
    await shoot('01-fit.jpg');

    // zoom in on the labelled node nearest the middle until labels are readable
    const boxes = await nodes.evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: e.textContent.trim().length };
    }));
    const onScreen = boxes.filter((b) => b.t > 0 && b.x > 0 && b.x < 1280 && b.y > 0 && b.y < 800);
    const near = (onScreen.length ? onScreen : boxes).sort((a, b) => Math.hypot(a.x - 640, a.y - 400) - Math.hypot(b.x - 640, b.y - 400))[0];
    await page.mouse.move(near.x, near.y);
    for (let i = 0; i < 12; i += 1) { await page.mouse.wheel(0, -300); await page.waitForTimeout(60); }
    await settle(page, 40);
    const readable = await page.locator('.react-flow__node').evaluateAll((els) => els.filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 60 && r.right > 0 && r.left < 1280 && e.textContent.trim().length > 0;
    }).length);
    await shoot('02-zoomed.jpg');

    // 4 judge
    if (errors.length) fail(`${errors.length} console error(s): ${errors[0].slice(0, 160)}`, { errors });
    for (const f of frames) {
      if (!existsSync(f)) fail(`frame missing: ${f}`);
      if (statSync(f).size < 5000) fail(`frame tiny (${statSync(f).size} bytes): ${f}`);
    }
    if (readable === 0) fail('zoomed frame has no readable labelled node', { frames });
    if (outDir) {
      mkdirSync(outDir, { recursive: true });
      for (const f of frames) copyFileSync(f, join(outDir, basename(f)));
    }
    console.log(`ok nodes - ${rendered} rendered at fit, ${readable} labelled in zoom, graph.json ${graphNodes ?? '?'}`);
    finish(true, `${rendered} nodes rendered, ${frames.length} frames in ${runDir}`, { rendered, graphNodes, frames });
  } finally {
    await browser.close().catch(() => {});
  }
} catch (e) {
  fail(`crashed: ${String((e && e.message) || e).split('\n')[0]}`);
}
