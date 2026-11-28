#!/usr/bin/env node
// proves visual editing end to end. usage: node tools/e2e-edit.mjs [--no-build] [--serve]
// copies the fixture to a temp folder, starts the live server with --write on a free port,
// opens the page headless, edits a title in the side panel, creates an intent from a concept,
// tries the refused cases, then checks a server without --write is read only.
// --serve only starts a --write server on a fresh copy and prints the url, ctrl+c stops it.
// lane 6 checks: the selected node shows a selected state, the panel never overlaps it, read only
// shows text and no inputs, a new intent carries target_kinds and adds no problem, cmd+s saves, and
// no title is cut while a drift report is loaded.
// saves six frames for review. prints one line per step, then PASS|FAIL e2e-edit (time) - note.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
const runDir = join(root, '.runs', 'e2e-edit', stamp);
mkdirSync(runDir, { recursive: true });

// limits for the acceptance checks in the lane note
const LABEL_LIMIT_MS = 3000;
const NODE_LIMIT_MS = 3000;
const STOP_LIMIT_MS = 10000;
// long enough for a write and a rebuild to land if one were going to
const NOTHING_WRITTEN_WAIT_MS = 800;
const FRAME = { type: 'jpeg', quality: 82 };
const FRAMES = ['01-panel-open.jpg', '02-title-unsaved.jpg', '03-after-save.jpg', '04-create-form.jpg', '05-new-intent.jpg', '06-error-message.jpg'];

const fixture = join(root, 'tests', 'fixtures', 'live-workspace');
const cli = join(root, 'packages', 'skill', 'src', 'live', 'cli.ts');
const webDir = join(root, 'packages', 'webview', 'dist');
const works = [];
const servers = [];
const testPids = new Set();
let browser = null;

function killServer(s) {
  if (!s || s.proc.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(s.proc.pid), '/t', '/f'], { stdio: 'ignore' });
  else s.proc.kill('SIGKILL');
}
async function finish(ok, note) {
  if (browser) await browser.close().catch(() => {});
  for (const s of servers) killServer(s);
  for (const w of works) rmSync(w, { recursive: true, force: true });
  writeFileSync(join(root, '.runs', 'e2e-edit', 'latest.json'), JSON.stringify({ result: ok ? 'PASS' : 'FAIL', note, seconds: secs(), runDir }, null, 2));
  console.log(`${ok ? 'PASS' : 'FAIL'} e2e-edit (${secs()}s) - ${note}`);
  process.exit(ok ? 0 : 1);
}
const fail = (note) => finish(false, note);
process.on('SIGINT', () => void (serveOnly ? Promise.all(servers.map(stopServer)).then(() => finish(true, 'served, stopped by ctrl+c')) : fail('interrupted')));

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
function waitForLine(s, re, ms) {
  return new Promise((ok) => {
    const t = setTimeout(() => ok(null), ms);
    const check = () => {
      const hit = s.lines.find((l) => re.test(l));
      if (hit) { clearTimeout(t); ok(hit); return true; }
      return false;
    };
    if (check()) return;
    const iv = setInterval(() => { if (check() || s.proc.exitCode !== null) { clearInterval(iv); if (s.proc.exitCode !== null) ok(null); } }, 100);
  });
}
async function stopServer(s) {
  if (!s || s.proc.exitCode !== null) return true;
  const exited = new Promise((ok) => s.proc.once('exit', () => ok(true)));
  s.proc.stdin.write('stop\n');
  return Promise.race([exited, new Promise((ok) => setTimeout(() => ok(false), STOP_LIMIT_MS))]);
}
async function startServer(name, write) {
  const work = mkdtempSync(join(tmpdir(), `intentgraph-edit-${name}-`));
  works.push(work);
  cpSync(fixture, work, { recursive: true });
  const port = await freePort();
  const log = createWriteStream(join(runDir, `server-${name}.log`));
  const proc = spawn(process.execPath, ['--import', 'tsx', cli, '--root', work, '--port', String(port), '--web', webDir, ...(write ? ['--write'] : [])], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  const s = { name, proc, port, work, lines: [] };
  servers.push(s);
  let buf = '';
  proc.stdout.on('data', (d) => {
    log.write(d);
    buf += d.toString();
    const parts = buf.split(/\r?\n/);
    buf = parts.pop();
    for (const l of parts) {
      s.lines.push(l);
      const m = /tests started pid (\d+)/.exec(l);
      if (m) testPids.add(Number(m[1]));
      if (serveOnly) console.log(`  ${l}`);
    }
  });
  proc.stderr.on('data', (d) => log.write(d));
  const liveLine = await waitForLine(s, /^live: /, 60000);
  if (!liveLine) await fail(`${name} server did not start, see ${join(runDir, `server-${name}.log`)}`);
  s.url = liveLine.slice('live: '.length).trim();
  // the server prints its edits line after the live line. waiting for it here stops the
  // caller's check from racing that second line, which failed once in a few dozen runs.
  await waitForLine(s, /^edits: /, 5000);
  return s;
}
const listing = (work) => readdirSync(join(work, 'spec', 'intents')).sort().join(',');
// true when two elements share any area
const overlapOf = async (page, aSel, bSel) => page.evaluate(([a, b]) => {
  const x = document.querySelector(a)?.getBoundingClientRect();
  const y = document.querySelector(b)?.getBoundingClientRect();
  if (!x || !y) return null;
  return x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom;
}, [aSel, bSel]);
const inWindow = async (page, sel) => page.evaluate((s) => {
  const r = document.querySelector(s)?.getBoundingClientRect();
  return !!r && r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
}, sel);
// the selected node carries the class and its body draws the outline
const selectedLook = async (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  const body = el?.querySelector('.ig-node-body');
  if (!el || !body) return null;
  const cs = getComputedStyle(body);
  return { selected: el.classList.contains('selected'), border: cs.borderTopColor, shadow: cs.boxShadow };
}, sel);
const isOutlined = (look) => !!look && look.selected && /120, 169, 255/.test(look.border) && look.shadow !== 'none';
const nodeTitles = async (page) => page.evaluate(() => [...document.querySelectorAll('.react-flow__node')].map((n) => {
  const t = n.querySelector('[data-node-title]');
  const h = n.querySelector('[data-node-header]');
  if (!t || !h) return null;
  const tr = t.getBoundingClientRect();
  const nr = n.getBoundingClientRect();
  return { id: n.getAttribute('data-id'), text: t.textContent, w: t.scrollWidth - t.clientWidth, h: t.scrollHeight - t.clientHeight, lines: Math.round(t.offsetHeight / 18), clipped: h.getBoundingClientRect().bottom - nr.bottom, titleBottom: tr.bottom - nr.bottom };
}).filter(Boolean));
function changedLines(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  const out = [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) out.push([x[i], y[i]]);
  return out;
}

