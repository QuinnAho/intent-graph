#!/usr/bin/env node
// proves the live graph end to end. usage: node tools/e2e-live.mjs [--no-build] [--serve]
// copies the fixture to a temp folder, starts the live server on a free port, opens the page
// headless, edits a title and flips a test, then stops the server and checks nothing is left.
// --serve only starts the server on a fresh copy and prints the url, ctrl+c stops it.
// prints one line per step, then PASS|FAIL e2e-live (time) - note. exit 0 only on pass.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const serveOnly = args.includes('--serve');
const t0 = Date.now();
const secs = (from = t0) => Math.round((Date.now() - from) / 100) / 10;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = join(root, '.runs', 'e2e-live', stamp);
mkdirSync(runDir, { recursive: true });

// limits for the acceptance checks in the lane note
const LABEL_LIMIT_MS = 3000;
const FLIP_LIMIT_MS = 15000;
const STOP_LIMIT_MS = 10000;
// well past the server's quiet window, so a rebuild would have landed
const SAME_WAIT_MS = 1500;

const fixture = join(root, 'tests', 'fixtures', 'live-workspace');
const cli = join(root, 'packages', 'skill', 'src', 'live', 'cli.ts');
const webDir = join(root, 'packages', 'webview', 'dist');
let work = null;
let server = null;
let browser = null;
const testPids = new Set();
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
  writeFileSync(join(root, '.runs', 'e2e-live', 'latest.json'), JSON.stringify({ result: ok ? 'PASS' : 'FAIL', note, seconds: secs(), runDir }, null, 2));
  console.log(`${ok ? 'PASS' : 'FAIL'} e2e-live (${secs()}s) - ${note}`);
  process.exit(ok ? 0 : 1);
}
const fail = (note) => finish(false, note);
process.on('SIGINT', () => void (serveOnly ? stopServer().then(() => finish(true, 'served, stopped by ctrl+c')) : fail('interrupted')));

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
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function waitForLine(re, ms) {
  return new Promise((ok) => {
    const t = setTimeout(() => ok(null), ms);
    const check = () => {
      const hit = lines.find((l) => re.test(l));
      if (hit) { clearTimeout(t); ok(hit); return true; }
      return false;
    };
    if (check()) return;
    const iv = setInterval(() => { if (check() || server.exitCode !== null) { clearInterval(iv); if (server.exitCode !== null) ok(null); } }, 100);
  });
}
async function stopServer() {
  if (!server || server.exitCode !== null) return true;
  const exited = new Promise((ok) => server.once('exit', () => ok(true)));
  server.stdin.write('stop\n');
  return Promise.race([exited, new Promise((ok) => setTimeout(() => ok(false), STOP_LIMIT_MS))]);
}
function editFile(rel, from, to) {
  const file = join(work, rel);
  const text = readFileSync(file, 'utf8');
  if (!text.includes(from)) throw new Error(`${rel} does not contain ${from}`);
  writeFileSync(file, text.split(from).join(to));
}

