#!/usr/bin/env node
// proves the graph in an editor panel end to end (lane 16, ADR 0032).
// usage: node tools/e2e-extension.mjs [--no-build]
// copies the fixture to a temp folder and opens it in the machine's own VS Code through playwright's
// _electron.launch, with temp user data and extensions folders built by the launcher's own function.
// proves in order: the panel opens by itself, the server answers, the page inside the panel said ready
// with the server's node count, an open message from inside the iframe makes src/math.ts the active
// editor at line 3, a path outside the workspace and an absolute path open nothing, and closing the
// window stops the server. frames: 01-panel.png, 02-open-file.png, 03-narrow.png.
// kills only the process tree it started. prints one line per step, then PASS|FAIL e2e-extension (time) - note.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';

import { findCode, pageIsStale, vscodeCommand, vscodeEnv, writeUserSettings } from './vscode-launch.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const t0 = Date.now();
const secs = (from = t0) => Math.round((Date.now() - from) / 100) / 10;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = join(root, '.runs', 'e2e-extension', stamp);
mkdirSync(runDir, { recursive: true });

// limits for the checks, ms
const LAUNCH_LIMIT_MS = 60000;
const PANEL_LIMIT_MS = 30000;
const READY_LIMIT_MS = 30000;
const OPEN_LIMIT_MS = 10000;
const REFUSE_WAIT_MS = 2000;
const STOP_LIMIT_MS = 10000;
// the example has this many nodes, give or take
const NODES_MIN = 5;
const NODES_MAX = 60;
const NARROW_PX = 900;
const WINDOW = { width: 1440, height: 900 };

