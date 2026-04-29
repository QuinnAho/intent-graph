---
id: intent-developers-stay-in-their-editor
title: Developers can use IntentGraph without leaving their editor
parent: concept-plugin-first
confidence: asserted
owner: intentgraph-team
priority: P0
target_kinds:
  - module
  - api
status: draft
created: 2026-04-29
updated: 2026-04-29
---

# Developers can use IntentGraph without leaving their editor

A developer working on the codebase can author intents, review drift, accept or reject AI-proposed patches, and inspect verifier output without ever switching to a separate desktop application or web tab. The richest experience is the VS Code extension + WebView panel; the same surface is reachable from the terminal via Claude Code or Codex CLI for users who live there.

This intent fails if any core IntentGraph workflow requires a standalone tool to complete. It fails softly if a workflow is *available* in-editor but the in-editor version is meaningfully worse than the equivalent CLI/web invocation — that signals divergence we are committing not to ship.

Acceptance signals:
- The L1 dogfood gate (editing `/spec/intents/auth.md` updates the on-screen graph within 2s without restart) is satisfiable from inside VS Code only.
- The L2 dogfood gate (≥80% drift auto-detected, ≥50% suggestions accepted) is measured on a team using IntentGraph in their normal editor session.
- No feature documented in tech-spec §3 has "open the standalone tool" as a step in its happy path.
