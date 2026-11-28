// pure parts of the activity reader: git's -z output, paths from git to paths from the
// root, the run log, active or idle, and which nodes a lane touches. no io here.

import type { ActivityState, NodeActivity, NodeTouch } from '@intentgraph/shared/schemas';

export interface WorktreeEntry {
  /** the folder as git printed it */
  readonly path: string;
  readonly head: string | null;
  /** short branch name, null when detached or bare */
  readonly branch: string | null;
  readonly bare: boolean;
  readonly detached: boolean;
  /** git says the folder is gone */
  readonly prunable: boolean;
}

/** `git worktree list --porcelain -z`: attributes end with NUL, a record ends with an empty attribute */
export function parseWorktreeList(out: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let cur: { path: string; head: string | null; branch: string | null; bare: boolean; detached: boolean; prunable: boolean } | null = null;
  const flush = (): void => {
    if (cur) entries.push(cur);
    cur = null;
  };
  for (const field of out.split('\0')) {
    if (field === '') {
      flush();
      continue;
    }
    const space = field.indexOf(' ');
    const key = space < 0 ? field : field.slice(0, space);
    const value = space < 0 ? '' : field.slice(space + 1);
    if (key === 'worktree') {
      flush();
      cur = { path: value, head: null, branch: null, bare: false, detached: false, prunable: false };
      continue;
    }
    if (!cur) continue;
    if (key === 'HEAD') cur.head = /^[0-9a-f]{7,64}$/i.test(value) ? value : null;
    else if (key === 'branch') cur.branch = value.startsWith('refs/heads/') ? value.slice('refs/heads/'.length) : value || null;
    else if (key === 'bare') cur.bare = true;
    else if (key === 'detached') cur.detached = true;
    else if (key === 'prunable') cur.prunable = true;
  }
  flush();
  return entries.filter((e) => e.path !== '');
}

/** `git status --porcelain=v1 -z`: "XY path", and for a rename or copy one more field with the old path */
export function parseStatusZ(out: string): string[] {
  const fields = out.split('\0');
  const paths: string[] = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]!;
    if (f.length < 4 || f[2] !== ' ') continue;
    const xy = f.slice(0, 2);
    paths.push(f.slice(3));
    if (/[RC]/.test(xy) && i + 1 < fields.length) {
      i += 1;
      if (fields[i]) paths.push(fields[i]!);
    }
  }
  // a folder entry (a nested repo or worktree) is not a file
  return paths.filter((p) => p !== '' && !p.endsWith('/'));
}

/** a NUL separated name list, such as `git diff --name-only -z` */
export function parseNameListZ(out: string): string[] {
  return out.split('\0').filter((p) => p !== '');
}

const slashes = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '');
const fold = (p: string, caseless: boolean): string => (caseless ? p.toLowerCase() : p);

/** the rest of child below parent, '' when they are the same folder, null when child is not under parent */
export function pathUnder(child: string, parent: string, caseless: boolean): string | null {
  const c = slashes(child);
  const p = slashes(parent);
  if (fold(c, caseless) === fold(p, caseless)) return '';
  const head = p.endsWith('/') ? p : `${p}/`;
  return fold(c, caseless).startsWith(fold(head, caseless)) ? c.slice(head.length) : null;
}

/**
 * a path git printed, from the top of a worktree, as a path from the served root.
 * rootInTop is the served root below the served worktree's top, '' when they are the same.
 * null for a path that leaves the root.
 */
export function gitPathToRoot(p: string, rootInTop: string, caseless: boolean): string | null {
  const s = slashes(p);
  if (s === '' || s.startsWith('/') || /^[a-z]:/i.test(s)) return null;
  const parts = s.split('/');
  if (parts.some((x) => x === '..' || x === '.' || x === '')) return null;
  if (rootInTop === '') return s;
  const rest = pathUnder(s, rootInTop, caseless);
  return rest === null || rest === '' ? null : rest;
}

// what the server and its test runs write for themselves is not anyone's work
const TOOL_DIRS = new Set(['.vite', '.runs', '.intentgraph', '.wt']);

/** true for a path inside a folder of tool state, such as vitest's .vite cache from the linked test runs */
export function isToolPath(p: string): boolean {
  return p.split('/').slice(0, -1).some((s) => TOOL_DIRS.has(s));
}

export function activityState(changedAtMs: number | null, nowMs: number, windowMs: number): ActivityState {
  return changedAtMs !== null && nowMs - changedAtMs < windowMs ? 'active' : 'idle';
}

/** the fields of a run log line this reader cares about, text only */
export interface RunLogLine {
  readonly lane: string | null;
  readonly worktree: string | null;
  /** the line named a worktree that is absolute or leaves the root */
  readonly outside: boolean;
  readonly role: string | null;
  readonly model: string | null;
  readonly effort: string | null;
  readonly task: string | null;
}

