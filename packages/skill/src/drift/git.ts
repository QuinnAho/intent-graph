// Glue: read commits, changed files, diffs and file contents from git. Read-only.

import { execFileSync } from 'node:child_process';

import type { FileChange } from './link.js';
import { parseUnifiedDiff } from './unified-diff.js';

// git's well-known empty tree (sha-1 repos)
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.quotepath=off', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
}

export interface CommitInfo {
  readonly sha: string;
  readonly parent: string | null;
  readonly subject: string;
}

/** Commits in `a..b`, oldest first. Each is compared with its first parent. */
export function listCommits(root: string, range: string, paths: readonly string[] = []): CommitInfo[] {
  const args = ['log', '--reverse', '--no-merges', '--format=%H%x00%P%x00%s', range];
  if (paths.length) args.push('--', ...paths);
  const out = git(root, args).trim();
  if (!out) return [];
  return out.split('\n').map((line) => {
    const [sha = '', parents = '', subject = ''] = line.split('\u0000');
    return { sha, parent: parents.split(' ')[0] || null, subject };
  });
}

function show(root: string, rev: string, path: string): string | null {
  try {
    return git(root, ['show', `${rev}:${path}`]);
  } catch {
    return null;
  }
}

/**
 * Changed files of one commit against its first parent. Renames are split into
 * delete + add. `wantContent` decides which files get contents and hunks.
 */
export function readCommitChanges(
  root: string,
  commit: CommitInfo,
  wantContent: (path: string) => boolean,
  contextLines: number,
): FileChange[] {
  // the root commit has no parent, so diff against git's empty tree
  const base = commit.parent ?? EMPTY_TREE;
  const raw = git(root, ['diff', '--no-renames', '--name-status', '-z', base, commit.sha]);
  const parts = raw.split('\u0000').filter((p) => p.length > 0);
  const listed: { status: string; path: string }[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) listed.push({ status: (parts[i] ?? '').charAt(0), path: parts[i + 1] ?? '' });

  const wanted = listed.filter((f) => wantContent(f.path)).map((f) => f.path);
  const hunksByPath = wanted.length
    ? parseUnifiedDiff(git(root, ['diff', '--no-renames', '--no-color', '--no-ext-diff', `-U${contextLines}`, base, commit.sha, '--', ...wanted]))
    : new Map();
  const numstat = wanted.length ? git(root, ['diff', '--no-renames', '--numstat', base, commit.sha, '--', ...wanted]) : '';
  const binary = new Set(numstat.split('\n').filter((l) => l.startsWith('-\t-\t')).map((l) => l.split('\t')[2]));

  return listed.map(({ status, path }) => {
    if (!wantContent(path)) return { path, status, before: null, after: null, binary: false, hunks: [] };
    const isBin = binary.has(path);
    return {
      path,
      status,
      before: status === 'A' || isBin || !commit.parent ? null : show(root, commit.parent, path),
      after: status === 'D' || isBin ? null : show(root, commit.sha, path),
      binary: isBin,
      hunks: hunksByPath.get(path) ?? [],
    };
  });
}
