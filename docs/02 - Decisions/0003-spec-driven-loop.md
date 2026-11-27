# ADR 0003 — Spec-driven loop is the backbone

## Status

Accepted.

## Context

The product thesis is that code is a verifiable projection of intent. That requires bidirectional sync — forward (intent → code) and backward (code → drift on intent) — with a verification backplane that decides whether intent is still satisfied.

## Decision

- **Forward sync.** Intent edit → orchestrator routes to a generation agent → agent runs in a `git worktree` shadow workspace under `.intentgraph/shadow/<task-id>` → produces a `proposed_patch` graph node → previewed via `vscode.diff` → applied via `WorkspaceEdit`.
- **Backward sync.** `onDidSaveTextDocument` → tree-sitter incremental reparse → 4-tier AST diff ladder (signature hash → body normalized hash → GumTree edit script → optional LLM behavior classifier) → drift events on affected intent nodes.
- **Verification backplane.** Obligations attached to intent nodes; runners pluggable.
  - Tier-1 in-process: `fast-check` (TS), `ts.createIncrementalProgram` for tsc diagnostics.
  - Tier-2 MCP plugins: Verus, Dafny, dmypy, pyright LSP. Cross-language goes over MCP, not gRPC.
  - Counterexample minimization: PBT shrinking → optional HDD under a 5s budget. Counterexamples become first-class graph nodes with one-click promote-to-regression-test.

## Consequences

- The diff ladder hyperparameters are fixed per language. Never auto-tune in the inner loop.
- Shadow worktrees are GC'd eagerly when their task completes — Cursor's shipped-then-removed shadow workspace is the warning.
- Verifier plugin registration is the only extension point for new language support; do not bake language assumptions into orchestrator code.
