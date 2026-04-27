// One-time DB initialization: backup-before-migrate (refuses to start if
// backup write fails), apply migrations, optionally load sqlite-vec, apply
// pragmas. Called once at skill bootstrap and once per test that wants a
// real DB.
//
// Pragmas applied (tech-spec §3.1, Pillar 2):
//   - journal_mode = WAL (multiple readers + one writer without blocking)
//   - synchronous = NORMAL (WAL durability is on a per-checkpoint basis;
//     NORMAL is the canonical pairing per https://sqlite.org/pragma.html#pragma_synchronous)
//   - mmap_size = 268435456 (256 MiB; lets readers skip the page cache for
//     hot pages on disks that support memory-mapped IO)
//   - temp_store = MEMORY (temp tables and indices live in RAM, not /tmp)
//   - foreign_keys = ON (off by default in SQLite; the schema's FK clauses
//     are inert without this)
//   - busy_timeout = 5000 (5s wait for a held write lock before SQLITE_BUSY)
//
// sqlite-vec: §4.10 vec_intent / vec_code virtual tables ship as DDL
// constants in ./schema.ts (createVecIntentTable / createVecCodeTable).
// They are only created when the sqlite-vec extension is registered first;
// per ADR-0015:28 phase-2 does not require the extension at runtime, so
// this helper tolerates a missing/unloadable extension and skips the
// virtual-table creation in that case.

import { existsSync, copyFileSync, statSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as sqliteVec from 'sqlite-vec';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { createClient, type DbClient, type CreateClientOptions } from './client.js';
import { VEC_EMBEDDING_DIM, VEC_INTENT_TABLE, VEC_CODE_TABLE } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_MIGRATIONS_FOLDER = resolve(__dirname, 'migrations');

export interface InitDatabaseOptions extends CreateClientOptions {
  /** Override the migrations directory. Defaults to ./migrations. */
  readonly migrationsFolder?: string;
  /**
   * Skip writing a backup before applying migrations. Default false.
   * Tests and in-memory databases pass `skipBackup: true`; production paths
   * must NOT.
   */
  readonly skipBackup?: boolean;
  /**
   * Skip the sqlite-vec extension load + vec0 virtual-table creation.
   * Default false. Set true in tests that don't exercise vector retrieval
   * or in environments where the extension's native binary isn't available.
   * The init helper also tolerates a load failure when this is left false
   * (the failure is logged but does not abort), per ADR-0015:28.
   */
  readonly skipVec?: boolean;
}

export interface InitDatabaseResult {
  /** The opened, migrated, pragma-applied client. */
  readonly client: DbClient;
  /** Whether the sqlite-vec extension successfully loaded. */
  readonly vecLoaded: boolean;
  /** Path of the backup file written, when one was written. */
  readonly backupPath: string | null;
}

/**
 * Backup-before-migrate. If the database file at `path` exists, copy it to
 * `<path>.bak.<timestamp>` before opening. If the copy fails, throw — the
 * skill MUST refuse to start rather than risk applying a migration to a DB
 * with no rollback file. Returns the backup path or null when no backup was
 * needed (fresh DB).
 */
function writeBackupOrThrow(path: string): string | null {
  if (path === ':memory:') return null;
  if (!existsSync(path)) return null;
  const stat = statSync(path);
  if (!stat.isFile()) return null;
  if (stat.size === 0) return null;

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = resolve(dirname(path), `${basename(path)}.bak.${ts}`);
  try {
    copyFileSync(path, backupPath);
    return backupPath;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[db-init] backup-before-migrate refused to start: cannot write ${backupPath} (${reason})`,
    );
  }
}

/**
 * Apply the WAL + companion pragmas required by tech-spec §3.1. Idempotent.
 * Each pragma is read-back after assignment so a silent SQLite reject (e.g.
 * journal_mode locked by another writer) surfaces as a thrown error rather
 * than a silently-disabled invariant.
 */
function applyPragmas(client: DbClient): void {
  const { raw } = client;
  raw.pragma('journal_mode = WAL');
  raw.pragma('synchronous = NORMAL');
  raw.pragma('mmap_size = 268435456');
  raw.pragma('temp_store = MEMORY');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');

  // Read back the values we care about and assert. journal_mode + foreign_keys
  // are the load-bearing ones; the rest are tunables. Memory databases cannot
  // enable WAL — for those we accept 'memory' as the journal_mode.
  const journalMode = String(raw.pragma('journal_mode', { simple: true }));
  const foreignKeys = Number(raw.pragma('foreign_keys', { simple: true }));
  if (journalMode !== 'wal' && journalMode !== 'memory') {
    throw new Error(`[db-init] expected journal_mode=wal or memory, got ${journalMode}`);
  }
  if (foreignKeys !== 1) {
    throw new Error(`[db-init] expected foreign_keys=1, got ${foreignKeys}`);
  }
}

/**
 * Best-effort load of the sqlite-vec extension and creation of the §4.10
 * vec0 virtual tables. Returns true on success. Returns false (and does NOT
 * throw) when the extension isn't available, per ADR-0015:28.
 */
function loadVecOrSkip(client: DbClient): boolean {
  try {
    sqliteVec.load(client.raw);
  } catch {
    // Extension binary missing, OS unsupported, etc. Phase-2 is not blocked
    // by this; vector retrieval lands in phase 5.
    return false;
  }
  try {
    client.raw.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS ${VEC_INTENT_TABLE} USING vec0(node_rowid INTEGER PRIMARY KEY, embedding FLOAT[${VEC_EMBEDDING_DIM}] DISTANCE_METRIC=cosine)`,
    );
    client.raw.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS ${VEC_CODE_TABLE} USING vec0(node_rowid INTEGER PRIMARY KEY, embedding FLOAT[${VEC_EMBEDDING_DIM}] DISTANCE_METRIC=cosine)`,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Open the SQLite database at `path`, run backup-before-migrate, apply
 * migrations + pragmas + (optionally) sqlite-vec. Returns the wrapped
 * client plus diagnostic flags. Throws on unrecoverable bootstrap failure
 * (backup write failure, migration failure, pragma assertion failure).
 *
 * `:memory:` opens an anonymous in-memory database; backups are skipped
 * automatically and tests typically pass `skipVec: true` to keep the
 * unit-test surface tight.
 */
export function initDatabase(path: string, opts: InitDatabaseOptions = {}): InitDatabaseResult {
  const backupPath = opts.skipBackup ? null : writeBackupOrThrow(path);

  const client = createClient(path, opts);
  try {
    applyPragmas(client);
    migrate(client.db, {
      migrationsFolder: opts.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER,
    });
    const vecLoaded = opts.skipVec ? false : loadVecOrSkip(client);
    return { client, vecLoaded, backupPath };
  } catch (err) {
    client.close();
    throw err;
  }
}
