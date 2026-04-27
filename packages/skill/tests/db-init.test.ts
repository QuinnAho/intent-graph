// Tests for the db init helper. Three contracts from p2-t03's task notes:
//   1. Pragma values are readable post-init (i.e. they actually applied).
//   2. The sqlite-vec virtual table is createable when the extension loads.
//   3. Backup-before-migrate refuses to start if the backup write fails.
//
// Tech-spec §3.1; ADR-0002, ADR-0015.

import { mkdtempSync, rmSync, chmodSync, statSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';

import { initDatabase } from '../src/db/init.js';

describe('initDatabase', () => {
  const tmpRoots: string[] = [];
  afterEach(() => {
    for (const root of tmpRoots) {
      rmSync(root, { recursive: true, force: true });
    }
    tmpRoots.length = 0;
  });

  function mkTempDb(): { path: string; root: string } {
    const root = mkdtempSync(join(tmpdir(), 'ig-db-init-'));
    tmpRoots.push(root);
    return { path: join(root, 'graph.db'), root };
  }

  it('applies WAL + companion pragmas; values are readable post-init', () => {
    const { path } = mkTempDb();
    const result = initDatabase(path, { skipVec: true, skipBackup: true });
    try {
      const journalMode = result.client.raw.pragma('journal_mode', { simple: true });
      const synchronous = result.client.raw.pragma('synchronous', { simple: true });
      const mmapSize = result.client.raw.pragma('mmap_size', { simple: true });
      const tempStore = result.client.raw.pragma('temp_store', { simple: true });
      const foreignKeys = result.client.raw.pragma('foreign_keys', { simple: true });
      const busyTimeout = result.client.raw.pragma('busy_timeout', { simple: true });

      expect(journalMode).toBe('wal');
      // synchronous: NORMAL = 1
      expect(Number(synchronous)).toBe(1);
      expect(Number(mmapSize)).toBe(268435456);
      // temp_store: MEMORY = 2
      expect(Number(tempStore)).toBe(2);
      expect(Number(foreignKeys)).toBe(1);
      expect(Number(busyTimeout)).toBe(5000);
    } finally {
      result.client.close();
    }
  });

  it('creates the §4 schema tables and the task_active view', () => {
    const { path } = mkTempDb();
    const result = initDatabase(path, { skipVec: true, skipBackup: true });
    try {
      const tables = result.client.raw
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name`)
        .all()
        .map((r) => (r as { name: string }).name);
      expect(tables).toEqual([
        'edge',
        'event_log',
        'fence_seq',
        'lease',
        'node',
        'obligation',
        'retrieval',
        'row_audit',
        'trace_event',
      ]);

      const views = result.client.raw
        .prepare(`SELECT name FROM sqlite_master WHERE type='view' ORDER BY name`)
        .all()
        .map((r) => (r as { name: string }).name);
      expect(views).toEqual(['task_active']);

      // fence_seq is seeded with next=1 per the §4.4 INSERT in the migration.
      const fenceRow = result.client.raw.prepare(`SELECT next FROM fence_seq`).get() as
        | { next: number }
        | undefined;
      expect(fenceRow?.next).toBe(1);
    } finally {
      result.client.close();
    }
  });

  it('creates the sqlite-vec virtual tables when the extension loads', () => {
    const { path } = mkTempDb();
    const result = initDatabase(path, { skipVec: false, skipBackup: true });
    try {
      // sqlite-vec ships prebuilt binaries for common platforms but not all.
      // The contract is conditional: when vecLoaded is true, the virtual
      // tables MUST exist; when false, this test passes vacuously and
      // vector retrieval is unavailable until phase 5 wires a fallback.
      if (!result.vecLoaded) {
        return;
      }
      // sqlite-vec creates internal companion tables (vec_<name>_chunks,
      // vec_<name>_info, vec_<name>_rowids, vec_<name>_vector_chunks00)
      // alongside the user-named virtual table. Assert only the two we
      // created, not the companions.
      const virtualTables = result.client.raw
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('vec_intent', 'vec_code') ORDER BY name`)
        .all()
        .map((r) => (r as { name: string }).name);
      expect(virtualTables).toEqual(['vec_code', 'vec_intent']);
    } finally {
      result.client.close();
    }
  });

  it('refuses to start when backup-before-migrate cannot write the backup file', () => {
    // Skip on Windows where chmod-based read-only enforcement is unreliable.
    // The contract still holds; this test asserts it on Unix.
    if (platform() === 'win32') {
      return;
    }
    const { path, root } = mkTempDb();
    // Seed an existing DB so backup is required.
    const seed = initDatabase(path, { skipVec: true, skipBackup: true });
    seed.client.close();
    expect(statSync(path).size).toBeGreaterThan(0);

    // Make the directory non-writable so copyFileSync fails.
    chmodSync(root, 0o555);
    try {
      expect(() => initDatabase(path, { skipVec: true })).toThrowError(
        /backup-before-migrate refused to start/,
      );
    } finally {
      chmodSync(root, 0o755);
    }
  });

  it('honors skipBackup=true and applies migrations on a pre-existing db without writing a backup', () => {
    const { path } = mkTempDb();
    const first = initDatabase(path, { skipVec: true, skipBackup: true });
    first.client.close();

    const second = initDatabase(path, { skipVec: true, skipBackup: true });
    try {
      expect(second.backupPath).toBeNull();
      // The migration tracking table is present and shows the single
      // migration we landed; idempotent across re-opens.
      const journalEntries = second.client.raw
        .prepare(`SELECT COUNT(*) as n FROM __drizzle_migrations`)
        .get() as { n: number };
      expect(journalEntries.n).toBe(1);
    } finally {
      second.client.close();
    }
  });
});
