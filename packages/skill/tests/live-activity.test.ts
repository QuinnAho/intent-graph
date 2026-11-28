// which agent is working on what: the pure parsing of git's -z output and the run log,
// then the reader on a real temp git repo with a linked worktree, and the live server.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LiveActivitySchema, NodeActivitySchema } from '@intentgraph/shared/schemas';

import { build } from '../src/build-graph.js';
import { readSpecAnchors } from '../src/parser/spec-md/anchors.js';
import {
  activityMarks,
  activityState,
  codePathOf,
  gitPathToRoot,
  isToolPath,
  parseNameListZ,
  parseRunLog,
  parseStatusZ,
  parseWorktreeList,
  pathUnder,
  pickRunInfo,
} from '../src/live/activity-marks.js';
import { createActivityReader, type ActivitySnapshot } from '../src/live/activity-reader.js';
import { composeLiveGraph, type LiveGraph } from '../src/live/compose.js';
import { startLiveServer } from '../src/live/server.js';
import { LIVE_TUNING } from '../src/live/tuning.js';

const ODD = 'src/odd name & $(echo hi) \u00e9\u00df\u6f22.ts';

describe('parsing git -z output', () => {
  it('reads the porcelain worktree list, spaces, detached, bare and prunable included', () => {
    const out = [
      'worktree X:/work/my repo', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
      'worktree X:/work/my repo/.wt/lane a', 'HEAD 2222222222222222222222222222222222222222', 'branch refs/heads/lane-a', '',
      'worktree X:/work/my repo/.wt/det', 'HEAD 3333333333333333333333333333333333333333', 'detached', '',
      'worktree X:/work/bare.git', 'bare', '',
      'worktree X:/work/my repo/.wt/gone', 'HEAD 4444444444444444444444444444444444444444', 'branch refs/heads/gone', 'prunable gitdir file points to non-existent location', '',
    ].join('\0');
    const e = parseWorktreeList(out);
    expect(e.map((x) => x.path)).toEqual(['X:/work/my repo', 'X:/work/my repo/.wt/lane a', 'X:/work/my repo/.wt/det', 'X:/work/bare.git', 'X:/work/my repo/.wt/gone']);
    expect(e[1]).toMatchObject({ branch: 'lane-a', head: '2222222222222222222222222222222222222222', detached: false });
    expect(e[2]).toMatchObject({ branch: null, detached: true });
    expect(e[3]!.bare).toBe(true);
    expect(e[4]!.prunable).toBe(true);
    expect(parseWorktreeList('')).toEqual([]);
  });

  it('reads status lines with renames, odd names and folder entries', () => {
    const out = [' M src/a.ts', `?? ${ODD}`, 'R  src/new.ts', 'src/old.ts', 'D  src/gone.ts', '?? .wt/lane-a/', 'A  src/x.ts', ''].join('\0');
    expect(parseStatusZ(out)).toEqual(['src/a.ts', ODD, 'src/new.ts', 'src/old.ts', 'src/gone.ts', 'src/x.ts']);
    expect(parseStatusZ('')).toEqual([]);
  });

  it('splits a name list on NUL only', () => {
    expect(parseNameListZ(`src/a.ts\0${ODD}\0src/new\nline.ts\0`)).toEqual(['src/a.ts', ODD, 'src/new\nline.ts']);
  });
});

describe('paths from git to paths from the root', () => {
  it('keeps a plain path and drops one that leaves the root', () => {
    expect(gitPathToRoot('src/a.ts', '', false)).toBe('src/a.ts');
    expect(gitPathToRoot('../x.ts', '', false)).toBeNull();
    expect(gitPathToRoot('src/../../x.ts', '', false)).toBeNull();
    expect(gitPathToRoot('/etc/passwd', '', false)).toBeNull();
    expect(gitPathToRoot('C:/x.ts', '', false)).toBeNull();
    expect(gitPathToRoot('src\\b.ts', '', false)).toBe('src/b.ts');
  });

  it('strips the folder the root sits in, with or without case', () => {
    expect(gitPathToRoot('app/src/a.ts', 'app', false)).toBe('src/a.ts');
    expect(gitPathToRoot('other/a.ts', 'app', false)).toBeNull();
    expect(gitPathToRoot('App/src/a.ts', 'app', false)).toBeNull();
    expect(gitPathToRoot('App/src/a.ts', 'app', true)).toBe('src/a.ts');
  });

  it('leaves out tool state the server and its test runs write', () => {
    expect(isToolPath('.vite/vitest/results.json')).toBe(true);
    expect(isToolPath('app/.runs/x/log.jsonl')).toBe(true);
    expect(isToolPath('src/.vite.ts')).toBe(false);
    expect(isToolPath('src/a.ts')).toBe(false);
  });

  it('pathUnder compares folders, not string prefixes', () => {
    expect(pathUnder('D:\\r\\.wt\\a', 'D:/r', false)).toBe('.wt/a');
    expect(pathUnder('D:/rx/a', 'D:/r', false)).toBeNull();
    expect(pathUnder('d:/R/A', 'D:/r', true)).toBe('A');
    expect(pathUnder('D:/r/', 'D:/r', false)).toBe('');
  });
});

