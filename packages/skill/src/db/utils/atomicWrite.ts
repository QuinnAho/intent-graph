// Lifted from claudemap/skill/lib/runtime-paths.js (writeJsonFileAtomic +
// readJsonFile) @ claudemap@vendored.
// Adapted: TS strict, generic-typed read/write, dependency-free.
// License: MIT (see /claudemap/LICENSE). See LIFT_LOG.md for the full lift record.
//
// CONSTRAINT: This module is for SNAPSHOT ARTIFACTS ONLY — recovery dumps,
// graph.json exports, and similar one-shot files written next to the SQLite
// database. The live IntentGraph store is SQLite + WAL (Tech-Spec §3.1, ADR
// 0002). Reading or writing primary graph state through this helper is a
// hard rule violation; use the Drizzle client and the event_log instead.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface AtomicWriteOptions {
  /** Pretty-print indent. Default 2. */
  indent?: number;
}

/**
 * Atomically write a JSON snapshot. Writes to a `<file>.tmp-<pid>-<ts>` first,
 * then renames into place. The rename is the atomic step on POSIX and on Windows
 * NTFS for same-volume writes; do not use this across volumes.
 */
export function writeJsonFileAtomic<T>(filePath: string, data: T, options: AtomicWriteOptions = {}): void {
  const indent = options.indent ?? 2;
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, JSON.stringify(data, null, indent), 'utf8');
  renameSync(tempPath, filePath);
}

export interface ReadJsonOptions<T> {
  /** Returned when the file is missing or unreadable. */
  fallback?: () => T;
}

/**
 * Read a JSON snapshot. Returns `null` if the file is missing and no fallback
 * was provided; returns the fallback's result if one was supplied. Throws on
 * malformed JSON — callers that want soft failure should wrap the call.
 */
export function readJsonFile<T>(filePath: string, options: ReadJsonOptions<T> = {}): T | null {
  if (!existsSync(filePath)) {
    return options.fallback ? options.fallback() : null;
  }
  const text = readFileSync(filePath, 'utf8');
  return JSON.parse(text) as T;
}