try {
  // 1 the page the server serves
  if (!args.includes('--no-build')) {
    const b = spawnSync('pnpm --filter @intentgraph/webview build', { cwd: root, shell: true, encoding: 'utf8' });
    writeFileSync(join(runDir, 'webview-build.log'), (b.stdout || '') + (b.stderr || ''));
    if (b.status !== 0) await fail(`webview build failed, see ${join(runDir, 'webview-build.log')}`);
  }
  if (!existsSync(join(webDir, 'index.html'))) await fail('no webview build, drop --no-build');
  console.log(`ok webview (${secs()}s) - ${webDir}`);

  // 2 fixture copy and server on a free port
  work = mkdtempSync(join(tmpdir(), 'intentgraph-live-'));
  cpSync(fixture, work, { recursive: true });
  const port = await freePort();
  const log = createWriteStream(join(runDir, 'server.log'));
  server = spawn(process.execPath, ['--import', 'tsx', cli, '--root', work, '--port', String(port), '--web', webDir], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
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
      if (serveOnly) console.log(`  ${l}`);
    }
  });
  server.stderr.on('data', (d) => log.write(d));
  const liveLine = await waitForLine(/^live: /, 60000);
  if (!liveLine) await fail(`server did not start, see ${join(runDir, 'server.log')}`);
  const url = liveLine.slice('live: '.length).trim();
  console.log(`ok server (${secs()}s) - ${url} on ${work}`);
  if (serveOnly) {
    console.log(`serving. edit files under ${work}, ctrl+c stops`);
    await new Promise(() => {});
  }

  // 3 page
  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  let loads = 0;
  page.on('load', () => { loads += 1; });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const markOf = (id) => page.evaluate((nid) => document.querySelector(`.react-flow__node[data-id="${nid}"] [data-check-status]`)?.getAttribute('data-check-status') ?? null, id);
  const waitMark = (id, want, ms) => page.waitForFunction(([nid, w]) => document.querySelector(`.react-flow__node[data-id="${nid}"] [data-check-status]`)?.getAttribute('data-check-status') === w, [id, want], { timeout: ms });
  try {
    await waitMark('intent-adds-numbers', 'verified', 30000);
    await waitMark('intent-greets-by-name', 'verified', 5000);
  } catch {
    await fail(`start marks wrong: adds=${await markOf('intent-adds-numbers')} greets=${await markOf('intent-greets-by-name')}`);
  }
  const unlinked = await markOf('intent-has-no-checks');
  if (unlinked !== 'pending') await fail(`unlinked node shows ${unlinked}, want pending`);
  const warn = await page.evaluate(() => document.querySelector('.react-flow__node[data-id="constraint-bad-anchor"] [data-warnings]')?.getAttribute('data-warnings') ?? null);
  if (!warn || Number(warn) < 1) await fail('bad anchor node shows no warning');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(runDir, '01-live-start.jpg'), type: 'jpeg', quality: 82 });
  console.log(`ok marks (${secs()}s) - verified, verified, pending, ${warn} warnings on the bad anchor`);

  // 4 pan, select, then edit a title. label must change in 3 s, same page, same viewport.
  await page.mouse.move(640, 700);
  await page.mouse.down();
  await page.mouse.move(600, 650, { steps: 5 });
  await page.mouse.up();
  await page.locator('.react-flow__node[data-id="intent-has-no-checks"]').click();
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__e2eMarker = 'same-page'; });
  const viewBefore = await page.locator('.react-flow__viewport').getAttribute('style');
  const loadsBefore = loads;
  const newTitle = 'Adding two numbers returns the sum, edited live';
  const tEdit = Date.now();
  editFile('spec/intents/adds-numbers.md', 'title: Adding two numbers gives their sum', `title: ${newTitle}`);
  try {
    await page.waitForFunction((t) => document.querySelector('.react-flow__node[data-id="intent-adds-numbers"]')?.textContent?.includes(t), newTitle, { timeout: LABEL_LIMIT_MS });
  } catch {
    await fail(`label did not change within ${LABEL_LIMIT_MS} ms`);
  }
  const labelMs = Date.now() - tEdit;
  const marker = await page.evaluate(() => window.__e2eMarker);
  const viewAfter = await page.locator('.react-flow__viewport').getAttribute('style');
  const stillSelected = await page.locator('.react-flow__node[data-id="intent-has-no-checks"]').evaluate((e) => e.classList.contains('selected'));
  if (marker !== 'same-page' || loads !== loadsBefore) await fail('page reloaded on update');
  if (viewAfter !== viewBefore) await fail(`viewport moved: ${viewBefore} -> ${viewAfter}`);
  if (!stillSelected) await fail('selection lost on update');
  console.log(`ok label (${secs()}s) - changed in ${labelMs} ms, no reload, viewport and selection kept`);

  // 4b rewriting a file with the same bytes must not rebuild
  const versionOf = () => page.evaluate(() => document.documentElement.dataset.graphVersion ?? '');
  const vSame = await versionOf();
  const same = join(work, 'spec', 'intents', 'has-no-checks.md');
  writeFileSync(same, readFileSync(same));
  await page.waitForTimeout(SAME_WAIT_MS);
  if ((await versionOf()) !== vSame) await fail(`same-content save rebuilt the graph (v${vSame} -> v${await versionOf()})`);
  console.log(`ok same-content save (${secs()}s) - still v${vSame}`);

  // 5 flip the test. the mark must turn failed in 15 s.
  const tFlip = Date.now();
  editFile('tests/flip.test.ts', "toBe('hello quinn')", "toBe('goodbye quinn')");
  try {
    await waitMark('intent-greets-by-name', 'failed', FLIP_LIMIT_MS);
  } catch {
    await fail(`flipped test did not show failed within ${FLIP_LIMIT_MS} ms, mark is ${await markOf('intent-greets-by-name')}`);
  }
  const flipMs = Date.now() - tFlip;
  if ((await markOf('intent-adds-numbers')) !== 'verified') await fail('passing node lost verified after the flip');
  await page.screenshot({ path: join(runDir, '02-live-after.jpg'), type: 'jpeg', quality: 82 });
  console.log(`ok flip (${secs()}s) - failed mark in ${flipMs} ms`);

  // 6 focus a named node, its mark must be on screen
  const focusPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  focusPage.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await focusPage.goto(`${url}?focus=intent-greets-by-name`, { waitUntil: 'domcontentloaded' });
  const mark = focusPage.locator('.react-flow__node[data-id="intent-greets-by-name"] [data-check-status]');
  await mark.waitFor({ timeout: 20000 });
  await focusPage.waitForTimeout(800);
  const box = await mark.boundingBox();
  if (!box || box.x < 0 || box.y < 0 || box.x + box.width > 1280 || box.y + box.height > 800) await fail('focused node mark is off screen');
  await focusPage.screenshot({ path: join(runDir, '03-focus-greets.jpg'), type: 'jpeg', quality: 82 });
  console.log(`ok focus (${secs()}s) - mark "${await mark.textContent()}" on screen`);
  if (errors.length) await fail(`${errors.length} console error(s): ${errors[0].slice(0, 160)}`);
  await browser.close();
  browser = null;

  // 6b the frames script against the live page, focused on a fixture spec node
  const framesOut = join(runDir, 'frames-focus');
  const fr = spawnSync(process.execPath, [join(root, 'tools', 'frames.mjs'), '--url', `${url}?focus=intent-greets-by-name`, '--out', framesOut], { cwd: root, encoding: 'utf8' });
  writeFileSync(join(runDir, 'frames-focus.log'), (fr.stdout || '') + (fr.stderr || ''));
  const frLine = (fr.stdout || '').trim().split(/\r?\n/).pop() || '';
  if (fr.status !== 0 || !frLine.startsWith('PASS')) await fail(`frames on the focused live page: ${frLine || 'no output'}`);
  console.log(`ok frames focus (${secs()}s) - ${frLine.slice(0, 80)}`);

  // 7 clean stop: process exits, port closes, no test run left behind
  const stopped = await stopServer();
  if (!stopped) await fail(`server did not exit within ${STOP_LIMIT_MS} ms of stop`);
  if (await portOpen(port)) await fail(`port ${port} still open after stop`);
  const left = [...testPids].filter(alive);
  if (left.length) await fail(`test processes left: ${left.join(', ')}`);
  console.log(`ok stop (${secs()}s) - exit ${server.exitCode}, port closed, ${testPids.size} test runs all gone`);
  await finish(true, `label ${labelMs} ms, failed mark ${flipMs} ms, clean stop, frames in ${runDir}`);
} catch (e) {
  await fail(`crashed: ${String((e && e.message) || e).split('\n')[0]}`);
}
