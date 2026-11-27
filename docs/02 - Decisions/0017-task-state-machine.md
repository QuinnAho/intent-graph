# ADR 0017 — Task state machine: split storage and view enums

## Status

Accepted 2026-05-03.

## Context

Tech-spec §4 specifies two different sets of `task` status values, and the two sets do not match.

§4.1 (lines 198–199) defines the storage shape — the JSON `body` of a `node` row with `kind='task'`. Its status enum has **7** values:

```
proposed | leased | running | produced | committed | rejected | rolled_back
```

§4.5 (lines 258–269) defines the `task_active` view that projects schedulable rows out of `node`. The view's `WHERE` clause filters on **5** values:

```
proposed | leased | running | produced | monitor_pending
```

`monitor_pending` is in the view but not in the storage enum. §3.3 (line 124) describes the lifecycle as `proposed → leased → running → produced_patch → monitor_pending → committed | rejected | rolled_back`, which adds a third inconsistency: §3.3 names the post-execution state `produced_patch` while §4.1 names it `produced`. The spec is internally inconsistent on both points and offers no rule for resolving them.

Phase-2 task `p2-t01` (the schema commit pending after the recovery from the failed first ralph attempt) had to pick a resolution because the Drizzle definitions, the Zod body schemas, and the `task_active` view DDL all need a concrete enum. The QA gate that produced `automation/qa-reports/qa-report-2026-04-27T200644Z.md` flagged this as a blocker (finding F-02): the resolution constrains the task state machine across storage, scheduling, and the MCP surface that exposes both, and no ADR records the decision. ADR-0015 (schema scope) committed to landing the entire tech-spec §4 schema in one monolithic migration, which forces this question now rather than deferring it to a phase-4 follow-up.

The three options considered:

1. **Widen storage to 8 values.** Add `monitor_pending` to §4.1's enum so persisted `task.status` can hold any of the 8 values across both spec sections. Storage matches the view; the orchestrator does a plain `UPDATE task.body.status = 'monitor_pending'` between `produced` and `committed`. Cost: a new persisted state survives crashes and replays, expanding the state machine the recovery path has to handle.
2. **Narrow the view to 4 values.** Drop `monitor_pending` from `task_active`'s `WHERE` clause; collapse any monitor wait into `produced`. View consistent with storage. Cost: loses the ability to filter "tasks waiting on a monitor verdict" from the schedulable set without a side table or extra column.
3. **Split storage and view enums.** Storage stays at §4.1's 7 values; the view layer adds `monitor_pending` per §4.5. The view computes `monitor_pending` in its `SELECT` body from a join against `trace_event` (§4.7) where `kind='monitor' AND monitor_verdict IS NULL` against tasks whose stored status is still `produced`. Cost: the derivation logic has to live somewhere (view SQL or a wrapping skill function), and two parallel enum types increase the surface in `packages/shared`.

The phase-2 schema work has already committed code reflecting option (3): `packages/shared/src/schemas/node.ts:97–123` defines both `TaskStatusSchema` (storage, 7 values) and `TaskActiveStatusSchema` (view, 5 values); `packages/shared/src/schemas/task.ts:9–16` uses `TaskActiveStatusSchema` for the projected view row; `packages/skill/src/db/schema.ts` defines the `task_active` view's `WHERE` clause with the 5-value list. This ADR's job is to record (3) as the decision and explain why, not to introduce it.

## Decision

The task state machine is split across two enums, one for storage and one for the projection view. Neither tech-spec section has to be edited; both are read literally.

- **Storage enum** (`task.body.status`, persisted): `proposed | leased | running | produced | committed | rejected | rolled_back`. This is the §4.1 enum verbatim. Writes that target any other value are bugs. `TaskStatusSchema` in `packages/shared/src/schemas/node.ts` is the application-level guard; the SQLite-side check is the JSON-validated body shape, since SQLite's `CHECK` cannot constrain `json_extract(body,'$.status')` against an enum without trigger gymnastics we declined in ADR-0015.
- **View enum** (`task_active.status`, projected at read time): `proposed | leased | running | produced | monitor_pending`. This is the §4.5 enum verbatim. `TaskActiveStatusSchema` in `packages/shared/src/schemas/node.ts` is the application-level guard for view-row consumers.
- **`monitor_pending` is derived, not stored.** It is defined as: `task.body.status = 'produced' AND there exists a trace_event row with task_node_id = task.id AND kind = 'monitor' AND monitor_verdict IS NULL`. The derivation lives in the `task_active` view's `SELECT` body (a `LEFT JOIN trace_event` plus a `CASE` that promotes `produced` to `monitor_pending` when the join matches). Phase-2 ships the view's `WHERE` clause with the 5-value list per §4.5; the `CASE`-based promotion is dormant until phase 4 lands the orchestrator that writes monitor `trace_event` rows.
- **Canonicalize `produced` over `produced_patch`.** §4.1 is the storage contract and uses `produced`; §3.3's prose lifecycle uses `produced_patch`. The persisted name wins. References elsewhere should read `produced` and treat `produced_patch` as a documentation artifact to be cleaned up the next time §3.3 is touched. This is noted here so the inconsistency is on the record, not because the decision hinges on it.