export interface RunInfo {
  readonly role: string | null;
  readonly model: string | null;
  readonly effort: string | null;
  readonly task: string | null;
}

export const NO_RUN_INFO: RunInfo = { role: null, model: null, effort: null, task: null };

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  // control characters become spaces, a log line is free text
  const t = Array.from(v, (c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('').replace(/ +/g, ' ').trim();
  return t === '' ? null : t.slice(0, max);
}

/** one object per line. a line that is not a json object is skipped, never an error. */
export function parseRunLog(content: string, textMax: number): RunLogLine[] {
  const lines: RunLogLine[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l.startsWith('{')) continue;
    let v: unknown;
    try {
      v = JSON.parse(l);
    } catch {
      continue;
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    let worktree = text(o['worktree'], 4096);
    let outside = false;
    if (worktree !== null) {
      const w = slashes(worktree).replace(/^(\.\/)+/, '');
      outside = w === '' || w.startsWith('/') || /^[a-z]:/i.test(w) || w.split('/').includes('..');
      worktree = outside ? null : w;
    }
    lines.push({ lane: text(o['lane'], 4096), worktree, outside, role: text(o['role'], textMax), model: text(o['model'], textMax), effort: text(o['effort'], textMax), task: text(o['task'], textMax) });
  }
  return lines;
}

/** the newest line, lines given oldest first, whose worktree is this one or whose lane is its branch */
export function pickRunInfo(lines: ReadonlyArray<RunLogLine>, worktree: string | null, branch: string | null, caseless: boolean): RunInfo {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!;
    if (l.outside) continue;
    const byPath = worktree !== null && l.worktree !== null && fold(l.worktree, caseless) === fold(worktree, caseless);
    const byLane = branch !== null && l.lane === branch;
    if (byPath || byLane) return { role: l.role, model: l.model, effort: l.effort, task: l.task };
  }
  return NO_RUN_INFO;
}

/** the file a code node stands for, null for any other node */
export function codePathOf(id: string): string | null {
  if (id.startsWith('code_module:')) return id.slice('code_module:'.length);
  if (!id.startsWith('code_symbol:')) return null;
  // code_symbol:<path>#<name>#<hash>, a name never holds '#', a path might
  const rest = id.slice('code_symbol:'.length);
  const h = rest.lastIndexOf('#');
  const n = h > 0 ? rest.lastIndexOf('#', h - 1) : -1;
  return n > 0 ? rest.slice(0, n) : null;
}

export interface LaneFiles {
  readonly lane: string;
  readonly state: ActivityState;
  /** paths from the root */
  readonly paths: ReadonlyArray<string>;
}

export interface MarkInput {
  readonly nodes: ReadonlyArray<{ readonly id: string; readonly kind: string }>;
  readonly edges: ReadonlyArray<{ readonly src: string; readonly dst: string; readonly kind: string }>;
  /** a spec node's own file, from the root */
  readonly specFiles: ReadonlyMap<string, string>;
  /** a spec node's verified_by test files, from the root */
  readonly testFiles: ReadonlyMap<string, ReadonlyArray<string>>;
}

const SPEC_KINDS = new Set(['intent', 'constraint', 'decision', 'concept']);
const CODE_EDGES = new Set(['realizes', 'verifies']);

/** which lanes touch which node: a changed file node, a spec whose file changed, a spec whose code or tests changed */
export function activityMarks(input: MarkInput, lanes: ReadonlyArray<LaneFiles>, caseless: boolean): Map<string, NodeActivity[]> {
  const out = new Map<string, NodeActivity[]>();
  const add = (id: string, lane: LaneFiles, touch: NodeTouch): void => {
    const list = out.get(id) ?? [];
    if (!list.some((a) => a.lane === lane.lane)) list.push({ lane: lane.lane, state: lane.state, touch });
    out.set(id, list);
  };
  const codeIn = new Map<string, string[]>();
  for (const e of input.edges) {
    if (!CODE_EDGES.has(e.kind)) continue;
    const p = codePathOf(e.src);
    if (p === null) continue;
    codeIn.set(e.dst, [...(codeIn.get(e.dst) ?? []), p]);
  }
  for (const lane of lanes) {
    if (lane.paths.length === 0) continue;
    const changed = new Set(lane.paths.map((p) => fold(p, caseless)));
    const hit = (p: string | undefined): boolean => p !== undefined && changed.has(fold(p, caseless));
    for (const n of input.nodes) {
      if (n.kind === 'code_module') {
        if (hit(codePathOf(n.id) ?? undefined)) add(n.id, lane, 'changed');
        continue;
      }
      if (!SPEC_KINDS.has(n.kind)) continue;
      if (hit(input.specFiles.get(n.id))) add(n.id, lane, 'changed');
      else if ((codeIn.get(n.id) ?? []).some(hit) || (input.testFiles.get(n.id) ?? []).some(hit)) add(n.id, lane, 'code_changed');
    }
  }
  return out;
}
