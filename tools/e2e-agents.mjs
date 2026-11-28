#!/usr/bin/env node
// proves "which agent is working on what" end to end, server only. usage: node tools/e2e-agents.mjs
// copies the fixture to a temp git repo, starts the live server on it, then makes a worktree and edits
// a file in it while the server runs: /graph.json must list the lane with the run log's words and mark
// the edited file and the intent it realizes, follow a commit, and drop the lane once the worktree is
// removed. a spawn spy proves the server started only read-only git calls and the linked test runs,
// and the worktree files and git indexes must keep their bytes while the server polls.
// prints one line per step, then PASS|FAIL e2e-agents (time) - note. exit 0 only on pass.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const t0 = Date.now();
const secs = (from = t0) => Math.round((Date.now() - from) / 100) / 10;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = join(root, '.runs', 'e2e-agents', stamp);
mkdirSync(runDir, { recursive: true });

// the lane must show on the graph within this, the poll is 5 seconds
const SHOW_LIMIT_MS = 15000;
const STOP_LIMIT_MS = 10000;
// long enough for the server to poll twice while the script only watches
const QUIET_MS = 11000;
const LANE = 'lane-e2e';
const WT = `.wt/${LANE}`;
// only these git commands may come from the server: the reader's four, and the file walker's branch label
const READER_GIT = [['worktree', 'list'], ['status'], ['diff', '--name-only'], ['log', '-1']];
const WALKER_GIT = [['branch', '--show-current'], ['rev-parse', '--short', 'HEAD']];

const fixture = join(root, 'tests', 'fixtures', 'live-workspace');
const cli = join(root, 'packages', 'skill', 'src', 'live', 'cli.ts');
let base = null;
let work = null;
let srv = null;

function kill() {
  if (!srv || srv.proc.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(srv.proc.pid), '/t', '/f'], { stdio: 'ignore' });
  else srv.proc.kill('SIGKILL');
}
function finish(ok, note) {
  kill();
  if (base) rmSync(base, { recursive: true, force: true });
  console.log(`${ok ? 'PASS' : 'FAIL'} e2e-agents (${secs()}s) - ${note}`);
  process.exit(ok ? 0 : 1);
}
const fail = (note) => finish(false, note);
process.on('SIGINT', () => fail('interrupted'));

