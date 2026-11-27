// What the model is sent for a folder, and the folder's code hash. Pure apart from
// the file reads in readFolder. The hash comes from signatureOf, which ignores
// comments and formatting, so a comment-only edit never changes the cache key.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { listTopLevelSymbols, signatureOf } from '../parser/diff/signature-hash.js';
import { INFER_TUNING, type InferTuning } from './tuning.js';

export interface FileDigest {
  readonly path: string;
  /** Leading comment text, markers stripped, one line. Empty when none. */
  readonly comment: string;
  /** `Name: signature line` for each top-level symbol, cut at maxSymbolsPerFile. */
  readonly symbols: readonly string[];
  readonly moreSymbols: number;
  /** Anchor names the model may cite, `path#Name`. */
  readonly anchorNames: readonly string[];
  /** Normalised hash of the whole file. */
  readonly hash: string;
}

export interface FolderInput {
  readonly folder: string;
  readonly files: readonly FileDigest[];
  /** Same while the code is the same. Comment and format edits do not move it. */
  readonly codeHash: string;
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** An absolute or home path in a comment must never reach the prompt or the report. */
export function scrubPaths(s: string): string {
  return s
    .replace(/[A-Za-z]:[\\/][^\s'"`)]*/g, '<path>')
    .replace(/(?<![\w.])\/(?:home|Users|root)\/[^\s'"`)]*/g, '<path>');
}

/** The first comment block of a file, markers stripped and joined to one line, cut at maxChars. */
export function leadingComment(content: string, maxChars: number): string {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  let i = 0;
  while (i < lines.length && (lines[i]!.trim() === '' || lines[i]!.startsWith('#!') || /^(['"])use strict\1;?$/.test(lines[i]!.trim()))) i += 1;
  const out: string[] = [];
  const first = (lines[i] ?? '').trim();
  if (first.startsWith('/*')) {
    for (; i < lines.length; i += 1) {
      const l = lines[i]!;
      out.push(l.replace(/^\s*\/\*+/, '').replace(/\*+\/\s*$/, '').replace(/^\s*\*\s?/, ''));
      if (l.includes('*/')) break;
    }
  } else if (first.startsWith('//')) {
    for (; i < lines.length && lines[i]!.trim().startsWith('//'); i += 1) out.push(lines[i]!.trim().replace(/^\/\/+\s?/, ''));
  } else if (first.startsWith('#')) {
    for (; i < lines.length && lines[i]!.trim().startsWith('#'); i += 1) out.push(lines[i]!.trim().replace(/^#+\s?/, ''));
  }
  const text = scrubPaths(oneLine(out.join(' ')));
  return text.length > maxChars ? `${text.slice(0, maxChars - 3).trimEnd()}...` : text;
}

/** Declaration text from its first line up to the body, as one line. */
export function signatureLine(lines: readonly string[], startLine: number, maxChars: number): string {
  const parts: string[] = [];
  for (let n = startLine - 1; n < lines.length && n < startLine + 3; n += 1) {
    const l = lines[n] ?? '';
    parts.push(l);
    if (/[{;]\s*$/.test(l) || l.includes('=>')) break;
  }
  let text = scrubPaths(oneLine(parts.join(' ')));
  const brace = text.indexOf('{');
  if (brace > 0) text = text.slice(0, brace).trimEnd();
  return text.length > maxChars ? `${text.slice(0, maxChars - 3).trimEnd()}...` : text;
}

/** Digest of one file. A file that cannot be parsed is still listed, with no symbols. */
export function digestFile(path: string, content: string, tuning: Pick<InferTuning, 'maxCommentChars' | 'maxSignatureChars' | 'maxSymbolsPerFile' | 'maxParseBytes'> = INFER_TUNING): FileDigest {
  const comment = leadingComment(content, tuning.maxCommentChars);
  let hash: string;
  let all: { name: string; startLine: number }[] = [];
  try {
    hash = signatureOf(path, content, undefined, { maxBytes: tuning.maxParseBytes }).hash;
    all = listTopLevelSymbols(path, content, { maxBytes: tuning.maxParseBytes });
  } catch {
    hash = sha(content.replace(/\s+/g, ' ').trim());
  }
  const lines = content.split(/\r?\n/);
  const shown = all.slice(0, tuning.maxSymbolsPerFile);
  return {
    path,
    comment,
    symbols: shown.map((s) => `${s.name}: ${signatureLine(lines, s.startLine, tuning.maxSignatureChars)}`),
    moreSymbols: all.length - shown.length,
    anchorNames: all.map((s) => `${path}#${s.name}`),
    hash,
  };
}

export function folderCodeHash(files: readonly Pick<FileDigest, 'path' | 'hash'>[]): string {
  return sha([...files].sort((a, b) => a.path.localeCompare(b.path)).map((f) => `${f.path}\0${f.hash}`).join('\n'));
}

export function buildFolderInput(folder: string, files: readonly FileDigest[]): FolderInput {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  return { folder, files: sorted, codeHash: folderCodeHash(sorted) };
}

/** Read the named files (repo-relative) under root and digest them. Glue. */
export function readFolder(root: string, folder: string, paths: readonly string[], tuning: InferTuning = INFER_TUNING as InferTuning): FolderInput {
  const files = paths.map((p) => digestFile(p, readFileSync(join(root, p), 'utf8'), tuning));
  return buildFolderInput(folder, files);
}
