---
id: intent-example-graph-is-source-of-truth
title: The graph is the source of truth, not the markdown export
parent: concept-example-spec-driven-loop
confidence: asserted
owner: intentgraph-team
priority: P0
target_kinds:
  - module
status: active
created: 2026-04-27
updated: 2026-04-27
---

# Example intent: the graph is the source of truth

Parser-fixture intent. The L0 dogfood payload authored by `p2-t11` carries
the actual project intents.

The graph projection in SQLite is canonical. `graph.json` and the markdown
files under `/spec/` are dumps you can round-trip *from*, never authoritative
*sources*. Any subsystem that treats markdown or JSON as canonical state
violates ADR-0002.
