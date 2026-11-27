# ADR 0002 — Relational graph store as substrate

## Status

Accepted.

## Context

We need a graph store that is local-first, transactional with embeddings, replayable, and operable from a Node subprocess in an IDE. Dedicated graph DBs (KuzuDB, Cozo, libSQL) carried bus-factor or strategic risk in late 2025. SQLite in WAL mode with native bindings is the canonical IDE-plugin shape.

## Decision

- `better-sqlite3` (sync API, 1 writer / N readers) with WAL pragmas applied on open.
- `sqlite-vec` for embeddings — single file, single backup, single transaction with the graph rows.
- `Drizzle ORM` for schema-as-TS plus timestamped migration files. `Atlas` runs in CI as a destructive-change linter. No `down.sql`; rollback is restore-from-backup.
- Hybrid append-only audit: hash-chained `event_log` + trigger-written `row_audit`. Current-state tables are a deterministic projection of `event_log`.
- A storage port abstraction (`packages/skill/src/db/client.ts`) so we can swap libSQL/LanceDB later without touching graph operations.

## Consequences

- The skill is the only process that touches SQLite. The extension and webview never open a connection.
- Backup-before-migrate runs at app start and refuses to start if the backup write fails.
- Snapshots are opportunistic, materialized into separate ATTACH'd DBs, capped at "last N + one per week beyond that."
