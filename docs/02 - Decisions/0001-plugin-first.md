# ADR 0001 — Plugin-first, not standalone IDE

## Status

Accepted.

## Context

Building a new IDE shell is a multi-year commitment with no payoff for a graph-of-intent product wedge. Developers already live in VS Code. The same skill subprocess can serve Claude Code and Codex CLIs — the IDE plugin is just the richest of three clients.

## Decision

- Ship as a VS Code extension (`packages/extension`) with a primary `WebviewPanel` (`packages/webview`) and a secondary sidebar `WebviewView` for outline/drift.
- Activation event scoped to first command invocation: `onCommand:intentgraph.openGraph`.
- The skill subprocess is packaged as a single Agent Skills directory (`packages/agent-skill`) and consumed identically by `.claude/skills/intentgraph/` and `.codex/skills/intentgraph/`.
- One MCP server, three clients — never fork the server per client.

## Consequences

- The extension cannot grow business logic; it must remain a controller layer that talks to the skill over MCP.
- Webview ↔ extension messaging goes through `vscode-messenger` with a typed envelope from `packages/shared/src/protocol`.
- The webview cannot import directly from the skill or from Node-only modules — see `STRUCTURE.md` import rules.