The §3.3 lifecycle, restated against the resolved enums:

```
proposed → leased → running → produced
                                 ├─→ committed                    (no monitor required)
                                 ├─→ (view: monitor_pending) → committed
                                 ├─→ (view: monitor_pending) → rejected
                                 └─→ rolled_back                  (rollback path)
```

The view-only step is parenthesized because it does not change the persisted status — only the projected one.

## Consequences

What this enables:

- Both tech-spec sections (§4.1, §4.5) are preserved literally; no spec edit is needed to make the schema implementable. The reconciliation lives in an ADR rather than as a quiet edit to a numbered section.
- The persistence contract is narrow. `task.body.status` has 7 values forever; recovery, replay, and the hash-chained `event_log` (ADR-0002) all reason about a small finite state set.
- Monitor-wait state is consistent with how the monitor actually works (per ADR-0005): the verdict lives on the `trace_event` row, not on the task row. Computing `monitor_pending` from that row is the join the data already supports.
- Schedulers and MCP surfaces that want the unified scheduling state read the view; storage callers read the table. The two surfaces have separate Zod schemas, so a misuse (e.g., writing `monitor_pending` into `task.body.status`) fails at the schema boundary rather than at runtime.
- ADR-0015's monolithic schema decision stays intact. The view DDL ships in phase 2 as planned; only the `CASE`-based promotion logic in the `SELECT` body is added in phase 4, which is a non-destructive view replacement.

What this forecloses:

- App code that wants the unified state **must** query `task_active`, not `node`. There is no `monitor_pending` value in storage and no shortcut to compute it from the table alone. Anything writing `monitor_pending` to `task.body.status` is a bug; the Zod guard rejects it.
- The view's `monitor_pending` derivation is fragile until phase 4 actually populates `trace_event` with monitor rows. Phase-2 and phase-3 readers of `task_active` should expect 4 statuses in practice (`proposed | leased | running | produced`) — `monitor_pending` will be a permanent zero-row case until the orchestrator and monitor are wired. Tests and consumers built in phases 2 and 3 should not assume the 5th value is reachable.
- The view's SQL gets more complex when the phase-4 promotion logic lands: a `LEFT JOIN trace_event` with a correlated condition on `monitor_verdict IS NULL`. ADR-0015's "non-destructive shape changes are part of phase work" clause covers this, but reviewers should expect the view's definition to grow.
- Two parallel status enums in `packages/shared` is now the pattern. If a third specialization view emerges (e.g., a future `task_completed` projection), it has to choose between reusing `TaskStatusSchema` and defining its own subset; the precedent set here is "define your own, named for the view."

## Alternatives considered

- **Option (1): widen storage to 8 values, add `monitor_pending` to §4.1.** Rejected. It expands the persistence contract for a state that is naturally derivable from `trace_event`, and it forces a §4.1 spec edit. ADR-0002 names current-state tables as a deterministic projection of the `event_log`; persisting `monitor_pending` violates that posture by storing a value that can be recomputed from a hash-chained event already on disk. It also adds a state to crash-recovery: a process that dies between writing `monitor_pending` and writing `committed` has to be reasoned about explicitly.
- **Option (2): narrow the view to 4 values, drop `monitor_pending` from §4.5.** Rejected. It loses a real piece of operator-visible state — the scheduler and the MCP surface both benefit from being able to ask "which tasks are waiting on the monitor right now." Collapsing it into `produced` removes that distinction without giving anything back, and it forces a §4.5 spec edit.
- **Option (3): split storage and view enums.** Selected. Both spec sections are preserved literally; persistence stays narrow; the derivation matches how the monitor verdict is actually recorded (on `trace_event`, per ADR-0005); and the cost (two enums in `packages/shared`, slightly more complex view SQL in phase 4) is paid in the right place.

## References

- tech-spec.md §3.3 (orchestration runtime, task lifecycle prose; note `produced_patch` is documentation drift for `produced`)
- tech-spec.md §4.1 (node table, task body shape, storage status enum — 7 values)
- tech-spec.md §4.5 (`task_active` view, view-layer status enum — 5 values, including derived `monitor_pending`)
- tech-spec.md §4.7 (`trace_event` table, the source of `monitor_pending` derivation via `kind='monitor' AND monitor_verdict IS NULL`)
- ADR-0002 (relational graph store as substrate; `event_log` canonical, current-state tables as deterministic projection)
- ADR-0004 (agent orchestration; task lifecycle and lease/fence-token discipline)
- ADR-0015 (schema scope: monolithic Drizzle schema in phase 2; reason this decision is being forced now rather than at phase 4)
- `packages/shared/src/schemas/node.ts:97–123` (the `TaskStatusSchema` / `TaskActiveStatusSchema` split this ADR records)
- `packages/shared/src/schemas/task.ts:9–16` (view-row schema using `TaskActiveStatusSchema`)
- `packages/skill/src/db/schema.ts` (the `task_active` view DDL with the 5-value `WHERE` clause)
- `automation/qa-reports/qa-report-2026-04-27T200644Z.md` finding F-02 (the QA blocker that prompted this ADR)