describe('active or idle, the run log, node ids', () => {
  it('is active inside the window and idle after it or with no change', () => {
    expect(activityState(1000, 1500, 600)).toBe('active');
    expect(activityState(1000, 1600, 600)).toBe('idle');
    expect(activityState(null, 1600, 600)).toBe('idle');
  });

  it('skips lines that are not json objects and flags a worktree outside the root', () => {
    const lines = parseRunLog(['not json', '{"broken":', '[1,2]', '{"worktree":"./.wt/a/","role":"engineer","task":"a\\nb"}', '{"worktree":"../x","role":"evil"}', '{"worktree":"C:\\\\abs","role":"evil"}', '{"lane":"b","role":5}'].join('\n'), 200);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({ worktree: '.wt/a', role: 'engineer', task: 'a b', outside: false });
    expect(lines[1]!.outside).toBe(true);
    expect(lines[2]!.outside).toBe(true);
    expect(lines[3]).toMatchObject({ lane: 'b', role: null });
  });

  it('picks the newest line for the worktree or the lane and ignores outside lines', () => {
    const lines = parseRunLog([
      '{"worktree":".wt/a","role":"old"}',
      '{"lane":"lane-a","role":"engineer","model":"opus","effort":"high","task":"build it"}',
      '{"worktree":"../.wt/a","lane":"lane-a","role":"evil"}',
      '{"worktree":".wt/other","role":"other"}',
    ].join('\n'), 200);
    expect(pickRunInfo(lines, '.wt/a', 'lane-a', false)).toEqual({ role: 'engineer', model: 'opus', effort: 'high', task: 'build it' });
    expect(pickRunInfo(lines, '.wt/A', null, true).role).toBe('old');
    expect(pickRunInfo(lines, '.wt/none', 'none', false)).toEqual({ role: null, model: null, effort: null, task: null });
  });

  it('clips long text', () => {
    expect(parseRunLog(JSON.stringify({ task: 'x'.repeat(500) }), 10)[0]!.task).toBe('x'.repeat(10));
  });

  it('finds the file of a module and a symbol, a # in the path included', () => {
    expect(codePathOf('code_module:src/a.ts')).toBe('src/a.ts');
    expect(codePathOf('code_symbol:src/a.ts#add#0123456789ab')).toBe('src/a.ts');
    expect(codePathOf('code_symbol:src/c#d.ts#add#0123')).toBe('src/c#d.ts');
    expect(codePathOf('intent-a')).toBeNull();
  });

  it('marks a changed file, a spec whose file changed, and a spec whose code or tests changed', () => {
    const nodes = [
      { id: 'code_module:src/a.ts', kind: 'code_module' },
      { id: 'code_symbol:src/a.ts#add#01', kind: 'code_symbol' },
      { id: 'code_module:src/b.ts', kind: 'code_module' },
      { id: 'intent-a', kind: 'intent' },
      { id: 'intent-b', kind: 'intent' },
      { id: 'intent-c', kind: 'intent' },
      { id: 'intent-d', kind: 'intent' },
    ];
    const edges = [
      { src: 'code_symbol:src/a.ts#add#01', dst: 'intent-a', kind: 'realizes' },
      { src: 'code_module:src/b.ts', dst: 'intent-b', kind: 'realizes' },
      { src: 'code_module:src/a.ts', dst: 'intent-d', kind: 'contains' },
    ];
    const specFiles = new Map([['intent-c', 'spec/intents/c.md']]);
    const testFiles = new Map([['intent-b', ['tests/b.test.ts']]]);
    const m = activityMarks({ nodes, edges, specFiles, testFiles }, [
      { lane: 'one', state: 'active', paths: ['SRC/A.ts', 'spec/intents/c.md'] },
      { lane: 'two', state: 'idle', paths: ['tests/b.test.ts'] },
      { lane: 'none', state: 'idle', paths: [] },
    ], true);
    expect(m.get('code_module:src/a.ts')).toEqual([{ lane: 'one', state: 'active', touch: 'changed' }]);
    expect(m.get('intent-a')).toEqual([{ lane: 'one', state: 'active', touch: 'code_changed' }]);
    expect(m.get('intent-c')).toEqual([{ lane: 'one', state: 'active', touch: 'changed' }]);
    expect(m.get('intent-b')).toEqual([{ lane: 'two', state: 'idle', touch: 'code_changed' }]);
    expect(m.has('intent-d')).toBe(false);
    expect(m.has('code_symbol:src/a.ts#add#01')).toBe(false);
    expect(m.has('code_module:src/b.ts')).toBe(false);
    // case matters when the platform says so
    expect(activityMarks({ nodes, edges, specFiles, testFiles }, [{ lane: 'one', state: 'active', paths: ['SRC/A.ts'] }], false).size).toBe(0);
  });
});

