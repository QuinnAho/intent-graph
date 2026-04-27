// SQLite connection wrapper around better-sqlite3 + Drizzle. The skill
// holds exactly one writer at a time (better-sqlite3 is single-threaded);
// reader concurrency comes from WAL mode (multiple readers + one writer
// without blocking, per https://sqlite.org/wal.html). The wrapper exposes
// both the typed Drizzle handle (for application queries against the
// schema) and the raw better-sqlite3 Database (for pragma reads, raw
// migrations, sqlite-vec extension load). Acts as the storage port so a
// libSQL/LanceDB replacement could land here without touching call sites.
//
// Tech-spec §3.1, ADR-0002.

import Database, { type Database as BetterDatabase } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema.js';

export type IntentGraphDatabase = BetterSQLite3Database<typeof schema>;

export interface DbClient {
  /** Typed Drizzle handle bound to the IntentGraph schema. */
  readonly db: IntentGraphDatabase;
  /** Raw better-sqlite3 Database for pragma reads / extension load / raw SQL. */
  readonly raw: BetterDatabase;
  /** Closes the underlying connection. Idempotent. */
  close(): void;
}

export interface CreateClientOptions {
  /** When true, opens read-only. Default false. */
  readonly readonly?: boolean;
  /** When set, called for every prepared statement (logging hook). */
  readonly verbose?: (message?: unknown, ...args: unknown[]) => void;
}

/**
 * Open a new SQLite connection at `path` and wrap it in the IntentGraph
 * client. Does NOT apply pragmas, run migrations, or load sqlite-vec — that
 * is `initDatabase`'s job (see ./init.ts). Use this directly when you need a
 * raw connection (tests, the init helper itself).
 *
 * `:memory:` opens an anonymous in-memory database, which is the default for
 * unit tests. Production callers pass an absolute filesystem path.
 */
export function createClient(path: string, opts: CreateClientOptions = {}): DbClient {
  const raw = new Database(path, {
    readonly: opts.readonly ?? false,
    ...(opts.verbose ? { verbose: opts.verbose } : {}),
  });
  const db = drizzle(raw, { schema });

  let closed = false;
  return {
    db,
    raw,
    close(): void {
      if (closed) return;
      closed = true;
      raw.close();
    },
  };
}