// the script's own git calls, with an identity on each commit so no global config is needed
const ID = ['-c', 'user.name=ig-e2e', '-c', 'user.email=ig-e2e@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
const git = (cwd, ...a) => execFileSync('git', [...ID, ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

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

async function startServer(preload) {
  const port = await freePort();
  const log = createWriteStream(join(runDir, 'server.log'));
  const proc = spawn(process.execPath, ['--import', pathToFileURL(preload).href, '--import', 'tsx', cli, '--root', work, '--port', String(port), '--no-web'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  const s = { port, proc, lines: [] };
  let buf = '';
  proc.stdout.on('data', (d) => {
    log.write(d);
    buf += d.toString();
    const parts = buf.split(/\r?\n/);
    buf = parts.pop();
    for (const l of parts) s.lines.push(l);
  });
  proc.stderr.on('data', (d) => log.write(d));
  const end = Date.now() + 60000;
  while (Date.now() < end && proc.exitCode === null && !s.lines.some((l) => l.startsWith('live: '))) await new Promise((r) => setTimeout(r, 100));
  const live = s.lines.find((l) => l.startsWith('live: '));
  if (!live) fail(`server did not start, see ${join(runDir, 'server.log')}`);
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

const graph = async () => (await fetch(`${srv.url}graph.json`)).json();
// wait for the graph to pass a check, return the last graph and how long it took
async function waitGraph(check) {
  const from = Date.now();
  let g = await graph();
  while (!check(g) && Date.now() - from < SHOW_LIMIT_MS) { await new Promise((r) => setTimeout(r, 200)); g = await graph(); }
  return { g, ok: check(g), ms: Date.now() - from };
}
// node id order in the graph is not this script's business, so the marks are sorted by id
const marked = (g) => Object.fromEntries(g.nodes.filter((n) => n.activity).map((n) => [n.id, n.activity]).sort((x, y) => (x[0] < y[0] ? -1 : 1)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// every byte of a worktree outside .git, and the git indexes, so a write by the server shows
function bytes(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === '.wt' || e.name === '.runs' || e.name === 'node_modules') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[relative(dir, p).split('\\').join('/')] = readFileSync(p).toString('base64');
    }
  };
  walk(dir);
  return out;
}
function indexes() {
  const files = [join(work, '.git', 'index'), join(work, '.git', 'worktrees', LANE, 'index')].filter((f) => existsSync(f));
  return files.map((f) => `${relative(work, f)}:${statSync(f).mtimeMs}:${readFileSync(f).toString('base64')}`);
}

try {
  base = mkdtempSync(join(tmpdir(), 'intentgraph-agents-'));
  work = join(base, 'repo');
  cpSync(fixture, work, { recursive: true });
  // the served checkout stays clean: worktrees, run logs and the test cache are not work
  writeFileSync(join(work, '.gitignore'), '.wt/\n.runs/\nnode_modules/\n');
  git(work, '-c', 'init.defaultBranch=main', 'init', '-q');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'start');

  // a preload that logs every process the server starts
  const spawnLog = join(base, 'ig-spawns.log');
  const preload = join(base, 'ig-spy.mjs');
  writeFileSync(preload, [
    "import cp from 'node:child_process';",
    "import { syncBuiltinESMExports } from 'node:module';",
    "import { appendFileSync } from 'node:fs';",
    `const log = ${JSON.stringify(spawnLog)};`,
    "for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {",
    '  const real = cp[name];',
    "  cp[name] = function (...a) { appendFileSync(log, JSON.stringify([name, ...a.filter((x) => typeof x === 'string' || Array.isArray(x))]) + '\\n'); return real.apply(this, a); };",
    '}',
    'syncBuiltinESMExports();',
  ].join('\n'));
  writeFileSync(spawnLog, '');

  srv = await startServer(preload);
  console.log(`ok server (${secs()}s) - ${srv.url} on a temp git repo`);

  // 1 no worktree: an empty agents list, no mark
  const empty = await waitGraph((g) => Array.isArray(g.agents));
  if (!empty.ok || empty.g.agents.length !== 0 || Object.keys(marked(empty.g)).length) fail(`before any worktree: ${JSON.stringify(empty.g.agents)}`);
  console.log(`ok empty (${secs()}s) - agents [] and no node marked`);

  // 2 a worktree, a run log line naming it, and an edit while the server runs
  git(work, 'worktree', 'add', '-q', '-b', LANE, join(work, WT));
  mkdirSync(join(work, '.runs', 'run-1'), { recursive: true });
  writeFileSync(join(work, '.runs', 'run-1', 'log.jsonl'), [
    'not json at all',
    JSON.stringify({ lane: LANE, worktree: WT, role: 'engineer', model: 'opus', effort: 'high', task: 'make add faster' }),
    JSON.stringify({ worktree: `../${WT}`, role: 'outside', model: 'x', task: 'must be ignored' }),
  ].join('\n') + '\n');
  writeFileSync(join(work, WT, 'src', 'math.ts'), 'export function add(a: number, b: number): number {\n  return b + a;\n}\n');
  const want = marked({ nodes: [{ id: 'code_module:src/math.ts', activity: [{ lane: LANE, state: 'active', touch: 'changed' }] }, { id: 'intent-adds-numbers', activity: [{ lane: LANE, state: 'active', touch: 'code_changed' }] }] });
  const lane = (g) => (g.agents ?? []).find((a) => a.lane === LANE);
  const shown = await waitGraph((g) => lane(g)?.uncommitted === 1 && same(marked(g), want));
  if (!shown.ok) fail(`the edit did not show within ${SHOW_LIMIT_MS} ms: agents ${JSON.stringify(shown.g.agents)} marks ${JSON.stringify(marked(shown.g))}`);
  const a = lane(shown.g);
  if (shown.g.agents.length !== 1) fail(`more than the one lane: ${JSON.stringify(shown.g.agents)}, served checkout status: ${JSON.stringify(git(work, 'status', '--porcelain', '--untracked-files=all'))}`);
  if (a.worktree !== WT || a.state !== 'active' || a.files !== 1 || a.role !== 'engineer' || a.model !== 'opus' || a.effort !== 'high' || a.task !== 'make add faster' || a.cut) fail(`lane entry is wrong: ${JSON.stringify(a)}`);
  writeFileSync(join(runDir, 'graph-edit.json'), JSON.stringify({ agents: shown.g.agents, marks: marked(shown.g) }, null, 2));
  console.log(`ok edit (${secs()}s) - shown in ${shown.ms} ms: ${JSON.stringify(a)}, marks on ${Object.keys(marked(shown.g)).join(', ')}`);

  // 3 the server writes nothing while it polls: worktree bytes and both indexes stay as they are
  const before = { served: bytes(work), lane: bytes(join(work, WT)), idx: indexes() };
  await new Promise((r) => setTimeout(r, QUIET_MS));
  if (!same(bytes(work), before.served) || !same(bytes(join(work, WT)), before.lane)) fail('a worktree file changed while the server polled');
  if (!same(indexes(), before.idx)) fail('a git index changed while the server polled');
  console.log(`ok no writes (${secs()}s) - ${Object.keys(before.served).length + Object.keys(before.lane).length} files and ${before.idx.length} indexes unchanged over ${QUIET_MS / 1000}s of polls`);

  // 4 a commit in the lane: still listed, nothing uncommitted, same marks
  git(join(work, WT), 'commit', '-q', '-am', 'add the other way round');
  const committed = await waitGraph((g) => lane(g)?.uncommitted === 0 && lane(g)?.files === 1 && same(marked(g), want));
  if (!committed.ok) fail(`after the commit: agents ${JSON.stringify(committed.g.agents)} marks ${JSON.stringify(marked(committed.g))}`);
  console.log(`ok commit (${secs()}s) - followed in ${committed.ms} ms, files 1, uncommitted 0, changed_at ${lane(committed.g).changed_at}`);

  // 5 the worktree removed: the lane and its marks are gone
  git(work, 'worktree', 'remove', '--force', join(work, WT));
  const gone = await waitGraph((g) => (g.agents ?? []).length === 0 && Object.keys(marked(g)).length === 0);
  if (!gone.ok) fail(`after the removal: agents ${JSON.stringify(gone.g.agents)} marks ${JSON.stringify(marked(gone.g))}`);
  console.log(`ok removed (${secs()}s) - gone in ${gone.ms} ms`);

  // 6 no absolute path in what this lane adds, and no problem from it
  const added = JSON.stringify([shown.g.agents, committed.g.agents, marked(shown.g)]);
  if (/[a-z]:[\\/]|\/(tmp|var|home|Users)\//i.test(added) || added.includes(work.split('\\').join('/'))) fail(`an absolute path in agents or activity: ${added.slice(0, 200)}`);
  if (gone.g.problems.some((p) => /git|worktree|activity/i.test(p.message))) fail('activity put a problem in the list');

  if (!(await stopServer(srv))) fail('server did not stop cleanly');

  // 7 the spawn spy: read-only git from the reader with --no-optional-locks, the walker's branch label, the linked test runs
  const calls = readFileSync(spawnLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const starts = (args, want) => want.every((w, i) => args[i] === w);
  const counts = { reader: 0, walker: 0, tests: 0, kill: 0 };
  for (const [name, file, args = []] of calls) {
    const text = `${name} ${file} ${[].concat(args).join(' ')}`;
    if (/claude|infer|drift/i.test(text)) fail(`the server started a model process: ${text}`);
    if (file === 'git' && name === 'execFile') {
      const sub = args.slice(args.indexOf('core.quotepath=off') + 1);
      if (args[0] !== '--no-optional-locks' || !READER_GIT.some((w) => starts(sub, w))) fail(`a git call that is not a read: ${text}`);
      counts.reader += 1;
    } else if (file === 'git' && name === 'execFileSync' && WALKER_GIT.some((w) => starts(args, w))) counts.walker += 1;
    else if (name === 'spawn' && file === process.execPath && args.some((x) => /vitest/.test(x))) counts.tests += 1;
    else if (name === 'spawnSync' && file === 'taskkill') counts.kill += 1;
    else fail(`the server started something else: ${text}`);
  }
  if (counts.reader === 0) fail('the spy saw no git call from the reader');
  console.log(`ok spawn spy (${secs()}s) - ${counts.reader} read-only git calls, ${counts.walker} walker branch label, ${counts.tests} linked test runs, ${counts.kill} test kills, nothing else`);
  const logged = srv.lines.filter((l) => l.startsWith('activity'));
  writeFileSync(join(runDir, 'activity-lines.log'), logged.join('\n') + '\n');
  finish(true, `lane shown in ${shown.ms} ms, commit followed, removal followed, no writes, ${counts.reader} read-only git calls, logs in ${relative(root, runDir).split('\\').join('/')}`);
} catch (e) {
  fail(`crashed: ${String((e && e.message) || e).split('\n')[0]}`);
}
