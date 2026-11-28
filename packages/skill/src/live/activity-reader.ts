// reads the work in progress from git worktrees and the run log. only read commands,
// each with fixed arguments, no shell, --no-optional-locks so the index is never refreshed,
// and a time limit. any failure means no activity, never a thrown error.

import { execFile } from 'node:child_process';
import { lstat, open, readdir, realpath, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { LiveActivity } from '@intentgraph/shared/schemas';

import {
  NO_RUN_INFO,
  activityState,
  gitPathToRoot,
  isToolPath,
  parseNameListZ,
  parseRunLog,
  parseStatusZ,
  parseWorktreeList,
  pathUnder,
  pickRunInfo,
  type LaneFiles,
  type RunLogLine,
  type WorktreeEntry,
} from './activity-marks.js';

export interface ActivityTuning {
  readonly activeWindowMs: number;
  readonly gitTimeoutMs: number;
  readonly maxWorktrees: number;
  readonly maxLaneFiles: number;
  readonly runLogMaxBytes: number;
  readonly runLogTextMax: number;
}

export interface ActivitySnapshot {
  readonly agents: LiveActivity[];
  /** the changed paths of each lane, for the marks on nodes */
  readonly lanes: LaneFiles[];
  /** why something is missing, for the log only. null when every call worked. */
  readonly reason: string | null;
}

export const NO_ACTIVITY: ActivitySnapshot = { agents: [], lanes: [], reason: null };

/** the part of a snapshot that decides whether the graph is published again */
export const activityKey = (s: ActivitySnapshot): string => JSON.stringify([s.agents, s.lanes]);

type GitResult = { readonly ok: true; readonly out: string } | { readonly ok: false; readonly reason: string };

// a repo's own variables must not send the call to another repo
const DROPPED_ENV = new Set(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_NAMESPACE']);
const GIT_PREFIX = ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.quotepath=off'];
const MAX_BUFFER = 32 * 1024 * 1024;

function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!DROPPED_ENV.has(k.toUpperCase())) env[k] = v;
  env['GIT_OPTIONAL_LOCKS'] = '0';
  env['GIT_TERMINAL_PROMPT'] = '0';
  return env;
}

export function runGit(cwd: string, args: ReadonlyArray<string>, timeoutMs: number): Promise<GitResult> {
  return new Promise((done) => {
    try {
      execFile('git', [...GIT_PREFIX, ...args], { cwd, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: MAX_BUFFER, windowsHide: true, encoding: 'utf8', env: gitEnv() }, (err, stdout, stderr) => {
        if (!err) return done({ ok: true, out: stdout });
        const e = err as NodeJS.ErrnoException & { killed?: boolean; signal?: string | null };
        if (e.code === 'ENOENT') return done({ ok: false, reason: 'git not found' });
        if (e.killed || e.signal) return done({ ok: false, reason: 'git timed out' });
        if (/not a git repository/i.test(stderr)) return done({ ok: false, reason: 'not a git repo' });
        done({ ok: false, reason: `git ${args[0] ?? ''} failed: ${stderr.trim().split(/\r?\n/)[0] ?? ''}`.trim() });
      });
    } catch (err) {
      done({ ok: false, reason: `git could not start: ${(err as Error).message}` });
    }
  });
}

async function realOrResolved(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return resolve(p);
  }
}

/** newest file time of the paths that still exist, ms since epoch */
async function newestMtime(top: string, paths: ReadonlyArray<string>): Promise<number | null> {
  let newest: number | null = null;
  for (const p of paths) {
    try {
      const m = (await stat(join(top, p))).mtimeMs;
      if (newest === null || m > newest) newest = m;
    } catch {
      // a deleted file has no time, the commit time or another file speaks for it
    }
  }
  return newest;
}

interface CachedLog {
  readonly key: string;
  readonly mtimeMs: number;
  readonly lines: RunLogLine[];
}

