---
id: intent-graph-state-survives-crashes
title: Graph state is durable across process crashes and replayable from the event log
parent: concept-relational-graph-store
confidence: asserted
owner: intentgraph-team
priority: P0
target_kinds:
  - module
status: draft
created: 2026-04-29
updated: 2026-04-29
---

# Graph state is durable across process crashes and replayable from the event log

If the skill subprocess dies mid-run, the graph state visible after restart equals the state implied by the hash-chained `event_log` up to the last committed event. Current-state tables (`node`, `edge`, `obligation`, etc.) are a deterministic projection of that log: replaying the log on an empty database produces identical rows.

This intent fails if any state mutation reaches the current-state tables without a corresponding event_log entry. It fails if the projection is not deterministic — i.e. if replaying the log twice produces different state.

Acceptance signals:
- An audit/replay tool (tech-spec §5) can rebuild the current-state tables from the event log alone and the result matches the live tables byte-for-byte.
- Killing the skill subprocess during a multi-step transaction leaves either the pre-state (if the txn did not commit) or the post-state (if it did) — never a half-applied state.
- The hash chain is verifiable: a tampered event_log row breaks the chain at audit time.
