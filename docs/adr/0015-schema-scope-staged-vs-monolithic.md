# ADR 0015 — Schema scope: monolithic Drizzle schema in phase 2 vs staged per-phase migration

## Status

Accepted 2026-04-27.

## Context

Phase-2 task `p2-t01` lands the Drizzle schema in `packages/skill/src/db/schema.ts`. Tech-spec §4 specifies ten tables (plus the `task_active` view) as one cohesive SQLite schema:

- `node` (§4.1), `edge` (§4.2), `obligation` (§4.3), `lease` + `fence_seq` (§4.4), `task_active` view (§4.5) — first load-bearing in **phase 2**: `build-graph.ts` writes nodes/edges; the Coverage Verifier reads obligations; leases + fence tokens land alongside OCC.
- `event_log` (§4.6) — first load-bearing in **phase 4**: AgentRunner mutations are the canonical writers; hash chain is meaningless without those writers.
- `trace_event` (§4.7) — first load-bearing in **phase 4**: AgentRunner is the chokepoint that records every model call.
- `row_audit` (§4.9) — first load-bearing in **phase 4**: CDC triggers correlate with `event_log.id`, which only matters once mutations flow through AgentRunner.
- `retrieval` (§4.8) — first load-bearing in **phase 5**: PPR query cache is wired with `sqlite-vec`.
- `vec_intent`, `vec_code` virtual tables (§4.10) — first load-bearing in **phase 5**: `sqlite-vec` is wired alongside voyage embeddings.

ADR-0002 establishes SQLite + sqlite-vec + Drizzle as the substrate, names the hash-chained `event_log` as canonical with current-state tables as a deterministic projection of it, and commits to Atlas as a destructive-change linter in CI. The question now is implementation scope: does `p2-t01` ship Drizzle definitions for all ten tables (plus the view) in one migration, or only the ~5 tables phase 2 actually exercises, with the remainder added by later phases as they become load-bearing?

## Decision

`p2-t01` ships the **monolithic** Drizzle schema covering all ten tables and the `task_active` view in one migration. Phase-4 and phase-5 tables are defined empty; they accept no writes until the writing subsystem (AgentRunner, CDC triggers, sqlite-vec, retrieval) lands in its own phase.

Specifics:

- One Drizzle barrel file at `packages/skill/src/db/schema.ts` exports all ten table definitions and the view. CHECK constraints, FK semantics, and index strategy from tech-spec §4.1–§4.10 are present from day 1.
- One initial Atlas-linted migration covers the entire schema. Subsequent phases add migrations only for shape changes the spec did not foresee, not for "now we use this table."
- The `vec_intent` / `vec_code` virtual tables (§4.10) are declared but only loaded when `sqlite-vec` is available; phase 2 does not require the extension at runtime. The DDL lives in the migration; the extension load is gated by phase-5 wiring.
- AFTER triggers for `row_audit` (§4.9) are part of the initial migration so the table's contract is visible end-to-end, but they are inert until phase-4 mutations correlate `tx_id` with `event_log.id`.
- The `obligation.kind` enum (`'property'|'typecheck'|'formal'|'example'|'metamorphic'`) is pinned in this migration; ADR-0016 (Verifier interface) can rely on it without a follow-up schema change.

## Consequences

What this enables:

- Tech-spec §4 is implemented as one schema, matching how it is specified. Reviewers see the whole shape — `trace_event` referenced by `retrieval`, `event_log` referenced by `row_audit.tx_id`, `obligation.counterexample_node_id` referencing `node` — at design review rather than across three migrations spread over months.
- The hash-chained `event_log` and the `row_audit` CDC pair (ADR-0002's "hybrid append-only audit") are reasoned about as a unit. Their FK and trigger semantics are not re-relitigated when AgentRunner lands in phase 4.
- Atlas migrate-lint runs against the production schema from phase 2, so destructive-change drift is caught immediately rather than masked by a partial schema.
- The `obligation` table's `kind` enum is pinned, unblocking ADR-0016 (Verifier interface) without forcing a coordinated schema + interface migration later.
- Drizzle's `.$type<T>()` JSON typings (per §4 conventions) are wired once; adding a phase-4 table does not require revisiting the type-generation strategy.

What this forecloses / costs:

- The phase-2 review surface is larger. A reviewer auditing `p2-t01` sees ~10 tables when only ~5 are exercised by phase-2 code paths. Mitigation: the task-list reviewer is expected to defer judgement on phase-4/5 column shapes to tech-spec §4 (which specifies them) plus ADR-0002 (which commits to them) — those are the authoritative checks, not the migration diff.
- Empty tables in production from phase 2 onward. Until phase 4, `event_log`, `trace_event`, and `row_audit` accept zero rows; until phase 5, `retrieval` and the vec0 tables accept zero rows. This is acceptable: SQLite empty tables cost negligibly, and the alternative (FK references that don't yet exist) is worse.
- If tech-spec §4 turns out to be wrong about a phase-4/5 table shape, the correction is a migration on top of the phase-2 schema rather than a fresh design. This pushes some discovery work earlier than it strictly needs to be. Accepted because the spec is treated as authoritative per CLAUDE.md and ADR-0002.
- `sqlite-vec` extension load timing: the virtual tables exist in DDL from phase 2, but the runtime must tolerate `sqlite-vec` being absent until phase 5. The skill's DB client (`packages/skill/src/db/client.ts`, named in ADR-0002) becomes the place where extension-load policy is enforced; that is left to the implementer of `p2-t01` and the phase-5 wiring task.

## Alternatives considered

- **Staged (phase-2 tables only; add phase-4 and phase-5 tables in their own migrations).** Rejected. Smaller initial diff and bounded reviewer attention are real wins, but they buy a worse problem: FK references between tables that span phases (`row_audit.tx_id` ↔ `event_log.id`; `retrieval.trace_id` ↔ `trace_event.trace_id`; `obligation.counterexample_node_id` ↔ `node.id`) become stubbed-and-refactored across multiple migrations. Each ratchet is an opportunity for a destructive change that Atlas would have caught on day 1. Tech-spec §4 specifies the schema as one unit; staging fragments the unit for short-term review-burden relief.
- **Monolithic schema but split across multiple Drizzle files (one per phase's tables).** Rejected. The split would mirror phase boundaries, not relational structure, which is the wrong axis. Drizzle's barrel pattern works against a single `schema.ts` for migration-generation purposes; splitting introduces a tooling cost without changing the migration count.
- **Phase-2 tables + skeleton DDL for phase-4/5 tables (CREATE TABLE only, no Drizzle types).** Rejected. The half-measure gives up the typed-JSON safety (`.$type<T>()`) for phase-4/5 tables and creates a second migration when those Drizzle types are filled in later. If the table is in the database, it should be in Drizzle.

## References

- tech-spec.md §4.1–§4.10 (ten-table catalog and per-table DDL)
- tech-spec.md §6 (phase plan; phase-2/4/5 gates that determine when each table becomes load-bearing)
- ADR-0002 (relational graph store as substrate; SQLite + sqlite-vec + Drizzle; hash-chained `event_log` canonical; current-state tables as deterministic projection)
- ADR-0016 (Verifier interface — depends on `obligation.kind` enum being pinned; forthcoming)

ADR draft committed at `docs/adr/0015-schema-scope-staged-vs-monolithic.md` with status `Proposed`. Change status to `Accepted` after review.
