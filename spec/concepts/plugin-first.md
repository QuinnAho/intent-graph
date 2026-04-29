---
id: concept-plugin-first
title: Plugin-first, not standalone IDE
parent: null
confidence: asserted
regeneration_scope: atomic
description: |
  IntentGraph ships as a VS Code extension plus WebView panel as the richest
  client; the same skill subprocess is consumed identically by Claude Code
  and Codex CLIs. One MCP server, three clients. Pillar 1 in CLAUDE.md.

  Atomic per ADR-0018: this concept names a deployment-shape commitment with
  no syncs_with peers. A change to "where IntentGraph runs" (e.g. adding a
  fourth client, shipping a standalone) would regenerate every intent in
  this concept simultaneously; partial regeneration of "we now ship a
  standalone for some users only" is not a supported state.
created: 2026-04-29
updated: 2026-04-29
---

# Plugin-first, not standalone IDE

IntentGraph is not a new editor. It is a substrate that meets developers where they already work — VS Code first, with parity across Claude Code and Codex CLIs. The architectural commitment is that the skill subprocess speaks MCP over stdio, and three clients (extension host, Claude Code, Codex CLI) consume the same surface without divergence.

This concept groups the intents that talk about *where IntentGraph runs* and *how it is reached*. Anything that proposes a standalone UI, a separate desktop app, or a divergent client API violates this concept.

References:
- ADR-0001 (plugin-first, not standalone IDE)
- tech-spec.md §2 Pillar 1
- CLAUDE.md "five architectural pillars" §1
