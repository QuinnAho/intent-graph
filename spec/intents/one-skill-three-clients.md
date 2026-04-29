---
id: intent-one-skill-three-clients
title: A single skill subprocess serves the extension and both CLIs identically
parent: concept-plugin-first
confidence: asserted
owner: intentgraph-team
priority: P0
target_kinds:
  - module
  - api
status: draft
related:
  - intent-developers-stay-in-their-editor
created: 2026-04-29
updated: 2026-04-29
---

# A single skill subprocess serves the extension and both CLIs identically

The skill subprocess that owns the SQLite store, the parser, the orchestrator, and the AgentRunner is consumed identically by three clients: the VS Code extension host, Claude Code, and Codex CLI. They reach it via MCP over stdio (or Streamable HTTP when configured for remote). No client gets a private API surface; no client carries graph-mutation logic the others lack.

This intent fails if a feature lands in one client and not the others without an explicit ADR-level decision recording why the divergence is acceptable. It fails if any client implements graph mutations directly instead of going through the skill's MCP surface.
