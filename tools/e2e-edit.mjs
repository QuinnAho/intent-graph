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
  await fail(`crashed: ${String((e && e.message) || e).split('\n')[0]}`);
}