/** a reader keeps the parsed run logs between ticks and reads one again only when it changed */
export function createActivityReader(rootIn: string, tuning: ActivityTuning, caseless = process.platform === 'win32'): { read(nowMs: number): Promise<ActivitySnapshot> } {
  const logs = new Map<string, CachedLog>();

  async function readTail(file: string, size: number): Promise<string> {
    const h = await open(file, 'r');
    try {
      const len = Math.min(size, tuning.runLogMaxBytes);
      const buf = Buffer.alloc(len);
      await h.read(buf, 0, len, size - len);
      const t = buf.toString('utf8');
      // a cut first line is not a whole line
      return len < size ? t.slice(t.indexOf('\n') + 1) : t;
    } finally {
      await h.close();
    }
  }

  /** every line of every <root>/.runs/<run>/log.jsonl, oldest file first. only files inside <root>/.runs. */
  async function runLogLines(root: string): Promise<RunLogLine[]> {
    const runs = join(root, '.runs');
    let runsReal: string;
    let dirs: string[];
    try {
      runsReal = await realpath(runs);
      dirs = (await readdir(runs, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      logs.clear();
      return [];
    }
    const seen = new Set<string>();
    const found: CachedLog[] = [];
    for (const d of dirs) {
      const file = join(runs, d, 'log.jsonl');
      try {
        const l = await lstat(file);
        if (!l.isFile()) continue;
        if (pathUnder(await realpath(file), runsReal, caseless) === null) continue;
        seen.add(file);
        const key = `${l.mtimeMs}:${l.size}`;
        let c = logs.get(file);
        if (!c || c.key !== key) {
          c = { key, mtimeMs: l.mtimeMs, lines: parseRunLog(await readTail(file, l.size), tuning.runLogTextMax) };
          logs.set(file, c);
        }
        found.push(c);
      } catch {
        // no log in this run, or it went away
      }
    }
    for (const k of [...logs.keys()]) if (!seen.has(k)) logs.delete(k);
    return found.sort((a, b) => a.mtimeMs - b.mtimeMs).flatMap((c) => c.lines);
  }

  async function read(nowMs: number): Promise<ActivitySnapshot> {
    const root = await realOrResolved(rootIn);
    const t = tuning.gitTimeoutMs;
    const list = await runGit(root, ['worktree', 'list', '--porcelain', '-z'], t);
    if (!list.ok) return { ...NO_ACTIVITY, reason: list.reason };
    const entries: Array<WorktreeEntry & { readonly real: string }> = [];
    for (const e of parseWorktreeList(list.out)) if (!e.bare) entries.push({ ...e, real: await realOrResolved(e.path) });
    // the served checkout is the worktree the root sits in, the deepest one when they nest
    let served: (typeof entries)[number] | null = null;
    let rootInTop = '';
    for (const e of entries) {
      const rest = pathUnder(root, e.real, caseless);
      if (rest !== null && (served === null || e.real.length > served.real.length)) {
        served = e;
        rootInTop = rest;
      }
    }
    if (!served) return { ...NO_ACTIVITY, reason: 'the root is in no worktree git lists' };
    const servedEntry = served;
    // every other worktree folder inside the root, as a path from the root
    const others = entries
      .filter((e) => e !== servedEntry && !e.prunable)
      .map((e) => ({ e, rel: pathUnder(e.real, root, caseless) }))
      .filter((x): x is { e: (typeof entries)[number]; rel: string } => x.rel !== null && x.rel !== '')
      .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
    const reasons: string[] = [];
    if (others.length > tuning.maxWorktrees) reasons.push(`${others.length} worktrees, the first ${tuning.maxWorktrees} are listed`);
    const runLines = await runLogLines(root);
    const agents: LiveActivity[] = [];
    const lanes: LaneFiles[] = [];
    const laneOf = (e: WorktreeEntry): string => e.branch ?? (e.head ? `detached ${e.head.slice(0, 7)}` : 'detached');
    const inOther = (p: string): boolean => others.some((o) => pathUnder(p, o.rel, caseless) !== null);

    const addLane = async (e: WorktreeEntry & { readonly real: string }, rel: string | null, committedRaw: string[], uncommittedRaw: string[], commitMs: number | null): Promise<void> => {
      const toRoot = (ps: string[]): string[] => ps.map((p) => gitPathToRoot(p, rootInTop, caseless)).filter((p): p is string => p !== null && !isToolPath(p) && !(rel === null && inOther(p)));
      const uncommitted = [...new Set(toRoot(uncommittedRaw))];
      const all = [...new Set([...toRoot(committedRaw), ...uncommitted])].sort();
      if (rel === null && all.length === 0) return;
      const cut = all.length > tuning.maxLaneFiles;
      const paths = cut ? all.slice(0, tuning.maxLaneFiles) : all;
      const fileMs = await newestMtime(e.real, uncommittedRaw.slice(0, tuning.maxLaneFiles));
      const changedMs = fileMs === null ? commitMs : commitMs === null ? fileMs : Math.max(fileMs, commitMs);
      const state = activityState(changedMs, nowMs, tuning.activeWindowMs);
      const info = runLines.length ? pickRunInfo(runLines, rel, e.branch, caseless) : NO_RUN_INFO;
      const lane = laneOf(e);
      agents.push({ lane, worktree: rel, state, changed_at: changedMs === null ? null : new Date(changedMs).toISOString(), files: all.length, uncommitted: uncommitted.length, cut, ...info });
      lanes.push({ lane, state, paths });
    };

    const STATUS = ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'];
    for (const { e, rel } of others.slice(0, tuning.maxWorktrees)) {
      let committed: string[] = [];
      let commitMs: number | null = null;
      if (servedEntry.head && e.head && e.head !== servedEntry.head) {
        const diff = await runGit(e.real, ['diff', '--name-only', '-z', '--no-renames', '--no-ext-diff', `${servedEntry.head}...HEAD`], t);
        if (!diff.ok) {
          reasons.push(`${diff.reason} in ${rel}`);
          continue;
        }
        committed = parseNameListZ(diff.out);
        if (committed.length > 0) {
          const when = await runGit(e.real, ['log', '-1', '--format=%ct', 'HEAD'], t);
          const secs = when.ok ? Number(when.out.trim()) : NaN;
          if (Number.isFinite(secs)) commitMs = secs * 1000;
        }
      }
      const status = await runGit(e.real, STATUS, t);
      if (!status.ok) {
        reasons.push(`${status.reason} in ${rel}`);
        continue;
      }
      await addLane(e, rel, committed, parseStatusZ(status.out), commitMs);
    }
    const own = await runGit(servedEntry.real, STATUS, t);
    if (own.ok) await addLane(servedEntry, null, [], parseStatusZ(own.out), null);
    else reasons.push(`${own.reason} in the served checkout`);
    return { agents, lanes, reason: reasons.length ? reasons.join(', ') : null };
  }

  return {
    read: async (nowMs) => {
      try {
        return await read(nowMs);
      } catch (err) {
        return { ...NO_ACTIVITY, reason: `activity read failed: ${(err as Error).message}` };
      }
    },
  };
}
