// Lifted from claudemap/skill/lib/file-walker.js @ claudemap@vendored.
// Adapted: TS strict; deny-list approach for directories / filenames / binary
// extensions and language-by-extension detection preserved; git-branch capture
// with a per-rootDir cache preserved. STRIPPED: the import/export regex
// extraction (claudemap's regex pass) — IntentGraph computes references and
// signatures via tree-sitter, not regex (Tech-Spec §3.2). The output type now
// lives in @intentgraph/shared/schemas/walker (no inline type).
// License: MIT (see /claudemap/LICENSE). See LIFT_LOG.md for the full lift record.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

import {
  type WalkerFileRecord,
  type WalkerLanguage,
  type WalkerSnapshot,
} from '@intentgraph/shared/schemas';

const branchCache = new Map<string, string>();

const SKIPPED_DIRECTORY_NAMES = new Set([
  '.git',
  '.next',
  '__pycache__',
  'build',
  'dist',
  'node_modules',
]);

const SKIPPED_FILE_NAMES = new Set([
  '.env',
  '.gitignore',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

const SKIPPED_EXTENSIONS = new Set([
  '.class',
  '.gif',
  '.gz',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.pyc',
  '.svg',
  '.tar',
  '.ttf',
  '.woff',
  '.woff2',
  '.zip',
]);

const LANGUAGE_BY_EXTENSION = new Map<string, WalkerLanguage>([
  ['.cjs', 'javascript'],
  ['.cts', 'typescript'],
  ['.js', 'javascript'],
  ['.jsx', 'javascript'],
  ['.mjs', 'javascript'],
  ['.mts', 'typescript'],
  ['.py', 'python'],
  ['.ts', 'typescript'],
  ['.tsx', 'typescript'],
]);

function normalizePath(filePath: string): string {
  return filePath.split(sep).join('/');
}

function shouldSkipDirectory(entryName: string): boolean {
  return entryName.startsWith('.') || SKIPPED_DIRECTORY_NAMES.has(entryName);
}

function shouldSkipFile(entryName: string, extension: string): boolean {
  if (entryName.startsWith('.') && !LANGUAGE_BY_EXTENSION.has(extension)) {
    return true;
  }
  if (SKIPPED_FILE_NAMES.has(entryName)) {
    return true;
  }
  if (SKIPPED_EXTENSIONS.has(extension)) {
    return true;
  }
  return !LANGUAGE_BY_EXTENSION.has(extension);
}

function readFileRecord(
  rootDir: string,
  absolutePath: string,
  name: string,
): WalkerFileRecord | null {
  const extension = extname(name).toLowerCase();
  if (shouldSkipFile(name, extension)) {
    return null;
  }

  let stats;
  try {
    stats = statSync(absolutePath);
  } catch {
    return null;
  }
  if (!stats.isFile()) {
    return null;
  }

  // We do not extract imports/exports here — that is tree-sitter's job. We
  // still do a single readFileSync to surface file size for the SQLite seed
  // step. If file size becomes a hot path, switch to stats.size and skip the
  // read entirely; we keep the read for now so the row also surfaces a
  // determinstic byte count even in the face of CRLF normalization weirdness.
  let content: string;
  try {
    content = readFileSync(absolutePath, 'utf8');
  } catch {
    return null;
  }

  const language = LANGUAGE_BY_EXTENSION.get(extension);
  if (!language) {
    return null;
  }

  const relativePath = normalizePath(relative(rootDir, absolutePath));
  const directoryName = normalizePath(relativePath.split('/').slice(0, -1).join('/'));

  return {
    path: relativePath,
    relativePath,
    name,
    directory: directoryName,
    language,
    mtimeMs: stats.mtimeMs,
    byteSize: Buffer.byteLength(content, 'utf8'),
  };
}

function walkDirectory(rootDir: string, absoluteDir: string, files: WalkerFileRecord[]): void {
  let entries;
  try {
    entries = readdirSync(absoluteDir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) continue;
      walkDirectory(rootDir, absolutePath, files);
      continue;
    }
    const record = readFileRecord(rootDir, absolutePath, entry.name);
    if (record) {
      files.push(record);
    }
  }
}

function resolveGitBranchLabel(rootDir: string): string {
  const cached = branchCache.get(rootDir);
  if (cached !== undefined) return cached;

  let branchLabel = 'workspace';
  try {
    const branchName = execFileSync('git', ['branch', '--show-current'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (branchName) {
      branchLabel = branchName;
    } else {
      const commitSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (commitSha) {
        branchLabel = `detached@${commitSha}`;
      }
    }
  } catch {
    branchLabel = 'workspace';
  }

  branchCache.set(rootDir, branchLabel);
  return branchLabel;
}

export function collectProjectSnapshot(rootDir: string): WalkerSnapshot {
  const resolvedRoot = resolve(rootDir);
  const files: WalkerFileRecord[] = [];

  walkDirectory(resolvedRoot, resolvedRoot, files);
  files.sort((left, right) => left.path.localeCompare(right.path));

  const segments = resolvedRoot.split(sep).filter(Boolean);
  const repoName = segments.length > 0 ? segments[segments.length - 1]! : resolvedRoot;

  return {
    repoRoot: resolvedRoot,
    repoName,
    branch: resolveGitBranchLabel(resolvedRoot),
    generatedAt: new Date().toISOString(),
    files,
    totalFiles: files.length,
  };
}

/** Test seam: clear the per-rootDir branch cache between runs. */
export function _resetBranchCacheForTests(): void {
  branchCache.clear();
}
