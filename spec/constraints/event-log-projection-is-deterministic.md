---
id: constraint-event-log-projection-is-deterministic
title: Replaying the event_log on an empty database produces identical current-state tables
parent: intent-graph-state-survives-crashes
confidence: asserted
predicate_kind: property
expr: |
  forall (event_log L, fresh empty database D1, fresh empty database D2).
    project(L, D1) and project(L, D2)
    => D1.tables == D2.tables (byte-for-byte)
scope_node: intent-graph-state-survives-crashes
verifier_id: fast-check
status: draft
blocked_on:
  - event_log writers (phase 4 — current state tables exist but no events are emitted yet)
  - projection function project(L, D) (phase 4)
created: 2026-04-29
updated: 2026-04-29
---

# The event_log projection is deterministic

The current-state tables are claimed to be a deterministic projection of the hash-chained event_log. The test is straightforward: take any event_log, project it onto two fresh empty databases, and compare. If the projection is deterministic the byte representations match. If a projection contains any non-determinism (a clock read, a random id, an unsorted iteration over a hash map), this property fails.

Property-based because the event_log alphabet is bounded (the set of event kinds is fixed in tech-spec §4.7) and fast-check can synthesize valid event sequences via a small generator. The minimal counterexample, if determinism breaks, is two single-event logs whose projection diverges — which immediately localizes the non-determinism to the projector for that event kind.

Verifier: fast-check. The shrinker reduces to the smallest event sequence that triggers divergence.
