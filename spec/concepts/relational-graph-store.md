---
id: concept-relational-graph-store
title: Relational graph store as substrate
parent: null
confidence: asserted
regeneration_scope: atomic
description: |
  better-sqlite3 (WAL) + sqlite-vec + Drizzle ORM is the single store. The
  hash-chained event_log is canonical; current-state tables are a deterministic
  projection. JSON is for export only, never for storage. Pillar 2 in CLAUDE.md.

  Atomic per ADR-0018: storage-substrate commitments cannot regenerate
  piecewise. Switching stores or changing event_log semantics would touch
  every intent under this concept at once — you cannot half-migrate the
  hash chain. No syncs_with peers; the concept is internally cohesive.
created: 2026-04-29
updated: 2026-04-29
---

# Relational graph store as substrate

The graph is stored relationally in SQLite, not in JSON files, not in a property-graph engine, not in a vector DB. Better-sqlite3 with WAL gives us synchronous reads, real transactions, and a single mmap-backed file. sqlite-vec adds top-K retrieval without a sidecar; Drizzle adds typed schema.

The load-bearing claim is that a hash-chained `event_log` is the canonical record of every mutation, and the current-state tables are a deterministic projection of that log. Anything that bypasses the log to mutate state is a violation. Anything that treats markdown or `graph.json` as a source-of-truth state is a violation.

This concept groups intents about *where state lives* and *how state changes are recorded*.

References:
- ADR-0002 (relational graph store)
- tech-spec.md §2 Pillar 2, §4 Schema
- CLAUDE.md "five architectural pillars" §2
