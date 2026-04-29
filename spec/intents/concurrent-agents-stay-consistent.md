---
id: intent-concurrent-agents-stay-consistent
title: Concurrent agent runs cannot race the graph into an inconsistent state
parent: concept-agent-orchestration
confidence: asserted
owner: intentgraph-team
priority: P0
target_kinds:
  - module
status: draft
related:
  - intent-agent-runs-are-traceable
  - intent-graph-state-survives-crashes
created: 2026-04-29
updated: 2026-04-29
---

# Concurrent agent runs cannot race the graph into an inconsistent state

Multiple agent runs may execute concurrently — drift classification on save, a forward-sync patch, a verifier scheduled by a coverage check. Each run that mutates the graph holds an advisory lease with a fence token; the per-row OCC version on every node and edge prevents a stale-update from landing. A run that loses the race against another run sees a clear conflict and either retries or surfaces the conflict to the user.

This intent fails if two concurrent runs can both successfully apply contradictory mutations to the same node. It fails if a stale fence token can be re-used to slip a mutation through. It fails if a conflict surfaces as a silent overwrite instead of an explicit error.

Acceptance signals:
- Every mutation through the MCP surface includes an `expected_version` and rejects on mismatch.
- Lease renewals require the fence token issued at lease creation; a forged or stale token is rejected.
- A property-based test demonstrates that interleaving two arbitrary mutation streams produces a serializable history.