// a tiny workspace: two intents realized by two files, one verified by a test that only a lane adds
const ID = ['-c', 'user.name=ig-test', '-c', 'user.email=ig-test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
const git = (cwd: string, ...args: string[]): string => execFileSync('git', [...ID, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const intent = (id: string, realized: string, verified?: string): string =>
  `---\nid: ${id}\ntitle: ${id}\nparent: concept-c\nconfidence: asserted\ntarget_kinds:\n  - function\nrealized_by:\n  - ${realized}\n${verified ? `verified_by:\n  - ${verified}\n` : ''}---\n\n# ${id}\n`;

function makeRepo(): string {
  const d = mkdtempSync(join(tmpdir(), 'ig-activity-'));
  mkdirSync(join(d, 'spec', 'concepts'), { recursive: true });
  mkdirSync(join(d, 'spec', 'intents'), { recursive: true });
  mkdirSync(join(d, 'src'), { recursive: true });
  writeFileSync(join(d, 'spec', 'concepts', 'c.md'), '---\nid: concept-c\ntitle: C\nparent: null\nconfidence: asserted\nregeneration_scope: cooperative\n---\n');
  writeFileSync(join(d, 'spec', 'intents', 'a.md'), intent('intent-a', 'src/a.ts#add'));
  writeFileSync(join(d, 'spec', 'intents', 'b.md'), intent('intent-b', 'src/b.ts'));
  writeFileSync(join(d, 'spec', 'intents', 'c.md'), intent('intent-c', 'src/c.ts', 'tests/c.test.ts'));
  writeFileSync(join(d, 'src', 'a.ts'), 'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
  writeFileSync(join(d, 'src', 'b.ts'), 'export const b = 1;\n');
  writeFileSync(join(d, 'src', 'c.ts'), 'export const c = 1;\n');
  git(d, '-c', 'init.defaultBranch=main', 'init', '-q');
  git(d, 'add', '-A');
  git(d, 'commit', '-q', '-m', 'start');
  return d;
}

const TUNING = { ...LIVE_TUNING };
const graphOf = (root: string, snap: ActivitySnapshot): LiveGraph =>
  composeLiveGraph(build({ repoRoot: root }), readSpecAnchors(join(root, 'spec')), null, root, null, null, { agents: snap.agents, lanes: snap.lanes, caseless: process.platform === 'win32' });
const activityOf = (g: LiveGraph, id: string): unknown => g.nodes.find((n) => n.id === id)?.activity;

describe('the reader on a temp git repo', () => {
  let repo = '';
  let lane = '';
  beforeEach(() => {
    repo = makeRepo();
    lane = join(repo, '.wt', 'lane-a');
    git(repo, 'worktree', 'add', '-q', '-b', 'lane-a', lane);
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('a worktree that changes a realizing file gives one entry, and marks that file and its intent only', async () => {
    writeFileSync(join(lane, 'src', 'a.ts'), 'export function add(a: number, b: number): number {\n  return b + a;\n}\n');
    const snap = await createActivityReader(repo, TUNING).read(Date.now());
    expect(snap.reason).toBeNull();
    expect(snap.agents).toHaveLength(1);
    expect(LiveActivitySchema.parse(snap.agents[0])).toMatchObject({ lane: 'lane-a', worktree: '.wt/lane-a', state: 'active', files: 1, uncommitted: 1, cut: false, role: null });
    expect(snap.lanes).toEqual([{ lane: 'lane-a', state: 'active', paths: ['src/a.ts'] }]);
    const g = graphOf(repo, snap);
    expect(g.agents).toEqual(snap.agents);
    expect(activityOf(g, 'code_module:src/a.ts')).toEqual([{ lane: 'lane-a', state: 'active', touch: 'changed' }]);
    expect(activityOf(g, 'intent-a')).toEqual([{ lane: 'lane-a', state: 'active', touch: 'code_changed' }]);
    for (const n of g.nodes) if (n.activity) for (const a of n.activity) NodeActivitySchema.parse(a);
    const marked = g.nodes.filter((n) => n.activity).map((n) => n.id).sort();
    expect(marked).toEqual(['code_module:src/a.ts', 'intent-a']);
  });

  it('is still listed after a commit, then gone once the worktree is removed', async () => {
    writeFileSync(join(lane, 'src', 'b.ts'), 'export const b = 2;\n');
    git(lane, 'commit', '-q', '-am', 'lane work');
    const reader = createActivityReader(repo, TUNING);
    const after = await reader.read(Date.now());
    expect(after.agents).toHaveLength(1);
    expect(after.agents[0]).toMatchObject({ lane: 'lane-a', files: 1, uncommitted: 0, state: 'active' });
    expect(after.agents[0]!.changed_at).not.toBeNull();
    expect(activityOf(graphOf(repo, after), 'intent-b')).toEqual([{ lane: 'lane-a', state: 'active', touch: 'code_changed' }]);
    // past the window the same work reads idle
    expect((await reader.read(Date.now() + TUNING.activeWindowMs + 1000)).agents[0]!.state).toBe('idle');
    git(repo, 'worktree', 'remove', '--force', lane);
    const gone = await reader.read(Date.now());
    expect(gone.agents).toEqual([]);
    expect(gone.reason).toBeNull();
  });

  it('lists odd file names exactly, and a new test file marks the intent it verifies', async () => {
    mkdirSync(join(lane, 'tests'), { recursive: true });
    writeFileSync(join(lane, ODD), 'export const odd = 1;\n');
    writeFileSync(join(lane, 'tests', 'c.test.ts'), 'it("c", () => {});\n');
    const snap = await createActivityReader(repo, TUNING).read(Date.now());
    expect(snap.lanes[0]!.paths).toEqual([ODD, 'tests/c.test.ts'].sort());
    expect(activityOf(graphOf(repo, snap), 'intent-c')).toEqual([{ lane: 'lane-a', state: 'active', touch: 'code_changed' }]);
  });

  it('gives the served checkout its own entry for uncommitted work, and never counts the worktree folder', async () => {
    const clean = await createActivityReader(repo, TUNING).read(Date.now());
    expect(clean.agents.map((a) => a.worktree)).toEqual(['.wt/lane-a']);
    writeFileSync(join(repo, 'spec', 'intents', 'b.md'), intent('intent-b', 'src/b.ts') + '\nmore\n');
    // the linked test runs leave vitest's cache in the root, that is not work
    mkdirSync(join(repo, '.vite', 'vitest'), { recursive: true });
    writeFileSync(join(repo, '.vite', 'vitest', 'results.json'), '{}');
    const snap = await createActivityReader(repo, TUNING).read(Date.now());
    const own = snap.agents.find((a) => a.worktree === null);
    expect(own).toMatchObject({ lane: 'main', files: 1, uncommitted: 1 });
    expect(snap.lanes.find((l) => l.lane === 'main')!.paths).toEqual(['spec/intents/b.md']);
    expect(activityOf(graphOf(repo, snap), 'intent-b')).toEqual([{ lane: 'main', state: 'active', touch: 'changed' }]);
  });

  it('takes role, model and task from the run log, and ignores a broken log and outside paths', async () => {
    writeFileSync(join(lane, 'src', 'a.ts'), 'export const changed = 1;\n');
    mkdirSync(join(repo, '.runs', 'r1'), { recursive: true });
    mkdirSync(join(repo, '.runs', 'r2'), { recursive: true });
    writeFileSync(join(repo, '.runs', 'r1', 'log.jsonl'), [
      JSON.stringify({ lane: 'lane-a', worktree: '.wt/lane-a', role: 'engineer', model: 'opus', effort: 'high', task: 'build the reader' }),
      JSON.stringify({ worktree: '../lane-a', lane: 'lane-a', role: 'outside', model: 'x', task: 'x' }),
      JSON.stringify({ worktree: join(repo, '.wt', 'lane-a'), role: 'absolute' }),
    ].join('\n'));
    writeFileSync(join(repo, '.runs', 'r2', 'log.jsonl'), '{not json\n\u0000\u0001garbage\n[]\n');
    const snap = await createActivityReader(repo, TUNING).read(Date.now());
    expect(snap.reason).toBeNull();
    expect(snap.agents[0]).toMatchObject({ role: 'engineer', model: 'opus', effort: 'high', task: 'build the reader' });
  });

  it('writes nothing: the index files keep their bytes and times', async () => {
    // a file whose time moved but whose bytes did not is what makes a plain status refresh the index
    const later = new Date(Date.now() + 5000);
    utimesSync(join(repo, 'src', 'b.ts'), later, later);
    utimesSync(join(lane, 'src', 'b.ts'), later, later);
    const indexes = [join(repo, '.git', 'index'), join(repo, '.git', 'worktrees', 'lane-a', 'index')];
    const before = indexes.map((f) => `${statSync(f).mtimeMs}:${readFileSync(f).toString('base64')}`);
    const reader = createActivityReader(repo, TUNING);
    await reader.read(Date.now());
    await reader.read(Date.now());
    expect(indexes.map((f) => `${statSync(f).mtimeMs}:${readFileSync(f).toString('base64')}`)).toEqual(before);
  });

  it('cuts a lane past the file limit and says so', async () => {
    for (let i = 0; i < 5; i++) writeFileSync(join(lane, 'src', `n${i}.ts`), `export const n${i} = ${i};\n`);
    const snap = await createActivityReader(repo, { ...TUNING, maxLaneFiles: 3 }).read(Date.now());
    expect(snap.agents[0]).toMatchObject({ files: 5, cut: true });
    expect(snap.lanes[0]!.paths).toHaveLength(3);
  });
});

describe('a folder that is not a git repo', () => {
  it('gives no activity, a reason for the log, and no error', async () => {
    const d = mkdtempSync(join(tmpdir(), 'ig-activity-nogit-'));
    try {
      const snap = await createActivityReader(d, TUNING).read(Date.now());
      expect(snap.agents).toEqual([]);
      expect(snap.lanes).toEqual([]);
      expect(snap.reason).toBe('not a git repo');
      expect(composeLiveGraph(build({ repoRoot: d }), new Map(), null, d, null, null, { agents: [], lanes: [], caseless: false }).problems).toEqual([]);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

describe('the live server', () => {
  let repo = '';
  const lines: string[] = [];
  let server: Awaited<ReturnType<typeof startLiveServer>>;
  beforeAll(async () => {
    repo = makeRepo();
    git(repo, 'worktree', 'add', '-q', '-b', 'lane-a', join(repo, '.wt', 'lane-a'));
    server = await startLiveServer({ root: repo, port: 0, webDir: null, tuning: { ...LIVE_TUNING, activityPollMs: 100 }, log: (l) => lines.push(l) });
  });
  afterAll(async () => {
    await server.close();
    rmSync(repo, { recursive: true, force: true });
  });

  it('puts agents and node activity in /graph.json, with no absolute path, and republishes only on change', async () => {
    const fetchGraph = async (): Promise<{ text: string; g: LiveGraph }> => {
      const text = await (await fetch(`${server.url}graph.json`)).text();
      return { text, g: JSON.parse(text) as LiveGraph };
    };
    const until = async (ok: (g: LiveGraph) => boolean): Promise<LiveGraph> => {
      const end = Date.now() + 10_000;
      for (;;) {
        const { g } = await fetchGraph();
        if (ok(g) || Date.now() > end) return g;
        await new Promise((r) => setTimeout(r, 100));
      }
    };
    const first = await until((g) => (g.agents ?? []).length === 1);
    expect(first.agents![0]).toMatchObject({ lane: 'lane-a', files: 0, state: 'idle' });
    writeFileSync(join(repo, '.wt', 'lane-a', 'src', 'a.ts'), 'export const a = 2;\n');
    const g = await until((x) => x.nodes.some((n) => n.id === 'intent-a' && n.activity));
    expect(g.nodes.find((n) => n.id === 'intent-a')!.activity).toEqual([{ lane: 'lane-a', state: 'active', touch: 'code_changed' }]);
    const v = server.version();
    await new Promise((r) => setTimeout(r, 600));
    expect(server.version()).toBe(v);
    // what this reader adds: the agents list and every node's activity. code node bodies carry a file uri from the static build, that is older than this lane.
    const { g: last } = await fetchGraph();
    const text = JSON.stringify([last.agents, last.nodes.map((n) => n.activity ?? null)]);
    const slash = repo.replace(/\\/g, '/');
    expect([text.includes(repo), text.includes(slash), text.includes(JSON.stringify(repo).slice(1, -1)), /[a-z]:[\\/]/i.test(text)]).toEqual([false, false, false, false]);
    expect(lines.filter((l) => l.startsWith('activity v')).length).toBeGreaterThanOrEqual(2);
  });
});