// lane 8 helpers: real mouse drags, a file that must change in exactly the parent and updated lines
const centreOf = async (page, sel) => {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) await fail(`${sel} is not on screen`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
async function dragMouse(page, from, to, { hold } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 16;
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  if (hold) await hold();
  await page.mouse.up();
}
// resolves when the view transform is the same on 8 animation frames in a row, so a wheel or fit-view move has finished
async function viewSettled(page, ms = 8000) {
  await page.waitForFunction(() => new Promise((res) => {
    const read = () => document.querySelector('.react-flow__viewport')?.style.transform ?? '';
    let last = read();
    let same = 0;
    const tick = () => {
      const now = read();
      same = now === last ? same + 1 : 0;
      last = now;
      if (same >= 8) res(true); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), null, { timeout: ms });
}
// a point that is bare canvas (no node, wire, menu or panel) on 8 animation frames in a row with the view and every node box unchanged
async function emptyCanvasPoint(page, ms = 8000) {
  const h = await page.waitForFunction(() => new Promise((res) => {
    const pts = [[200, 300], [30, 700], [1270, 740], [640, 40]];
    const sig = () => document.querySelector('.react-flow__viewport')?.style.transform + '|' + [...document.querySelectorAll('.react-flow__node')].map((n) => { const r = n.getBoundingClientRect(); return `${n.getAttribute('data-id')}:${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`; }).join(';');
    const bare = ([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest('.react-flow__pane') && !e.closest('.react-flow__node, .react-flow__edge, [data-wire-src], [data-context-menu], [data-edit-panel]'); };
    let last = sig();
    let same = 0;
    const tick = () => {
      const now = sig();
      same = now === last ? same + 1 : 0;
      last = now;
      const ok = same >= 8 ? pts.find(bare) : null;
      if (ok) res(ok); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), null, { timeout: ms });
  const [x, y] = await h.jsonValue();
  return { x, y };
}
async function waitForFile(file, test, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const t = readFileSync(file, 'utf8');
    if (test(t)) return t;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}
// the screen point half way along a drawn wire, where a click lands on it
const wireMid = (page, src, dst) => page.evaluate(([s, d]) => {
  const g = document.querySelector(`[data-wire-src="${s}"][data-wire-dst="${d}"]`);
  const p = g?.querySelector('path.react-flow__edge-path') ?? g?.querySelector('path');
  if (!p) return null;
  const pt = p.getPointAtLength(p.getTotalLength() / 2);
  const m = p.getScreenCTM();
  return { x: m.a * pt.x + m.c * pt.y + m.e, y: m.b * pt.x + m.d * pt.y + m.f };
}, [src, dst]);
const pinSel = (nodeSel, id, side) => `${nodeSel(id)} .react-flow__handle[data-handlepos="${side}"]`;
const noticeOf = (page) => page.evaluate(() => {
  const n = document.querySelector('[data-notice]');
  return n ? { tone: n.getAttribute('data-notice'), text: n.textContent, undo: !!n.querySelector('[data-notice-undo]') } : null;
});
async function expectParentOnly(file, before, parent) {
  const after = await waitForFile(file, (t) => t !== before && t.includes(`parent: ${parent}`));
  if (!after) await fail(`${file} did not get parent: ${parent}`);
  // every line but parent and updated, with its line ending, stays as it was
  const rest = (t) => t.split('\n').filter((l) => !/^(parent|updated):/.test(l)).join('\n');
  if (rest(after) !== rest(before)) await fail(`the parent change moved other lines: ${JSON.stringify(changedLines(before, after).slice(0, 4))}`);
  return after;
}
async function expectBytes(file, want, what) {
  if (!(await waitForFile(file, (t) => t === want))) await fail(`${what}: the file is not byte for byte as before`);
}

async function graphHas(s, needle, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await (await fetch(`${s.url}graph.json`)).text()).includes(needle)) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function wireChecks(page, w, nodeSel) {
  // a second concept to move into, written straight into the workspace the way a person would
  const versionBefore = await page.evaluate(() => document.documentElement.dataset.graphVersion ?? '');
  writeFileSync(join(w.work, 'spec', 'concepts', 'shapes.md'), '---\nid: concept-shapes\ntitle: Shapes\nparent: null\nconfidence: asserted\n---\n\n# Shapes\n\nA second box for the move checks.\n');
  if (!(await graphHas(w, 'concept-shapes'))) await fail('the live graph never showed the new concept');
  // the page has taken the new graph in (the box may still be outside the view, so it is not drawn yet)
  await page.waitForFunction((v) => (document.documentElement.dataset.graphVersion ?? '') !== v, versionBefore, { timeout: 10000 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  if ((await page.locator('[data-edit-panel]').count()) !== 0) await page.locator('[data-edit-panel] button[aria-label="Close panel"]').click();
  await page.locator('[data-edit-panel]').waitFor({ state: 'detached', timeout: 3000 });
  // the layout must be still before a point is picked, or the click can land on a node
  const empty = await emptyCanvasPoint(page);
  await page.mouse.click(empty.x, empty.y, { button: 'right' });
  await page.locator('[data-context-menu="pane"]').waitFor({ timeout: 3000 });
  await page.locator('[data-menu-item="fit-view"]').click();
  await viewSettled(page);
  await page.locator(nodeSel('concept-shapes')).waitFor({ timeout: 5000 });
  const done = [];

  // a right-click opens the menu and nothing else: no panel, no view shift
  const viewOf = () => page.evaluate(() => document.querySelector('.react-flow__viewport').style.transform);
  if ((await page.locator('[data-edit-panel]').count()) !== 0) await page.locator('[data-edit-panel] button[aria-label="Close panel"]').click();
  await page.locator('[data-edit-panel]').waitFor({ state: 'detached', timeout: 3000 });
  await viewSettled(page);
  const v0 = await viewOf();
  await page.locator(nodeSel('intent-adds-numbers')).click({ button: 'right', position: { x: 80, y: 16 } });
  await page.locator('[data-context-menu="intent"]').waitFor({ timeout: 3000 });
  await page.waitForTimeout(700);
  if ((await page.locator('[data-edit-panel]').count()) !== 0) await fail('a right-click opened the side panel');
  if ((await viewOf()) !== v0) await fail('the view moved under the open menu');
  await page.keyboard.press('Escape');
  done.push('right-click opens only the menu');

  // connect: drag from the constraint's output pin to the intent's input pin
  const kid = 'constraint-bad-anchor';
  const iid = 'intent-adds-numbers';
  const kfile = join(w.work, 'spec', 'constraints', 'bad-anchor.md');
  const k0 = readFileSync(kfile, 'utf8');
  const connect = async (frame) => {
    const from = await centreOf(page, pinSel(nodeSel, kid, 'right'));
    const to = await centreOf(page, pinSel(nodeSel, iid, 'left'));
    await dragMouse(page, from, to, {
      hold: async () => {
        const looks = await page.evaluate(() => [...document.querySelectorAll('.react-flow__node')].map((n) => [n.getAttribute('data-id'), n.className]));
        const cls = Object.fromEntries(looks);
        if (!/ig-drop-ok/.test(cls['intent-adds-numbers'] ?? '') || !/ig-drop-ok/.test(cls['concept-shapes'] ?? '')) await fail(`valid targets are not lit while dragging: ${JSON.stringify(looks)}`);
        if (!/ig-drop-from/.test(cls[kid] ?? '')) await fail('the node the wire starts at is not marked');
        // every intent and concept can take it, except the box it already hangs in
        const wrong = looks.filter(([id, c]) => /ig-drop-dim/.test(c) && /^(intent|concept)-/.test(id) && id !== 'concept-calculator');
        if (!/ig-drop-dim/.test(cls['concept-calculator'] ?? '')) await fail('the box the constraint already hangs in is lit as a target');
        if (wrong.length) await fail(`valid targets dimmed: ${wrong.map(([id]) => id).join(', ')}`);
        if ((await page.locator('.react-flow__connection-path').count()) !== 1) await fail('no wire is drawn while dragging');
        if (frame) await page.screenshot({ path: join(runDir, frame), ...FRAME });
      },
    });
  };
  await connect('wire-1-dragging-valid-lit.jpg');
  const k1 = await expectParentOnly(kfile, k0, iid);
  await page.locator('[data-notice="done"]').waitFor({ timeout: 3000 });
  const n1 = await noticeOf(page);
  if (!/^Connected .+ to .+\./.test(n1.text) || !n1.undo) await fail(`connect notice is ${JSON.stringify(n1)}`);
  await page.locator(`[data-wire-src="${kid}"][data-wire-dst="${iid}"]`).waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(runDir, 'wire-2-notice-undo.jpg'), ...FRAME });
  await page.locator('[data-notice-undo]').click();
  await expectBytes(kfile, k0, 'undo of a connect');
  await page.locator(`[data-wire-src="${kid}"][data-wire-dst="${iid}"]`).waitFor({ state: 'detached', timeout: 5000 });
  done.push('constraint wired to an intent and undone');

  // disconnect: click the wire and press Delete, then the wire menu, each undone with ctrl+z
  await page.waitForTimeout(500);
  await connect(null);
  await expectParentOnly(kfile, k0, iid);
  await page.locator(`[data-wire-src="${kid}"][data-wire-dst="${iid}"]`).waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  let mid = await wireMid(page, kid, iid);
  if (!mid) await fail('the new wire is not drawn');
  await page.mouse.click(mid.x, mid.y);
  await page.waitForFunction(([s, d]) => document.querySelector(`[data-wire-src="${s}"][data-wire-dst="${d}"]`)?.getAttribute('data-wire-selected') === 'true', [kid, iid], { timeout: 3000 });
  await page.keyboard.press('Delete');
  await expectParentOnly(kfile, k1, 'null');
  const n2 = await noticeOf(page);
  if (!/^Disconnected /.test(n2?.text ?? '')) await fail(`disconnect notice is ${JSON.stringify(n2)}`);
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+z');
  await expectBytes(kfile, k1, 'ctrl+z after Delete');
  await page.locator(`[data-wire-src="${kid}"][data-wire-dst="${iid}"]`).waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  mid = await wireMid(page, kid, iid);
  await page.mouse.click(mid.x, mid.y, { button: 'right' });
  await page.locator('[data-context-menu="wire"]').waitFor({ timeout: 3000 });
  await page.locator('[data-menu-item="delete-wire"]').click();
  await expectParentOnly(kfile, k1, 'null');
  await page.keyboard.press('Control+z');
  await expectBytes(kfile, k1, 'ctrl+z after Delete wire');
  await page.keyboard.press('Control+z');
  await expectBytes(kfile, k0, 'ctrl+z back to the start');
  done.push('wire deleted by Delete and by the menu, each undone with ctrl+z');

  // move: drag an intent out of its box into the other concept
  const gid = 'intent-greets-by-name';
  const gfile = join(w.work, 'spec', 'intents', 'greets-by-name.md');
  const g0 = readFileSync(gfile, 'utf8');
  await page.locator(`[data-wire-src="${kid}"][data-wire-dst="${iid}"]`).waitFor({ state: 'detached', timeout: 5000 });
  // pan the view down by dragging empty canvas, so the target box is not at the window edge where a held node pans the view
  await dragMouse(page, { x: 250, y: 300 }, { x: 250, y: 500 });
  await page.waitForTimeout(600);
  const gb = await page.locator(nodeSel(gid)).boundingBox();
  const grab = { x: gb.x + 40, y: gb.y + 14 };
  await dragMouse(page, grab, await centreOf(page, nodeSel('concept-shapes')), {
    hold: async () => {
      await page.waitForTimeout(150);
      // the box that would take the node is lit while the node is over it
      const lit = await page.evaluate(() => [...document.querySelectorAll('.react-flow__node.ig-drop-ok')].map((n) => n.getAttribute('data-id')));
      if (lit.join() !== 'concept-shapes') await fail(`the box under a held node is not the one lit: ${JSON.stringify(lit)}`);
      await page.screenshot({ path: join(runDir, 'wire-3-moving-into-concept.jpg'), ...FRAME });
    },
  });
  await expectParentOnly(gfile, g0, 'concept-shapes');
  await page.waitForTimeout(700);
  const lingerLit = await page.evaluate(() => document.querySelectorAll('[class*="ig-drop-"]').length);
  if (lingerLit !== 0) await fail(`${lingerLit} nodes still lit after a move`);
  const titleShadow = await page.evaluate(() => getComputedStyle(document.querySelector('.react-flow__node[data-id="concept-shapes"] [data-node-title]')).boxShadow);
  if (titleShadow !== 'none') await fail(`the target concept's title still has a highlight after a move: ${titleShadow}`);
  await page.screenshot({ path: join(runDir, 'wire-5-after-move.jpg'), ...FRAME });
  const n3 = await noticeOf(page);
  if (!/^Moved .+ into Shapes\./.test(n3?.text ?? '') || !n3.undo) await fail(`move notice is ${JSON.stringify(n3)}`);
  // the notice sits in the strip under the canvas and covers no node
  const noticeBox = await page.locator('[data-notice]').boundingBox();
  const canvasBottom = await page.evaluate(() => document.querySelector('.react-flow').getBoundingClientRect().bottom);
  if (!noticeBox || noticeBox.y < canvasBottom - 1) await fail(`the notice is not under the canvas: ${JSON.stringify(noticeBox)} canvas bottom ${canvasBottom}`);
  await page.screenshot({ path: join(runDir, 'wire-6-notice-strip.jpg'), ...FRAME });
  if ((await page.locator('[data-notice]').count()) !== 1) await fail('more than one notice on screen');
  await page.waitForTimeout(300);
  await page.locator('[data-notice-undo]').click();
  await expectBytes(gfile, g0, 'undo of a move');
  done.push('intent moved into another concept and undone');

  // fault: rename a node in place, press Enter, and within 300 ms drag another node into a concept.
  // both are written, in the order they were taken, and every request reaches the server.
  await page.waitForTimeout(900);
  const rid = 'intent-adds-numbers';
  const rfile = join(w.work, 'spec', 'intents', 'adds-numbers.md');
  const r0 = readFileSync(rfile, 'utf8');
  const posts = [];
  const onRequest = (rq) => { if (rq.method() === 'POST') posts.push(new URL(rq.url()).pathname + new URL(rq.url()).search); };
  page.on('request', onRequest);
  await page.locator(`${nodeSel(rid)} [data-node-title]`).dblclick();
  await page.locator('[data-rename-field]').waitFor({ timeout: 3000 });
  await page.waitForFunction(() => document.activeElement === document.querySelector('[data-rename-field]'), null, { timeout: 3000 });
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Adds numbers fast');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(60);
  const gb2 = await page.locator(nodeSel(gid)).boundingBox();
  await dragMouse(page, { x: gb2.x + 40, y: gb2.y + 14 }, await centreOf(page, nodeSel('concept-shapes')));
  const fastOk = await waitForFile(gfile, (t) => t.includes('parent: concept-shapes'), 6000);
  // the request events reach this process a little after the browser sends them: wait for both before the listener goes
  const postsBy = Date.now() + 3000;
  while (posts.length < 2 && Date.now() < postsBy) await page.waitForTimeout(50);
  page.off('request', onRequest);
  if (!fastOk) await fail(`a move taken right after a rename was never written, requests were ${JSON.stringify(posts)}`);
  if (!readFileSync(rfile, 'utf8').includes('title: Adds numbers fast')) await fail('the rename taken first was not written');
  const order = posts.map((p) => p.split('?')[0]);
  if (order.join(' ') !== '/api/node /api/parent') await fail(`the rename and the move were sent as ${JSON.stringify(posts)}`);
  await page.waitForTimeout(500);
  await page.keyboard.press('Control+z');
  await expectBytes(gfile, g0, 'undo of the fast move');
  await page.keyboard.press('Control+z');
  await expectBytes(rfile, r0, 'undo of the fast rename');
  done.push('a rename and a move taken within 300 ms are both written in order');

  // snap back: a small move inside its own box, and a drop on empty canvas, write nothing and put it back
  await page.waitForTimeout(900);
  for (const [name, dx, dy] of [['small move', 24, 10], ['empty canvas', 0, 0]]) {
    const before = await page.locator(nodeSel(gid)).boundingBox();
    const at = { x: before.x + 40, y: before.y + 14 };
    const to = name === 'empty canvas' ? { x: 250, y: 420 } : { x: at.x + dx, y: at.y + dy };
    await dragMouse(page, at, to);
    await page.waitForTimeout(NOTHING_WRITTEN_WAIT_MS);
    if (readFileSync(gfile, 'utf8') !== g0) await fail(`a ${name} wrote the file`);
    const after = await page.locator(nodeSel(gid)).boundingBox();
    if (Math.abs(after.x - before.x) > 1 || Math.abs(after.y - before.y) > 1) await fail(`after a ${name} the node did not go back`);
  }
  done.push('a small move and a drop on empty canvas snap back and write nothing');

  // refused drop: an intent's wire dropped on a constraint, and a wire dropped on empty canvas
  const files = () => [kfile, gfile, join(w.work, 'spec', 'intents', 'adds-numbers.md')].map((f) => readFileSync(f, 'utf8')).join('\n');
  const f0 = files();
  await dragMouse(page, await centreOf(page, pinSel(nodeSel, iid, 'right')), await centreOf(page, nodeSel(kid)));
  await page.locator('[data-notice="refused"]').waitFor({ timeout: 3000 });
  const n4 = await noticeOf(page);
  if (!/can only hang under a concept/.test(n4.text) || n4.undo) await fail(`refused drop notice is ${JSON.stringify(n4)}`);
  const lingering = await page.locator('.ig-drop-ok, .ig-drop-dim, .ig-drop-from').count();
  if (lingering !== 0) await fail(`${lingering} nodes still lit or dimmed after the drop`);
  await page.screenshot({ path: join(runDir, 'wire-4-refused-drop.jpg'), ...FRAME });
  await dragMouse(page, await centreOf(page, pinSel(nodeSel, kid, 'right')), { x: 250, y: 420 });
  await page.waitForTimeout(NOTHING_WRITTEN_WAIT_MS);
  if (files() !== f0) await fail('a refused drop or a drop on empty canvas wrote a file');
  done.push('a refused drop says why, a drop on empty canvas does nothing');

  // direct requests: a loop, a code node and no token are refused and write nothing.
  // a concept inside shapes gives the loop: shapes cannot hang under its own child.
  writeFileSync(join(w.work, 'spec', 'concepts', 'shapes-inner.md'), '---\nid: concept-shapes-inner\ntitle: Inner shapes\nparent: concept-shapes\nconfidence: asserted\n---\n');
  if (!(await graphHas(w, 'concept-shapes-inner'))) await fail('the live graph never showed the inner concept');
  const shapesFile = join(w.work, 'spec', 'concepts', 'shapes.md');
  const s0 = readFileSync(shapesFile, 'utf8');
  const codeId = await page.evaluate(() => [...document.querySelectorAll('.react-flow__node')].map((n) => n.getAttribute('data-id')).find((id) => !/^(intent|constraint|decision|concept)-/.test(id ?? '')) ?? null);
  const token = await page.evaluate(() => window.__INTENTGRAPH_LIVE__.token);
  const asks = await page.evaluate(async ([t, code]) => {
    const post = async (id, body, tok = t) => (await fetch(`/api/parent?id=${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-intentgraph-token': tok }, body: JSON.stringify(body) })).status;
    return {
      missing: await post('constraint-bad-anchor', { parent: 'intent-not-here' }),
      self: await post('intent-adds-numbers', { parent: 'intent-adds-numbers' }),
      wrongPair: await post('intent-adds-numbers', { parent: 'constraint-bad-anchor' }),
      loop: await post('concept-shapes', { parent: 'concept-shapes-inner' }),
      code: code ? await post(code, { parent: 'concept-calculator' }) : 422,
      noToken: await post('intent-adds-numbers', { parent: 'concept-shapes' }, ''),
    };
  }, [token, codeId]);
  if (asks.noToken !== 403 || Object.entries(asks).some(([k, s]) => k !== 'noToken' && (s < 400 || s >= 500))) await fail(`direct parent requests answered ${JSON.stringify(asks)}`);
  if (files() !== f0 || readFileSync(shapesFile, 'utf8') !== s0) await fail('a refused parent request wrote a file');
  done.push(`direct requests refused ${JSON.stringify(asks)}`);

  // two requests at once that would close a loop: one is written, the other refused, no loop on disk
  const call = (path, tok, body) => page.evaluate(async ([p, t, b]) => (await fetch(p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-intentgraph-token': t }, body: b })).status, [path, tok, JSON.stringify(body)]);
  const raceA = join(w.work, 'spec', 'concepts', 'race-a.md');
  const raceB = join(w.work, 'spec', 'concepts', 'race-b.md');
  const raceText = (id) => `---\nid: concept-race-${id}\ntitle: Race ${id}\nparent: null\nconfidence: asserted\n---\n`;
  writeFileSync(raceA, raceText('a'));
  writeFileSync(raceB, raceText('b'));
  if (!(await graphHas(w, 'concept-race-b')) || !(await graphHas(w, 'concept-race-a'))) await fail('the live graph never showed the two race concepts');
  const raced = await page.evaluate(async (t) => {
    const post = async (id, parent) => (await fetch(`/api/parent?id=${id}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-intentgraph-token': t }, body: JSON.stringify({ parent }) })).status;
    return Promise.all([post('concept-race-a', 'concept-race-b'), post('concept-race-b', 'concept-race-a')]);
  }, token);
  if (raced[0] !== 200 || raced[1] < 400 || raced[1] >= 500) await fail(`two requests that make a loop answered ${raced.join(' ')}`);
  if (readFileSync(raceB, 'utf8') !== raceText('b') || !readFileSync(raceA, 'utf8').includes('parent: concept-race-b')) await fail('the refused half of a loop race wrote, or the first did not');
  if ((await call('/api/undo', token, {})) !== 200 || readFileSync(raceA, 'utf8') !== raceText('a')) await fail('undo after the loop race did not restore the file');
  done.push(`a loop race answers ${raced.join(' ')} and writes one side`);

  // a file whose parent line is bare can be wired, with a space after the colon
  const bare = join(w.work, 'spec', 'concepts', 'bare.md');
  const bareText = '---\nid: concept-bare\ntitle: Bare\nparent:\nconfidence: asserted\n---\n';
  writeFileSync(bare, bareText);
  if (!(await graphHas(w, 'concept-bare'))) await fail('the live graph never showed the bare-parent concept');
  const bareStatus = await call('/api/parent?id=concept-bare', token, { parent: 'concept-calculator' });
  if (bareStatus !== 200 || !readFileSync(bare, 'utf8').includes('\nparent: concept-calculator\n')) await fail(`a bare parent line got ${bareStatus} and ${JSON.stringify(readFileSync(bare, 'utf8'))}`);
  await call('/api/undo', token, {});
  if (!(await waitForFile(bare, (t) => t === bareText))) await fail('undo of the bare parent did not restore the file');
  done.push('a bare parent: line is wired as parent: <id>');
  return done.join(', ');
}

async function readOnlyWireChecks(rpage, r, nodeSel) {
  const kid = 'constraint-bad-anchor';
  const iid = 'intent-adds-numbers';
  const kfile = join(r.work, 'spec', 'constraints', 'bad-anchor.md');
  // a wire to show the menu on, written straight into the workspace, not through the page
  const k0 = readFileSync(kfile, 'utf8').replace('parent: concept-calculator', `parent: ${iid}`);
  writeFileSync(kfile, k0);
  if (!(await graphHas(r, `"src":"${kid}","dst":"${iid}"`))) await fail('the read-only graph never showed the new wire');
  // below the state bar at the top of the page
  await rpage.mouse.click(6, 48, { button: 'right' });
  await rpage.locator('[data-context-menu="pane"]').waitFor({ timeout: 3000 }).catch(async () => { await rpage.screenshot({ path: join(runDir, 'crash-read-only.jpg'), ...FRAME }); await fail('no canvas menu on the read-only page'); });
  await rpage.locator('[data-menu-item="fit-view"]').click();
  await rpage.waitForTimeout(700);
  await rpage.locator(`[data-wire-src="${kid}"][data-wire-dst="${iid}"]`).waitFor({ timeout: 10000 });
  await rpage.waitForTimeout(500);
  const from = await centreOf(rpage, pinSel(nodeSel, iid, 'right'));
  await dragMouse(rpage, from, await centreOf(rpage, pinSel(nodeSel, kid, 'left')), {
    hold: async () => {
      if ((await rpage.locator('.react-flow__connection-path').count()) !== 0) await fail('a pin started a wire on a read-only page');
    },
  });
  const gid = 'intent-greets-by-name';
  const before = await rpage.locator(nodeSel(gid)).boundingBox();
  const concept = await centreOf(rpage, nodeSel('concept-calculator'));
  await dragMouse(rpage, { x: before.x + 40, y: before.y + 14 }, { x: before.x + 240, y: before.y + 160 }, {
    hold: async () => {
      if ((await rpage.locator('[class*="ig-drop-"]').count()) !== 0) await fail('something lit up while a node was dragged on a read-only page');
    },
  });
  // and over the middle of a concept box, where a writable page lights it
  await rpage.waitForTimeout(600);
  const before2 = await rpage.locator(nodeSel(gid)).boundingBox();
  await dragMouse(rpage, { x: before2.x + 40, y: before2.y + 14 }, concept, {
    hold: async () => {
      await rpage.waitForTimeout(150);
      if ((await rpage.locator('[class*="ig-drop-"]').count()) !== 0) await fail('a concept box lit up under a dragged node on a read-only page');
    },
  });
  await rpage.waitForTimeout(400);
  const after = await rpage.locator(nodeSel(gid)).boundingBox();
  if (Math.abs(after.x - before.x) > 1 || Math.abs(after.y - before.y) > 1) await fail('a dragged node did not go back on a read-only page');
  const mid = await wireMid(rpage, kid, iid);
  await rpage.mouse.click(mid.x, mid.y, { button: 'right' });
  await rpage.locator('[data-context-menu="wire"]').waitFor({ timeout: 3000 });
  const item = await rpage.locator('[data-menu-item="delete-wire"]').getAttribute('aria-disabled');
  const reason = await rpage.locator('[data-menu-reason]').innerText();
  if (item !== 'true' || !/--write/.test(reason)) await fail(`read-only wire menu: disabled ${item}, reason "${reason}"`);
  await rpage.locator('[data-menu-item="delete-wire"]').click({ force: true });
  await rpage.keyboard.press('Escape');
  await rpage.mouse.click(mid.x, mid.y);
  await rpage.keyboard.press('Delete');
  await rpage.keyboard.press('Control+z');
  await rpage.waitForTimeout(NOTHING_WRITTEN_WAIT_MS);
  if (readFileSync(kfile, 'utf8') !== k0) await fail('a read-only page changed a file');
  return 'no wire from a pin, the dragged node went back, Delete wire disabled with the reason, Delete and ctrl+z sent nothing';
}

let livePage = null;
try {
  // 1 the page the server serves
  if (!args.includes('--no-build')) {
    const b = spawnSync('pnpm --filter @intentgraph/webview build', { cwd: root, shell: true, encoding: 'utf8' });
    writeFileSync(join(runDir, 'webview-build.log'), (b.stdout || '') + (b.stderr || ''));
    if (b.status !== 0) await fail(`webview build failed, see ${join(runDir, 'webview-build.log')}`);
  }
  if (!existsSync(join(webDir, 'index.html'))) await fail('no webview build, drop --no-build');
  console.log(`ok webview (${secs()}s) - ${webDir}`);

  // 2 a --write server on a fixture copy
  const w = await startServer('write', true);
  if (!w.lines.some((l) => l.startsWith('edits: on'))) await fail('write server did not say edits are on');
  console.log(`ok server (${secs()}s) - ${w.url} on ${w.work}`);
  if (serveOnly) {
    console.log(`serving with --write. edit on the page or under ${w.work}, ctrl+c stops`);
    await new Promise(() => {});
  }

  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // the refused writes this script makes on purpose log a failed resource load, those are expected
  const expectedRefusal = /Failed to load resource: the server responded with a status of (403|409|422)/;
  livePage = page;
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '') && !expectedRefusal.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(w.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const nodeSel = (id) => `.react-flow__node[data-id="${id}"]`;
  await page.locator(nodeSel('intent-has-no-checks')).waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);

  // 3 check 2: select a node, the panel opens with its title and body
  const rel = 'spec/intents/has-no-checks.md';
  const file = join(w.work, rel);
  const original = readFileSync(file, 'utf8');
  await page.locator(nodeSel('intent-has-no-checks')).click();
  const panel = page.locator('[data-edit-panel="intent-has-no-checks"]');
  await panel.waitFor({ timeout: 5000 });
  try {
    await page.waitForFunction(() => document.querySelector('[data-edit-title]')?.value === 'Nothing proves this one yet', null, { timeout: 5000 });
  } catch {
    await fail(`panel title is "${await page.locator('[data-edit-title]').inputValue()}"`);
  }
  const bodyText = await page.locator('[data-edit-body]').inputValue();
  if (!bodyText.includes('No anchors, so the node shows pending.')) await fail(`panel body is "${bodyText.slice(0, 80)}"`);
  if (await page.locator('[data-edit-title]').isDisabled()) await fail('title is disabled on a --write server');
  // lane 6: the node is outlined, the panel stays off it, the node is in view, the path shows in full
  await page.waitForTimeout(700);
  const look = await selectedLook(page, nodeSel('intent-has-no-checks'));
  if (!isOutlined(look)) await fail(`selected node has no visible selected state: ${JSON.stringify(look)}`);
  if ((await overlapOf(page, '[data-edit-panel]', nodeSel('intent-has-no-checks'))) !== false) await fail('the panel overlaps the selected node');
  if (!(await inWindow(page, nodeSel('intent-has-no-checks')))) await fail('the selected node is not in view');
  const fileRow = await page.locator('[data-edit-file]').evaluate((e) => ({ text: e.textContent, cut: e.scrollWidth - e.clientWidth }));
  if (fileRow.text !== rel || fileRow.cut > 0) await fail(`panel path is cut or wrong: ${JSON.stringify(fileRow)}`);
  await page.screenshot({ path: join(runDir, FRAMES[0]), ...FRAME });
  console.log(`ok panel (${secs()}s) - title and body shown for ${rel}, outlined, clear of the panel, path whole`);

  // 4 edit the title: unsaved mark, ctrl+s, label changes in 3 s
  const newTitle = 'Nothing proves this one, edited in the panel';
  await page.locator('[data-edit-title]').fill(newTitle);
  if ((await page.locator('[data-edit-panel] [data-unsaved="true"]').count()) !== 1) await fail('no unsaved mark after typing');
  await page.screenshot({ path: join(runDir, FRAMES[1]), ...FRAME });
  const tSave = Date.now();
  await page.keyboard.press('Control+s');
  try {
    await page.waitForFunction(([sel, t]) => document.querySelector(sel)?.textContent?.includes(t), [nodeSel('intent-has-no-checks'), newTitle], { timeout: LABEL_LIMIT_MS });
  } catch {
    await fail(`label did not change within ${LABEL_LIMIT_MS} ms of ctrl+s`);
  }
  const labelMs = Date.now() - tSave;
  await page.locator('[data-edit-saved]').waitFor({ timeout: 2000 }).catch(() => {});
  if ((await page.locator('[data-edit-panel] [data-unsaved="true"]').count()) !== 0) await fail('unsaved mark still on after the save');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(runDir, FRAMES[2]), ...FRAME });

  // 5 check 3: only the title, the mirrored heading and updated changed
  const saved = readFileSync(file, 'utf8');
  const today = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
  const want = original
    .replace('title: Nothing proves this one yet\r\n', `title: ${newTitle}\r\n`)
    .replace('\r\n---\r\n\r\n# Nothing proves this one yet\r\n', `\r\nupdated: ${today}\r\n---\r\n\r\n# ${newTitle}\r\n`);
  if (want === original) await fail('fixture is not the shape this script expects');
  if (saved !== want) await fail(`saved file differs from the expected bytes: ${JSON.stringify(changedLines(want, saved)).slice(0, 200)}`);
  console.log(`ok save (${secs()}s) - label in ${labelMs} ms, file differs only in the title, the heading and an updated line`);

  // 5b a save after the file changed on disk is a conflict and writes nothing
  await page.locator('[data-edit-body]').fill('Typed in the panel.\n');
  const onDisk = saved.replace('No anchors, so the node shows pending.', 'Changed on disk meanwhile.');
  writeFileSync(file, onDisk);
  await page.keyboard.press('Control+s');
  try {
    await page.locator('[data-edit-error]').waitFor({ timeout: 3000 });
  } catch {
    await fail('no message for a conflicting save');
  }
  const conflictText = await page.locator('[data-edit-error]').innerText();
  if (!/changed on disk/i.test(conflictText)) await fail(`conflict message is "${conflictText}"`);
  if (readFileSync(file, 'utf8') !== onDisk) await fail('a conflicting save overwrote the file');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('[data-edit-body]')?.value.includes('Changed on disk meanwhile.'), null, { timeout: 3000 }).catch(() => {});
  if (!(await page.locator('[data-edit-body]').inputValue()).includes('Changed on disk meanwhile.')) await fail('esc did not load the version on disk');
  console.log(`ok conflict (${secs()}s) - "${conflictText.slice(0, 70)}", file kept, esc loaded the disk version`);

  // 6 check 4: create an intent from the concept, it appears inside the concept in 3 s
  await page.locator(nodeSel('concept-calculator')).click({ position: { x: 60, y: 20 } });
  const add = page.locator('[data-add-intent="concept-calculator"]');
  await add.waitFor({ timeout: 3000 });
  await add.click();
  await page.locator('[data-create-form="concept-calculator"]').waitFor({ timeout: 3000 });
  await page.waitForTimeout(700);
  if ((await overlapOf(page, '[data-create-form]', nodeSel('concept-calculator'))) !== false) await fail('the create form overlaps the selected concept');
  if (!isOutlined(await selectedLook(page, nodeSel('concept-calculator')))) await fail('the selected concept has no visible selected state');
  // the form asks for target kinds, one preselected
  const kindState = await page.evaluate(() => [...document.querySelectorAll('[data-create-kind]')].map((c) => [c.getAttribute('data-create-kind'), c.checked]));
  if (kindState.length < 2 || kindState.filter(([, on]) => on).length !== 1) await fail(`create form kinds: ${JSON.stringify(kindState)}`);
  const problemsBefore = (await (await fetch(`${w.url}graph.json`)).json()).problems.length;
  const createTitle = 'Dividing by zero gives an error';
  await page.locator('[data-create-title]').fill(createTitle);
  await page.screenshot({ path: join(runDir, FRAMES[3]), ...FRAME });
  const before = listing(w.work);
  const tCreate = Date.now();
  await page.locator('[data-create-save]').click();
  const newId = 'intent-dividing-by-zero-gives-an-error';
  try {
    await page.locator(nodeSel(newId)).waitFor({ timeout: NODE_LIMIT_MS });
  } catch {
    await fail(`new node did not appear within ${NODE_LIMIT_MS} ms`);
  }
  const nodeMs = Date.now() - tCreate;
  const newRel = 'spec/intents/dividing-by-zero-gives-an-error.md';
  if (!existsSync(join(w.work, newRel))) await fail(`${newRel} was not written`);
  if (listing(w.work).split(',').length !== before.split(',').length + 1) await fail('create wrote more than one file');
  const graph = await (await fetch(`${w.url}graph.json`)).json();
  const gnode = graph.nodes.find((n) => n.id === newId);
  if (!gnode || gnode.parent_id !== 'concept-calculator') await fail(`graph has the new node with parent ${gnode && gnode.parent_id}`);
  if (graph.problems.some((p) => p.severity === 'error' && p.file === newRel)) await fail('parser rejected the new file');
  const created = readFileSync(join(w.work, newRel), 'utf8');
  if (!/^target_kinds:\r?\n  - code_module\r?\n/m.test(created)) await fail(`new file has no target_kinds: ${JSON.stringify(created.slice(0, 200))}`);
  if (graph.problems.length !== problemsBefore || graph.problems.some((p) => p.file === newRel)) await fail(`the new intent added a problem: ${JSON.stringify(graph.problems.filter((p) => p.file === newRel))} (${problemsBefore} before, ${graph.problems.length} after)`);
  await page.locator(`[data-edit-panel="${newId}"]`).waitFor({ timeout: 3000 });
  await page.waitForTimeout(700);
  if (!isOutlined(await selectedLook(page, nodeSel(newId)))) await fail('the new node has no visible selected state after the create');
  if ((await overlapOf(page, '[data-edit-panel]', nodeSel(newId))) !== false) await fail('the panel overlaps the new node after the create');
  const check = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    `import { parseSpecTree } from ${JSON.stringify('file:///' + join(root, 'packages/skill/src/parser/spec-md/index.ts').replace(/\\/g, '/'))};
     const r = parseSpecTree(${JSON.stringify(join(w.work, 'spec'))});
     const n = r.nodes.find((x) => x.id === ${JSON.stringify(newId)});
     console.log(JSON.stringify({ errors: r.errors.length, parent: n && n.parentId, confidence: n && n.confidence, title: n && n.title }));`], { cwd: root, encoding: 'utf8' });
  let parsed = null;
  try { parsed = JSON.parse((check.stdout || '').trim().split(/\r?\n/).pop()); } catch { parsed = null; }
  if (!parsed || parsed.errors !== 0 || parsed.parent !== 'concept-calculator' || parsed.title !== createTitle) await fail(`parseSpecTree on the new file: ${(check.stdout || check.stderr || '').slice(0, 200)}`);
  const inside = await page.evaluate(([c, n]) => {
    const a = document.querySelector(c)?.getBoundingClientRect();
    const b = document.querySelector(n)?.getBoundingClientRect();
    return !!a && !!b && b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom;
  }, [nodeSel('concept-calculator'), nodeSel(newId)]);
  if (!inside) await fail('new node is not drawn inside its concept');
  await page.locator(`[data-edit-panel="${newId}"]`).waitFor({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(runDir, FRAMES[4]), ...FRAME });
  console.log(`ok create (${secs()}s) - ${newRel} in ${nodeMs} ms, parseSpecTree accepts it (${parsed.confidence}), drawn inside the concept`);

  // 7 check 5: an empty title and a duplicate slug are refused on screen, nothing written
  const refusedCase = async (title) => {
    await page.locator(nodeSel('concept-calculator')).click({ position: { x: 60, y: 20 } });
    await page.locator('[data-add-intent="concept-calculator"]').click();
    await page.locator('[data-create-form]').waitFor({ timeout: 3000 });
    const files = listing(w.work);
    await page.locator('[data-create-title]').fill(title);
    await page.locator('[data-create-save]').click();
    try {
      await page.locator('[data-create-form] [data-edit-error]').waitFor({ timeout: 3000 });
    } catch {
      await fail(`no message for title "${title}"`);
    }
    await page.waitForTimeout(NOTHING_WRITTEN_WAIT_MS);
    if (listing(w.work) !== files) await fail(`title "${title}" wrote a file`);
    return page.locator('[data-create-form] [data-edit-error]').innerText();
  };
  const emptyMsg = await refusedCase('   ');
  await page.keyboard.press('Escape');
  const dupMsg = await refusedCase('Dividing by zero, gives an error!');
  if (!/already exists/i.test(dupMsg)) await fail(`duplicate message is "${dupMsg}"`);
  await page.screenshot({ path: join(runDir, FRAMES[5]), ...FRAME });
  await page.keyboard.press('Escape');
  console.log(`ok refused (${secs()}s) - empty: "${emptyMsg.slice(0, 50)}", duplicate: "${dupMsg.slice(0, 60)}", nothing written`);

  // 7a the form refuses no kind, and the server refuses a kind that is not allowed
  await page.locator(nodeSel('concept-calculator')).click({ position: { x: 60, y: 20 } });
  await page.locator('[data-add-intent="concept-calculator"]').click();
  await page.locator('[data-create-form]').waitFor({ timeout: 3000 });
  const filesKinds = listing(w.work);
  await page.locator('[data-create-title]').fill('Kinds need one');
  await page.locator('[data-create-kind="code_module"]').uncheck();
  await page.locator('[data-create-save]').click();
  const kindsMsg = await page.locator('[data-create-form] [data-edit-error]').innerText().catch(() => '');
  if (!/at least one/i.test(kindsMsg)) await fail(`no kinds message: "${kindsMsg}"`);
  const badKind = await page.evaluate(async () => {
    const token = window.__INTENTGRAPH_LIVE__.token;
    const post = async (kinds) => (await fetch('/api/intents', { method: 'POST', headers: { 'content-type': 'application/json', 'x-intentgraph-token': token }, body: JSON.stringify({ parent: 'concept-calculator', title: 'Bad kind intent', target_kinds: kinds }) })).status;
    return [await post(['nonsense']), await post([]), await post('code_module')];
  });
  await page.waitForTimeout(NOTHING_WRITTEN_WAIT_MS);
  if (badKind.some((s) => s !== 422)) await fail(`a kind that is not allowed got ${badKind.join(' ')}`);
  if (listing(w.work) !== filesKinds) await fail('a refused kind wrote a file');
  await page.keyboard.press('Escape');
  console.log(`ok kinds (${secs()}s) - none picked: "${kindsMsg.slice(0, 40)}", server 422 for a bad kind, an empty list and a non-list`);

  // 7b an empty title in the edit panel is refused too
  await page.locator(nodeSel('intent-adds-numbers')).click();
  await page.locator('[data-edit-panel="intent-adds-numbers"]').waitFor({ timeout: 3000 });
  await page.waitForFunction(() => document.querySelector('[data-edit-title]')?.value.length > 0, null, { timeout: 3000 });
  const addsBefore = readFileSync(join(w.work, 'spec/intents/adds-numbers.md'), 'utf8');
  await page.locator('[data-edit-title]').fill('');
  await page.locator('[data-edit-save]').click();
  await page.locator('[data-edit-panel] [data-edit-error]').waitFor({ timeout: 3000 }).catch(() => {});
  if ((await page.locator('[data-edit-panel] [data-edit-error]').count()) !== 1) await fail('no message for an empty title in the panel');
  await page.waitForTimeout(NOTHING_WRITTEN_WAIT_MS);
  if (readFileSync(join(w.work, 'spec/intents/adds-numbers.md'), 'utf8') !== addsBefore) await fail('an empty title was written');
  await page.keyboard.press('Escape');
  console.log(`ok empty title in panel (${secs()}s) - refused, file kept`);

  // 7b2 cmd+s saves like ctrl+s
  await page.locator(nodeSel('intent-adds-numbers')).click();
  await page.locator('[data-edit-panel="intent-adds-numbers"]').waitFor({ timeout: 3000 });
  await page.waitForFunction(() => document.querySelector('[data-edit-title]')?.value.length > 0, null, { timeout: 3000 });
  await page.locator('[data-edit-title]').fill('Adds numbers, saved with cmd');
  await page.keyboard.press('Meta+s');
  try {
    await page.waitForFunction(([sel, t]) => document.querySelector(sel)?.textContent?.includes(t), [nodeSel('intent-adds-numbers'), 'Adds numbers, saved with cmd'], { timeout: LABEL_LIMIT_MS });
  } catch {
    await fail('cmd+s did not save');
  }
  if (!readFileSync(join(w.work, 'spec/intents/adds-numbers.md'), 'utf8').includes('title: Adds numbers, saved with cmd')) await fail('cmd+s did not write the title');
  console.log(`ok cmd+s (${secs()}s) - saved`);

  // 7b3 no title is cut, with a drift report loaded and a 40 character title on the page
  const longTitle = 'Adding two numbers returns the exact sum';
  const made = await page.evaluate(async (title) => (await fetch('/api/intents', { method: 'POST', headers: { 'content-type': 'application/json', 'x-intentgraph-token': window.__INTENTGRAPH_LIVE__.token }, body: JSON.stringify({ parent: 'concept-calculator', title, target_kinds: ['code_module'] }) })).status, longTitle);
  if (made !== 201) await fail(`the 40 character intent got ${made}`);
  const driftDir = join(w.work, '.runs', 'drift', 'run-1');
  mkdirSync(driftDir, { recursive: true });
  const pairOf = (node_id, verdict) => ({ commit: 'a1b2c3d', node_id, targets: [], decided_by: 'judge', verdict, confidence: 'inferred', certainty: 'high', evidence: 'canned', evidence_in_diff: true, suggested_action: 'none', truncated: false, diff_chars: 1, cost_usd: 0, seconds: 0, judge_model: null, error: null });
  writeFileSync(join(driftDir, 'report.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', args: [], report: { mode: 'range', pairs: [pairOf('intent-adds-numbers', 'drift'), pairOf('intent-greets-by-name', 'aligned'), pairOf('intent-has-no-checks', 'unclear'), pairOf('intent-adding-two-numbers-returns-the-exact-sum', 'drift')] } }));
  writeFileSync(join(w.work, '.runs', 'drift', 'latest.json'), JSON.stringify({ result: 'PASS', seconds: 0, note: 'canned', report: join(driftDir, 'report.json') }));
  await page.waitForFunction(() => document.querySelectorAll('[data-drift]').length >= 4, null, { timeout: 5000 }).catch(() => {});
  const marks = await page.locator('[data-drift]').count();
  if (marks < 4) await fail(`only ${marks} drift marks showed`);
  await page.locator(nodeSel('intent-adding-two-numbers-returns-the-exact-sum')).waitFor({ timeout: 3000 });
  await page.waitForTimeout(600);
  const titles = await nodeTitles(page);
  const graphNow = await (await fetch(`${w.url}graph.json`)).json();
  const wanted = new Map(graphNow.nodes.map((n) => [n.id, n.title]));
  const cut = titles.filter((x) => x.w > 0 || x.h > 1 || x.clipped > 1 || x.titleBottom > 1 || x.text !== wanted.get(x.id));
  if (cut.length) await fail(`titles cut with a drift report loaded: ${JSON.stringify(cut[0])}`);
  const longOne = titles.find((x) => x.id === 'intent-adding-two-numbers-returns-the-exact-sum');
  if (!longOne || longOne.text !== longTitle || longOne.lines > 2) await fail(`the 40 character title is not whole on at most two lines: ${JSON.stringify(longOne)}`);
  await page.screenshot({ path: join(runDir, 'extra-long-titles-drift.jpg'), ...FRAME });
  console.log(`ok titles (${secs()}s) - ${titles.length} nodes, none cut, 40 character title whole in ${longOne.lines} line(s), ${marks} drift marks`);

  // 7b4 the open problems list does not cover a node's title
  const brokenFile = join(w.work, 'spec', 'intents', 'broken-on-purpose.md');
  writeFileSync(brokenFile, '---\nid: intent-broken\ntitle: [oops\n---\n');
  await page.locator('[data-problems-count]').waitFor({ timeout: 5000 }).catch(() => {});
  if ((await page.locator('[data-problems-count]').count()) !== 1) await fail('no problems count for a broken file');
  await page.locator('[data-problems-count] button').click();
  await page.locator('[aria-label="spec problems"]').waitFor({ timeout: 3000 });
  await page.waitForTimeout(500);
  const covered = await page.evaluate(() => {
    const list = document.querySelector('[aria-label="spec problems"]').getBoundingClientRect();
    return [...document.querySelectorAll('[data-node-title]')].filter((e) => {
      const r = e.getBoundingClientRect();
      const visible = r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
      return visible && r.left < list.right && list.left < r.right && r.top < list.bottom && list.top < r.bottom;
    }).map((e) => e.textContent);
  });
  if (covered.length) await fail(`the problems list covers ${covered.length} title(s): ${covered[0]}`);
  await page.screenshot({ path: join(runDir, 'extra-problems-open.jpg'), ...FRAME });
  await page.locator('[data-problems-count] button').click();
  rmSync(brokenFile);
  console.log(`ok problems list (${secs()}s) - open, sits under the canvas, covers no title`);

  // 7d lane 7, direct editing: rename in place, the right-click menu, the keyboard, the plus button
  const gid = 'intent-greets-by-name';
  const gfile = join(w.work, 'spec', 'intents', 'greets-by-name.md');
  const viewTransform = () => page.evaluate(() => document.querySelector('.react-flow__viewport').style.transform);
  const rectOf = (sel) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; }, sel);
  const within = (a, b, px) => !!a && !!b && Math.abs(a.x - b.x) <= px && Math.abs(a.y - b.y) <= px && Math.abs(a.w - b.w) <= px && Math.abs(a.h - b.h) <= px;
  const focusedId = () => page.evaluate(() => document.activeElement?.closest('.react-flow__node')?.getAttribute('data-id') ?? null);
  const field = page.locator('[data-rename-field]');

  // the plus button sits in a concept's header strip, no selection needed
  await page.keyboard.press('Escape');
  await page.locator(nodeSel('concept-calculator')).waitFor({ timeout: 3000 });
  const plusIn = await page.evaluate(() => {
    const b = document.querySelector('[data-add-intent="concept-calculator"]')?.getBoundingClientRect();
    const h = document.querySelector('.react-flow__node[data-id="concept-calculator"] [data-node-header]')?.getBoundingClientRect();
    return !!b && !!h && b.left >= h.left && b.right <= h.right && b.top >= h.top && b.bottom <= h.bottom;
  });
  if (!plusIn) await fail('the plus button is not inside the concept header strip');
  await page.screenshot({ path: join(runDir, 'direct-4-plus-button.jpg'), ...FRAME });

  // lane 7 fix: with nothing selected, a real double-click on a title opens the rename field on that node.
  // the first click selects and would open the panel and pan the view, so the second must still land on the title.
  const titleCentre = async (id) => { const r = await rectOf(`${nodeSel(id)} [data-node-title]`); return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null; };
  const deselect = async () => { await page.keyboard.press('Escape'); await page.mouse.click(30, 400); await page.waitForTimeout(500); };
  const freshDouble = async (id, label) => {
    await deselect();
    if (await page.locator('[data-edit-panel]').count()) await fail(`${label}: something stayed selected before the double-click`);
    const c = await titleCentre(id);
    if (!c) await fail(`${label}: no title for ${id}`);
    const v0 = await viewTransform();
    await page.mouse.dblclick(c.x, c.y);
    const opened = await field.waitFor({ timeout: 3000 }).then(() => true, () => false);
    if (!opened) { const st = await page.evaluate((cc) => ({ at: document.elementFromPoint(cc.x, cc.y)?.outerHTML.slice(0, 120), panel: document.querySelector('[data-edit-panel]')?.getAttribute('data-edit-panel') ?? null }), c); await fail(`${label}: a double-click on the title of an unselected node did not open the rename field ${JSON.stringify(st)} ${v0} then ${await viewTransform()}`); }
    const on = await page.evaluate(() => document.querySelector('[data-rename-field]')?.closest('.react-flow__node')?.getAttribute('data-id'));
    if (on !== id) await fail(`${label}: the rename field opened on ${on}, not ${id}`);
    await page.waitForTimeout(600);
    if ((await viewTransform()) !== v0) await fail(`${label}: the view moved while the field was open`);
    if ((await field.count()) !== 1) await fail(`${label}: the rename field closed on its own`);
    const act = await page.evaluate(() => document.activeElement === document.querySelector('[data-rename-field]'));
    if (!act) await fail(`${label}: the rename field is open but does not hold the focus`);
    await page.keyboard.press('Escape');
    await field.waitFor({ state: 'detached', timeout: 3000 }).catch(() => fail(`${label}: Escape did not close the rename field`));
  };
  await freshDouble(gid, 'middle of the view');
  // a node that sits where the panel opens: drag the view so the title is near the right edge
  await deselect();
  const cg = await titleCentre(gid);
  const winW = await page.evaluate(() => window.innerWidth);
  const shift = Math.round(winW - 200 - cg.x);
  await page.mouse.move(30, 400);
  await page.mouse.down();
  await page.mouse.move(30 + shift, 400, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const cg2 = await titleCentre(gid);
  if (!cg2 || cg2.x < winW - 380) await fail(`could not park the node under the panel zone: ${JSON.stringify(cg2)}`);
  await freshDouble(gid, 'under the panel zone');
  await deselect();
  await page.mouse.click(30, 400, { button: 'right' });
  await page.locator('[data-menu-item="fit-view"]').click();
  await page.waitForTimeout(900);
  console.log(`ok double-click unselected (${secs()}s) - nothing selected, a real double-click on the title opens the rename field in the middle and under the panel zone`);

  // a double-click on empty canvas still zooms, on a node it does not
  await page.locator(nodeSel(gid)).click();
  await page.locator(`[data-edit-panel="${gid}"]`).waitFor({ timeout: 3000 });
  await page.waitForTimeout(900);
  const t0 = await viewTransform();
  const nodeBox0 = await rectOf(nodeSel(gid));
  const titleBox0 = await rectOf(`${nodeSel(gid)} [data-node-title]`);
  await page.locator(`${nodeSel(gid)} [data-node-header]`).dblclick({ position: { x: 150, y: 8 } });
  await page.waitForTimeout(500);
  if ((await viewTransform()) !== t0) await fail('a double-click on a node moved the zoom');
  if ((await field.count()) !== 0) await fail('a double-click off the title opened the rename field');
  console.log(`ok double-click (${secs()}s) - a double-click on a node leaves the view at ${t0}`);

  // rename by double-click on the title, Esc leaves the file alone
  const gBefore = readFileSync(gfile, 'utf8');
  await page.locator(`${nodeSel(gid)} [data-node-title]`).dblclick();
  await field.waitFor({ timeout: 3000 });
  const open = await page.evaluate(() => { const f = document.querySelector('[data-rename-field]'); return { focused: document.activeElement === f, all: f.selectionStart === 0 && f.selectionEnd === f.value.length, value: f.value }; });
  if (!open.focused || !open.all) await fail(`rename field is not focused with the text selected: ${JSON.stringify(open)}`);
  if ((await viewTransform()) !== t0) await fail('opening the rename field moved the view');
  // check 3: same box, same title place, within 1 px
  const nodeBox1 = await rectOf(nodeSel(gid));
  const fieldBox = await rectOf('[data-rename-field]');
  if (!within(nodeBox0, nodeBox1, 1)) await fail(`the node changed size with the field open: ${JSON.stringify(nodeBox0)} then ${JSON.stringify(nodeBox1)}`);
  if (!within(titleBox0, fieldBox, 1)) await fail(`the field is not where the title was: ${JSON.stringify(titleBox0)} then ${JSON.stringify(fieldBox)}`);
  await page.screenshot({ path: join(runDir, 'direct-1-rename-field.jpg'), ...FRAME });
  await page.keyboard.type('This must never be written');
  await page.keyboard.press('Escape');
  await field.waitFor({ state: 'detached', timeout: 3000 });
  await page.waitForTimeout(NOTHING_WRITTEN_WAIT_MS);
  if (readFileSync(gfile, 'utf8') !== gBefore) await fail('Esc in the rename field wrote the file');
  if ((await page.locator(`[data-edit-panel="${gid}"]`).count()) !== 1) await fail('Esc in the rename field also closed the panel');
  if (!within(nodeBox0, await rectOf(nodeSel(gid)), 1)) await fail('the node changed size after the field closed');
  if ((await focusedId()) !== gid) await fail(`focus did not return to the node, it is on ${await focusedId()}`);
  console.log(`ok esc (${secs()}s) - the field closed, the file is untouched, the panel stayed, focus is back on the node`);

  // F2 opens the field, Enter saves, only the title, the heading and updated change
  await page.keyboard.press('F2');
  await field.waitFor({ timeout: 3000 });
  await page.waitForFunction(() => document.activeElement === document.querySelector('[data-rename-field]'), null, { timeout: 3000 });
  const renamed = 'Greeting the person by name';
  await page.keyboard.type(renamed);
  await page.keyboard.press('Enter');
  try {
    await page.waitForFunction(([sel, t]) => document.querySelector(sel)?.textContent?.includes(t), [`${nodeSel(gid)} [data-node-title]`, renamed], { timeout: LABEL_LIMIT_MS });
  } catch {
    await fail('the label did not change after Enter in the rename field');
  }
  await field.waitFor({ state: 'detached', timeout: 3000 });
  const oldTitle = /^title: (.*)\r\n/m.exec(gBefore)[1];
  const gWant = gBefore
    .replace(`title: ${oldTitle}\r\n`, `title: ${renamed}\r\n`)
    .replace(`\r\n---\r\n\r\n# ${oldTitle}\r\n`, `\r\nupdated: ${today}\r\n---\r\n\r\n# ${renamed}\r\n`);
  if (gWant === gBefore) await fail('the greets fixture is not the shape this script expects');
  if (readFileSync(gfile, 'utf8') !== gWant) await fail(`rename wrote more than the title, the heading and updated: ${JSON.stringify(changedLines(gWant, readFileSync(gfile, 'utf8'))).slice(0, 200)}`);
  if ((await focusedId()) !== gid) await fail('focus did not return to the node after the rename');
  await page.waitForFunction((t) => document.querySelector('[data-edit-title]')?.value === t, renamed, { timeout: 3000 }).catch(() => {});
  if ((await page.locator('[data-edit-title]').inputValue()) !== renamed) await fail('the panel did not pick up the new title');
  console.log(`ok rename (${secs()}s) - F2, type, Enter: "${oldTitle}" became "${renamed}", file differs only in the title, the heading and updated`);

  // a rename with unsaved text in the panel goes to the panel's title field
  await page.locator('[data-edit-title]').fill('Typed in the panel first');
  await page.locator(`${nodeSel(gid)} [data-node-title]`).dblclick();
  await page.waitForTimeout(300);
  if ((await field.count()) !== 0) await fail('a rename opened on the node while the panel held unsaved text');
  if (!(await page.evaluate(() => document.activeElement?.hasAttribute('data-edit-title')))) await fail('the panel title field did not take focus');
  if ((await page.locator('[data-edit-title]').inputValue()) !== 'Typed in the panel first') await fail('the unsaved panel text was lost');
  await page.keyboard.press('Escape');
  await page.waitForFunction((t) => document.querySelector('[data-edit-title]')?.value === t, renamed, { timeout: 3000 });
  console.log(`ok panel first (${secs()}s) - unsaved panel text kept, the rename went to the panel title field`);

  // polish: the title says it can be renamed, the focus ring is clear, tabbing the panel never drops to the body
  const hint = await page.evaluate((sel) => { const t = document.querySelector(sel); const cs = t && getComputedStyle(t); return t && { title: t.getAttribute('title'), cursor: cs.cursor }; }, `${nodeSel(gid)} [data-node-title]`);
  if (!hint || hint.title !== 'Double-click or F2 to rename' || hint.cursor !== 'text') await fail(`the title gives no rename hint: ${JSON.stringify(hint)}`);
  await page.locator(nodeSel(gid)).focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const ring = await page.evaluate((id) => { const n = document.querySelector('.react-flow__node[data-id="' + id + '"]'); const b = n.querySelector('.ig-node-body'); const cs = getComputedStyle(b); return { focused: document.activeElement === n, width: parseFloat(cs.outlineWidth), style: cs.outlineStyle, offset: parseFloat(cs.outlineOffset) }; }, gid);
  if (!ring.focused || (ring.style !== 'solid' || ring.width < 3 || ring.offset < 3)) await fail(`the keyboard focus ring on a node is too faint: ${JSON.stringify(ring)}`);
  await page.locator('[data-edit-title]').focus();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  const seen = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const a = await page.evaluate(() => document.activeElement === document.body ? 'BODY' : (document.activeElement.getAttribute('data-edit-cancel') !== null ? 'cancel' : document.activeElement.tagName));
    seen.push(a);
    if (a === 'BODY') await fail(`tabbing the panel dropped focus to the page body: ${seen.join(' > ')}`);
    if (a === 'cancel') break;
  }
  if (seen[seen.length - 1] !== 'cancel') await fail(`Tab did not reach Cancel: ${seen.join(' > ')}`);
  await page.keyboard.press('Enter');
  await page.waitForFunction((t) => document.querySelector('[data-edit-title]')?.value === t, renamed, { timeout: 3000 });
  if (await page.evaluate(() => document.activeElement === document.body)) await fail('pressing Cancel from the keyboard dropped focus to the page body');
  await page.locator('[data-edit-panel] button[aria-label="Close panel"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-edit-panel]').waitFor({ state: 'detached', timeout: 3000 });
  if (await page.evaluate(() => document.activeElement === document.body)) await fail('closing the panel from the keyboard dropped focus to the page body');
  // a single click still opens the panel quickly
  await deselect();
  const ct = await titleCentre(gid);
  const tClick = Date.now();
  await page.mouse.click(ct.x, ct.y);
  await page.locator(`[data-edit-panel="${gid}"]`).waitFor({ timeout: 3000 });
  const openMs = Date.now() - tClick;
  if (openMs > 400) await fail(`a single click took ${openMs} ms to open the panel`);
  console.log(`ok polish (${secs()}s) - rename hint and text cursor on the title, focus ring ${ring.width}px, tab order never reaches the body, single click opens the panel in ${openMs} ms`);

  // the right-click menu on a concept
  await page.keyboard.press('Escape');
  await page.locator('[data-edit-panel]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  // lane 8: a right-click opens the menu and nothing else, so the concept's panel is opened by a click first
  await page.locator(nodeSel('concept-calculator')).click({ position: { x: 60, y: 20 } });
  await page.locator('[data-edit-panel="concept-calculator"]').waitFor({ timeout: 3000 });
  await page.waitForTimeout(500);
  await page.locator(nodeSel('concept-calculator')).click({ button: 'right', position: { x: 60, y: 20 } });
  const menu = page.locator('[data-context-menu="concept"]');
  await menu.waitFor({ timeout: 3000 });
  const labels = await page.locator('[data-context-menu] [data-menu-item]').allInnerTexts();
  if (labels.join('|') !== 'Add intent here|Rename|Edit details') await fail(`concept menu entries are ${labels.join('|')}`);
  if (!(await inWindow(page, '[data-context-menu]'))) await fail('the menu is not inside the window');
  await page.screenshot({ path: join(runDir, 'direct-2-concept-menu.jpg'), ...FRAME });
  // Esc closes the menu first, the panel after
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached', timeout: 3000 });
  if ((await page.locator('[data-edit-panel="concept-calculator"]').count()) !== 1) await fail('Esc closed the panel together with the menu');
  await page.keyboard.press('Escape');
  await page.locator('[data-edit-panel]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  if ((await page.locator('[data-edit-panel]').count()) !== 0) await fail('a second Esc did not close the panel');
  // a click elsewhere closes it
  await page.locator(nodeSel('concept-calculator')).click({ button: 'right', position: { x: 60, y: 20 } });
  await menu.waitFor({ timeout: 3000 });
  await page.mouse.click(30, 760);
  await menu.waitFor({ state: 'detached', timeout: 3000 });
  // its first entry opens the create form for that concept
  await page.locator(nodeSel('concept-calculator')).click({ button: 'right', position: { x: 60, y: 20 } });
  await menu.waitFor({ timeout: 3000 });
  await page.locator('[data-menu-item="add-intent"]').click();
  await page.locator('[data-create-form="concept-calculator"]').waitFor({ timeout: 3000 });
  await page.keyboard.press('Escape');
  await page.locator('[data-create-form]').waitFor({ state: 'detached', timeout: 3000 });
  console.log(`ok concept menu (${secs()}s) - ${labels.join(', ')}, inside the window, Esc and a click close it, "Add intent here" opens the create form`);

  // the click that chose "Add intent here" also reaches the node, and its panel opens about 300 ms later. let it arrive and close it,
  // or it opens over the corner menu below and covers it
  await page.locator('[data-edit-panel="concept-calculator"]').waitFor({ timeout: 3000 }).catch(() => {});
  await page.keyboard.press('Escape');
  await page.locator('[data-edit-panel]').waitFor({ state: 'detached', timeout: 3000 });
  await viewSettled(page);

  // the menu on empty canvas stays inside the window at the corner, and closes when the view moves
  await page.keyboard.press('Escape');
  await page.mouse.click(30, 700, { button: 'right' });
  const paneMenu = page.locator('[data-context-menu="pane"]');
  await paneMenu.waitFor({ timeout: 3000 });
  if (!(await inWindow(page, '[data-context-menu]'))) await fail('the empty-canvas menu is not inside the window');
  await page.mouse.move(600, 500);
  // zoom in: with the state bar the canvas is shorter and the fit already sits at the smallest zoom, where zooming out moves nothing
  await page.mouse.wheel(0, -120);
  await paneMenu.waitFor({ state: 'detached', timeout: 3000 });
  // the wheel move may still be running, and a view move closes any menu opened meanwhile
  await viewSettled(page);
  await page.mouse.click(1270, 740, { button: 'right' });
  await paneMenu.waitFor({ timeout: 3000 });
  if (!(await inWindow(page, '[data-context-menu]'))) await fail('the menu opened at the corner runs outside the window');
  await page.locator('[data-menu-item="fit-view"]').click();
  await paneMenu.waitFor({ state: 'detached', timeout: 3000 });
  // a double-click on empty canvas still zooms
  await viewSettled(page);
  const tPane = await viewTransform();
  await page.mouse.dblclick(30, 400);
  await page.waitForFunction((t) => document.querySelector('.react-flow__viewport').style.transform !== t, tPane, { timeout: 3000 }).catch(() => {});
  await viewSettled(page);
  if ((await viewTransform()) === tPane) await fail('a double-click on empty canvas no longer zooms');
  console.log(`ok pane menu (${secs()}s) - inside the window at the corner, closes on a wheel move, Fit view works, an empty-canvas double-click zooms`);

  // the whole flow from the keyboard: select, F2, type, Enter, menu key, arrows, Enter
  const kid = 'intent-has-no-checks';
  const kfile = join(w.work, rel);
  await page.locator(nodeSel(kid)).focus();
  await page.keyboard.press('Enter');
  await page.locator(`[data-edit-panel="${kid}"]`).waitFor({ timeout: 3000 });
  await page.keyboard.press('F2');
  await field.waitFor({ timeout: 3000 });
  await page.waitForFunction(() => document.activeElement === document.querySelector('[data-rename-field]'), null, { timeout: 3000 });
  const kTitle = 'Renamed from the keyboard';
  await page.keyboard.type(kTitle);
  await page.keyboard.press('Enter');
  await field.waitFor({ state: 'detached', timeout: 3000 });
  const kDeadline = Date.now() + 3000;
  while (!readFileSync(kfile, 'utf8').includes(`title: ${kTitle}`) && Date.now() < kDeadline) await page.waitForTimeout(100);
  if (!readFileSync(kfile, 'utf8').includes(`title: ${kTitle}`)) await fail('the keyboard rename did not write the title');
  await page.waitForTimeout(200);
  if ((await focusedId()) !== kid) await fail('focus did not return to the node after the keyboard rename');
  await page.keyboard.press('ContextMenu');
  await page.locator('[data-context-menu="intent"]').waitFor({ timeout: 3000 });
  await page.keyboard.press('ArrowDown');
  await page.screenshot({ path: join(runDir, 'direct-5-keyboard-menu.jpg'), ...FRAME });
  await page.keyboard.press('Enter');
  await page.locator('[data-context-menu]').waitFor({ state: 'detached', timeout: 3000 });
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-edit-title'), null, { timeout: 3000 });
  console.log(`ok keyboard (${secs()}s) - Enter selects, F2, type, Enter saved "${kTitle}", menu key, arrow, Enter put the cursor in the panel title`);

  // 7e lane 8, editing by wire: connect, disconnect, move, refuse, snap back, undo, all with real drags
  const wire = await wireChecks(page, w, nodeSel);
  console.log(`ok wires (${secs()}s) - ${wire}`);

  // 7c a write without the page token is refused
  const noToken = await page.evaluate(async () => (await fetch('/api/intents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ parent: 'concept-calculator', title: 'No token' }) })).status);
  if (noToken !== 403) await fail(`a write without the token got ${noToken}`);
  console.log(`ok token (${secs()}s) - a write without the token gets 403`);

  // 8 check 6: without --write the server refuses writes and the panel is read only
  const r = await startServer('read', false);
  const rpage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  rpage.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await rpage.goto(r.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await rpage.locator(nodeSel('intent-has-no-checks')).waitFor({ timeout: 30000 });
  await rpage.waitForTimeout(400);
  await rpage.locator(nodeSel('intent-has-no-checks')).click();
  await rpage.locator('[data-edit-panel] [data-read-only]').waitFor({ timeout: 5000 }).catch(() => {});
  const readOnlyText = await rpage.locator('[data-edit-panel] [data-read-only]').innerText().catch(() => '');
  if (!/--write/.test(readOnlyText)) await fail(`read-only panel note is "${readOnlyText}"`);
  // lane 6: read only is plain text, no input element of any kind (this replaces the older disabled check)
  const fieldCount = await rpage.locator('[data-edit-panel] input, [data-edit-panel] textarea, [data-edit-panel] select, [data-edit-title], [data-edit-body]').count();
  if (fieldCount !== 0) await fail(`${fieldCount} input elements in a read-only panel`);
  await rpage.locator('[data-read-title]').waitFor({ timeout: 3000 });
  const roTitle = await rpage.locator('[data-read-title]').innerText();
  const roBody = await rpage.locator('[data-read-body]').innerText();
  if (roTitle !== 'Nothing proves this one yet' || !roBody.includes('No anchors')) await fail(`read-only text is wrong: "${roTitle}" / "${roBody.slice(0, 40)}"`);
  if ((await rpage.locator('[data-edit-save], [data-edit-cancel]').count()) !== 0) await fail('save buttons shown on a read-only server');
  await rpage.locator(nodeSel('concept-calculator')).click({ position: { x: 60, y: 20 } });
  await rpage.waitForTimeout(300);
  if ((await rpage.locator('[data-add-intent]').count()) !== 0) await fail('add button shown on a read-only server');
  const rfile = join(r.work, rel);
  const rBefore = readFileSync(rfile, 'utf8');
  // lane 7: read only has no rename field, the menu shows its edit entries disabled with the reason, nothing is sent
  const sent = [];
  rpage.on('request', (q) => { if (q.method() !== 'GET') sent.push(`${q.method()} ${q.url()}`); });
  await rpage.locator(`${nodeSel('intent-has-no-checks')} [data-node-title]`).dblclick();
  await rpage.keyboard.press('F2');
  await rpage.waitForTimeout(400);
  if ((await rpage.locator('[data-rename-field]').count()) !== 0) await fail('a rename field opened on a read-only page');
  await rpage.locator(nodeSel('concept-calculator')).click({ button: 'right', position: { x: 60, y: 20 } });
  await rpage.locator('[data-context-menu="concept"]').waitFor({ timeout: 3000 });
  const roItems = await rpage.evaluate(() => [...document.querySelectorAll('[data-context-menu] [data-menu-item]')].map((b) => [b.getAttribute('data-menu-item'), b.getAttribute('aria-disabled')]));
  if (roItems.length !== 3 || roItems.some(([, d]) => d !== 'true')) await fail(`read-only menu entries: ${JSON.stringify(roItems)}`);
  const roReason = await rpage.locator('[data-menu-reason]').innerText();
  if (!/--write/.test(roReason)) await fail(`read-only menu reason is "${roReason}"`);
  await rpage.screenshot({ path: join(runDir, 'direct-3-read-only-menu.jpg'), ...FRAME });
  await rpage.locator('[data-menu-item="rename"]').click({ force: true });
  await rpage.locator('[data-menu-item="add-intent"]').click({ force: true }).catch(() => {});
  await rpage.waitForTimeout(300);
  if ((await rpage.locator('[data-rename-field], [data-create-form]').count()) !== 0) await fail('a disabled menu entry did something');
  await rpage.keyboard.press('Escape');
  // lane 8: in read only a pin does not connect, a dragged node goes back, the wire menu says why
  const roWire = await readOnlyWireChecks(rpage, r, nodeSel);
  if (sent.length !== 0) await fail(`read-only page sent ${sent.join(', ')}`);
  console.log(`ok read-only wires (${secs()}s) - ${roWire}`);
  console.log(`ok read-only menu (${secs()}s) - no rename field, ${roItems.length} edit entries disabled, "${roReason.slice(0, 40)}", nothing sent`);
  const node = await (await fetch(`${r.url}api/node?id=intent-has-no-checks`)).json();
  const status = await rpage.evaluate(async (hash) => {
    const save = await fetch('/api/node?id=intent-has-no-checks', { method: 'POST', headers: { 'content-type': 'application/json', 'x-intentgraph-token': 'guess' }, body: JSON.stringify({ title: 'Nope', hash }) });
    const make = await fetch('/api/intents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ parent: 'concept-calculator', title: 'Nope' }) });
    return [save.status, (await save.json()).error, make.status];
  }, node.hash);
  if (status[0] !== 403 || status[1] !== 'read-only' || status[2] !== 403) await fail(`read-only server answered ${status.join(' ')}`);
  if (readFileSync(rfile, 'utf8') !== rBefore || listing(r.work) !== listing(fixture)) await fail('read-only server wrote a file');
  await rpage.screenshot({ path: join(runDir, 'extra-read-only.jpg'), ...FRAME });
  console.log(`ok read only (${secs()}s) - "${readOnlyText}", title and body are text, no inputs, writes get 403 read-only`);

  if (errors.length) await fail(`${errors.length} console error(s): ${errors[0].slice(0, 160)}`);
  await browser.close();
  browser = null;

  // 9 frames and a clean stop
  const missing = FRAMES.filter((f) => !existsSync(join(runDir, f)));
  if (missing.length) await fail(`frames missing: ${missing.join(', ')}`);
  for (const s of servers) {
    if (!(await stopServer(s))) await fail(`${s.name} server did not exit within ${STOP_LIMIT_MS} ms of stop`);
    if (await portOpen(s.port)) await fail(`port ${s.port} still open after stop`);
  }
  // a killed process tree takes a moment to disappear on windows, so wait up to 5 s before calling it a leak
  let left = [...testPids].filter(alive);
  for (let i = 0; i < 25 && left.length; i++) {
    await new Promise((res) => setTimeout(res, 200));
    left = left.filter(alive);
  }
  if (left.length) await fail(`test processes left after 5 s: ${left.join(', ')}`);
  console.log(`ok stop (${secs()}s) - both servers exited, ports closed, ${testPids.size} test runs all gone`);
  await finish(true, `label ${labelMs} ms, new node ${nodeMs} ms, ${FRAMES.length} frames in ${runDir}`);
} catch (e) {
  if (livePage) await livePage.screenshot({ path: join(runDir, 'crash.jpg'), ...FRAME }).catch(() => {});
    console.log('  page at the crash:', await livePage.evaluate(() => JSON.stringify({ active: document.activeElement?.tagName + ':' + (document.activeElement?.getAttribute('data-rename-field') ?? ''), field: document.querySelector('[data-rename-field]')?.value ?? null })).catch(() => 'n/a'));
  const detail = String((e && e.message) || e).split('\n');
  for (const line of detail.slice(0, 20)) console.log(`  ${line}`);
  await fail(`crashed: ${detail[0]}`);
}