const fixture = join(root, 'tests', 'fixtures', 'live-workspace');
let tmp = null;
let app = null;
let codePid = null;
let serverPid = null;

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
function killTree(pid) {
  if (!pid || !alive(pid)) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
  else process.kill(pid, 'SIGKILL');
}
let lastRecord = null;
let lastWin = null;
async function finish(ok, note) {
  // on a fail, keep what the editor showed and what the extension recorded
  if (!ok && lastWin) await lastWin.screenshot({ path: join(runDir, 'fail.png') }).catch(() => {});
  if (lastRecord && existsSync(lastRecord)) cpSync(lastRecord, join(runDir, 'record.json'));
  if (app) await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
  // only what this script started: the VS Code it launched, and the server that VS Code started
  killTree(codePid);
  killTree(serverPid);
  if (tmp) {
    // the closing editor can hold files for a moment
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(tmp, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  console.log(`${ok ? 'PASS' : 'FAIL'} e2e-extension (${secs()}s) - ${note}`);
  process.exit(ok ? 0 : 1);
}
const fail = (note) => finish(false, note);
process.on('SIGINT', () => void fail('interrupted'));

function portOpen(port) {
  return new Promise((ok) => {
    const c = createConnection({ port, host: '127.0.0.1' });
    c.once('connect', () => {
      c.destroy();
      ok(true);
    });
    c.once('error', () => ok(false));
  });
}
async function until(what, limitMs, test) {
  const from = Date.now();
  for (;;) {
    const v = await test();
    if (v) return v;
    if (Date.now() - from > limitMs) throw new Error(`${what} not within ${limitMs / 1000} s`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

try {
  console.log('a VS Code window will show for about 30 seconds, leave it be, it closes by itself');

  // 0 builds: the extension always, the page when it is older than its sources
  if (!args.includes('--no-build')) {
    const b = spawnSync('pnpm --filter @intentgraph/extension build', { cwd: root, shell: true, encoding: 'utf8' });
    writeFileSync(join(runDir, 'build-extension.log'), (b.stdout || '') + (b.stderr || ''));
    if (b.status !== 0) await fail('the extension build failed, see build-extension.log');
    if (pageIsStale(root)) {
      const p = spawnSync('pnpm --filter @intentgraph/webview build', { cwd: root, shell: true, encoding: 'utf8' });
      writeFileSync(join(runDir, 'build-page.log'), (p.stdout || '') + (p.stderr || ''));
      if (p.status !== 0) await fail('the page build failed, see build-page.log');
    }
  }
  if (!existsSync(join(root, 'packages', 'extension', 'dist', 'extension.js'))) await fail('no built extension');
  if (!existsSync(join(root, 'packages', 'webview', 'dist', 'index.html'))) await fail('no built page');
  const code = findCode();
  if (!code) await fail('no `code` command on the PATH');
  console.log(`ok builds (${secs()}s)`);

  // 1 a temp workspace, temp VS Code folders, and a file outside the workspace that must stay closed
  tmp = mkdtempSync(join(tmpdir(), 'ig-e2e-ext-'));
  const work = join(tmp, 'ws');
  cpSync(fixture, work, { recursive: true });
  const outside = join(tmp, 'outside.ts');
  writeFileSync(outside, 'export const secret = 1;\n');
  const userDataDir = join(tmp, 'user-data');
  const extensionsDir = join(tmp, 'extensions');
  mkdirSync(extensionsDir, { recursive: true });
  writeUserSettings(userDataDir, { write: false });
  const e2eFile = join(tmp, 'e2e.json');
  const cmd = vscodeCommand({ repo: root, folder: work, userDataDir, extensionsDir, exe: code.exe });
  const readRecord = () => {
    try {
      return JSON.parse(readFileSync(e2eFile, 'utf8'));
    } catch {
      return null;
    }
  };

  const launchedAt = Date.now();
  app = await _electron.launch({ executablePath: cmd.exe, args: cmd.args, env: vscodeEnv({ INTENTGRAPH_E2E_FILE: e2eFile }), timeout: LAUNCH_LIMIT_MS });
  codePid = app.process().pid;
  const win = await app.firstWindow({ timeout: LAUNCH_LIMIT_MS });
  lastWin = win;
  lastRecord = e2eFile;
  // the real window, not an emulated viewport, so VS Code lays itself out for that width
  const resize = (width, height) =>
    app.evaluate(({ BrowserWindow }, s) => {
      const w = BrowserWindow.getAllWindows()[0];
      if (!w) return null;
      if (w.isMaximized()) w.unmaximize();
      if (w.isFullScreen()) w.setFullScreen(false);
      w.setContentSize(s.width, s.height);
      return w.getContentSize();
    }, { width, height });
  await resize(WINDOW.width, WINDOW.height).catch(() => {});
  console.log(`ok launch (${secs()}s) - VS Code ${code.exe.split(/[\\/]/).pop()} pid ${codePid}`);

  // 2 the panel opens by itself: a tab named IntentGraph
  await win.locator('.tabs-container .tab', { hasText: 'IntentGraph' }).first().waitFor({ timeout: PANEL_LIMIT_MS });
  const panelMs = Date.now() - launchedAt;
  if (panelMs > PANEL_LIMIT_MS) await fail(`the panel took ${panelMs} ms`);
  console.log(`ok panel (${secs()}s) - IntentGraph tab ${panelMs} ms after launch`);

  // 3 the server answers with the example's nodes
  const rec1 = await until('the server address in the record', PANEL_LIMIT_MS, () => (readRecord()?.url ? readRecord() : null));
  serverPid = rec1.pid;
  const graph = await (await fetch(new URL('/graph.json', rec1.url))).json();
  const count = graph.nodes?.length ?? 0;
  if (count < NODES_MIN || count > NODES_MAX) await fail(`/graph.json holds ${count} nodes`);
  console.log(`ok server (${secs()}s) - ${rec1.url} pid ${serverPid}, ${count} nodes`);

  // 4 the page loaded inside the panel and said ready with the same count
  const ready = await until('intentgraph.ready', READY_LIMIT_MS, () => readRecord()?.received?.find((m) => m.type === 'intentgraph.ready'));
  if (ready.nodes !== count) await fail(`ready said ${ready.nodes} nodes, the server has ${count}`);
  const page = await until('the page frame', READY_LIMIT_MS, () => win.frames().find((f) => f.url().startsWith(rec1.url)));
  console.log(`ok ready (${secs()}s) - the page said ${ready.nodes} nodes, frame ${page.url()}`);

  // 5 open messages, posted from inside the iframe the way the page will
  const send = (msg) => page.evaluate((m) => window.parent.postMessage(m, '*'), msg);
  const activeTab = () => win.locator('.editor-group-container.active .tab.active').first().getAttribute('aria-label').catch(() => '');
  const cursor = () => win.locator('.statusbar-item', { hasText: /^Ln \d+, Col \d+/ }).first().textContent().catch(() => '');
  await send({ type: 'intentgraph.open', path: 'src/greet.ts' });
  await until('greet.ts active', OPEN_LIMIT_MS, async () => (await activeTab())?.startsWith('greet.ts'));
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length > 0, null, { timeout: READY_LIMIT_MS });
  await win.waitForTimeout(800);
  await win.screenshot({ path: join(runDir, '01-panel.png') });

  await send({ type: 'intentgraph.open', path: 'src/math.ts', line: 3 });
  await until('math.ts active at line 3', OPEN_LIMIT_MS, async () => (await activeTab())?.startsWith('math.ts') && /^Ln 3, Col 1/.test((await cursor()) ?? ''));
  await win.waitForTimeout(400);
  await win.screenshot({ path: join(runDir, '02-open-file.png') });
  console.log(`ok open (${secs()}s) - active editor "${await activeTab()}", "${await cursor()}"`);

  // 6 a path outside the workspace and an absolute path open nothing
  const openedBefore = readRecord().opened.length;
  await send({ type: 'intentgraph.open', path: '../outside.ts', line: 1 });
  await send({ type: 'intentgraph.open', path: outside.split('\\').join('/'), line: 1 });
  await until('both refusals in the record', OPEN_LIMIT_MS, () => (readRecord()?.refused?.length ?? 0) >= 2);
  await win.waitForTimeout(REFUSE_WAIT_MS);
  const rec2 = readRecord();
  if (rec2.opened.length !== openedBefore) await fail(`a refused path opened: ${JSON.stringify(rec2.opened.slice(openedBefore))}`);
  const tabs = await win.locator('.tabs-container .tab').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  if (tabs.some((t) => t.startsWith('outside.ts'))) await fail('outside.ts has a tab');
  if (!(await activeTab())?.startsWith('math.ts')) await fail(`the active editor moved to ${await activeTab()}`);
  console.log(`ok refuse (${secs()}s) - ${rec2.refused.map((r) => r.reason).join(', ')}`);

  // 7 a narrow window
  const t7 = Date.now();
  const size = await resize(NARROW_PX, WINDOW.height);
  await until(`a window ${NARROW_PX} px wide`, OPEN_LIMIT_MS, async () => Math.abs((await win.evaluate(() => window.innerWidth)) - NARROW_PX) <= 40).catch(() => {});
  await win.waitForTimeout(800);
  console.log(`  resized to ${JSON.stringify(size)} in ${Date.now() - t7} ms`);
  const width = await win.evaluate(() => window.innerWidth);
  await win.screenshot({ path: join(runDir, '03-narrow.png') });
  if (Math.abs(width - NARROW_PX) > 40) await fail(`the window is ${width} px wide, not ${NARROW_PX}`);
  console.log(`ok narrow (${secs()}s) - ${width} px`);

  // 8 closing the window stops the server
  const port = Number(new URL(rec1.url).port);
  const closing = app;
  app = null;
  await Promise.race([closing.close().catch(() => {}), new Promise((r) => setTimeout(r, STOP_LIMIT_MS))]);
  const closedAt = Date.now();
  await until('the server process gone', STOP_LIMIT_MS, () => !alive(serverPid));
  await until('the port closed', STOP_LIMIT_MS, async () => !(await portOpen(port)));
  const stopMs = Date.now() - closedAt;
  const said = readRecord()?.stopped ? 'the extension said stopped' : 'no stopped line from the extension';
  console.log(`ok stop (${secs()}s) - server gone ${stopMs} ms after the window closed, port closed, ${said}`);

  for (const f of ['01-panel.png', '02-open-file.png', '03-narrow.png']) if (!existsSync(join(runDir, f))) await fail(`frame ${f} missing`);
  await finish(true, `panel ${panelMs} ms, ${count} nodes, open and refuse, server stopped. frames ${runDir}`);
} catch (err) {
  await fail(err?.message ?? String(err));
}
