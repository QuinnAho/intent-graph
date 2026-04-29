---
id: intent-json-is-export-only
title: graph.json and markdown exports are dumps, never sources
parent: concept-relational-graph-store
confidence: asserted
owner: intentgraph-team
priority: P0
target_kinds:
  - module
status: draft
related:
  - intent-graph-state-survives-crashes
created: 2026-04-29
updated: 2026-04-29
---

# graph.json and markdown exports are dumps, never sources

The repo's `graph.json` files and the `/spec/*.md` markdown corpus are projections of the canonical SQLite state. Reading them is supported (the L0 webview path); treating them as authoritative state is forbidden. A feature that reads `graph.json` and then writes it back without a round-trip through SQLite is a violation of this intent.

This intent fails if any production code path treats markdown or JSON as the source of truth — for example, by skipping a SQLite read and parsing markdown to answer "what intents exist." It fails if an export ever carries information that is not also in SQLite (so the export becomes its own source by accident).

Acceptance signals:
- The L0 dogfood loader at `packages/webview/src/transport/graph-json-loader.ts` reads `graph.json` for display only; mutations go through the MCP surface.
- The MCP `graph.upsert_node` tool always writes to SQLite first; export is a separate read pass.
- Every export format includes `_format` and `_version` markers so a stale export cannot silently substitute for current state.
