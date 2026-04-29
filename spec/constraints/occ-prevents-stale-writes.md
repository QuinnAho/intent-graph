---
id: constraint-occ-prevents-stale-writes
title: A write with stale expected_version must be rejected
parent: intent-concurrent-agents-stay-consistent
confidence: asserted
predicate_kind: property
expr: |
  forall (node n, version v_old, version v_new).
    n.version = v_new and v_old < v_new
    => upsert_node(id: n.id, expected_version: v_old) rejects with version_mismatch
scope_node: intent-concurrent-agents-stay-consistent
verifier_id: fast-check
status: draft
blocked_on:
  - mcp graph.upsert_node tool (phase 3)
created: 2026-04-29
updated: 2026-04-29
---

# OCC prevents stale writes

The optimistic-concurrency-control discipline requires that an upsert carrying `expected_version: v_old` against a row whose actual version is `v_new > v_old` is rejected — never silently overwritten. This constraint is the falsification test for "concurrent runs stay consistent": if the OCC check can be bypassed, the intent is gone.

The constraint is `predicate_kind: property` because fast-check can fuzz arbitrary version-bump sequences against the upsert API and confirm the rejection invariant. The verifier is fast-check (already in `packages/skill/devDependencies` per ADR-0011).

Failing example, if OCC were ever broken: agent A reads node `intent-foo` at version 3, agent B reads at version 3, both compute mutations, A writes (version becomes 4), B writes with `expected_version: 3`. If B's write succeeds, A's mutation is silently lost. The constraint says: B's write must fail, surfacing the conflict.

Shrinker: fast-check's standard integer + array shrinker. The minimal counterexample is two writes to the same node with the same `expected_version`.
