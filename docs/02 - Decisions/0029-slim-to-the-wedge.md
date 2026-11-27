# ADR 0029 — Slim to the wedge, visual first

## Status

Accepted. Decided by Quinn on 2026-11-27.

Parks ADR 0004 (agent orchestration through Inngest and AgentRunner). Supersedes ADR 0006, 0007, 0008, 0010, 0013 and 0014 (the Codex mirror, the Ralph loop and the Codex audit). Narrows ADR 0001 (the VS Code extension is deferred, the plugin comes first).

## Context

The project stopped on 2026-05-20 with the static graph (L0) signed off and Phase 3 blocked on an MCP design. The May plan was sized for two or three senior engineers over 9 to 11 months. Quinn is one developer.

Research on 2026-11-27 (see `docs/03 - Research/2026-11-27 Direction - Approaches.md`) found:

- Spec-as-source retreated in 2026. CodeSpeak retired its compiler and Tessl dropped its framework.
- Orchestration, worktrees, background agents and plan review are now provided by Claude Code and by products such as Augment Intent and Kiro.
- Spec writing and task breakdown are crowded (Spec Kit, OpenSpec, Kiro, Traycer).
- Nobody found ships typed intent, constraint and decision nodes with obligations bound to executable checks, or drift judged at the level of intent.

Quinn's words:

- On direction: "we can slim refacotr is fine, however I do think visual is the way to go for me personally".
- On Codex: "Drop Codex".
- On the old loop: "yes cleanup that is not needed".
- On reuse: "I would like to use the best things of open source stuff rather than rewrite from scratch, we can cherry pick".

## Decision

1. **The source of truth is the typed markdown under `/spec`.** One node per file: intent, constraint, concept, decision. SQLite stays a projection of those files and the code.
2. **The graph is the main surface.** It shows the spec and the code it binds to, and it is where Quinn edits. A graph edit writes clean markdown, so `git diff` stays readable.
3. **Build obligations tied to real checks.** A node names the tests or commands that prove it. The graph shows verified, failed or pending per node.
4. **Build an intent-level drift check.** When code changes, a model that did not write the change compares it with the linked nodes and says whether the intent still holds.
5. **An agent never changes a spec by itself.** It proposes, and a human confirms.
6. **Ship as a Claude Code plugin** (skills, hooks, a small MCP server for graph queries) plus the webview. The VS Code extension comes later.
7. **Reuse before writing.** Each lane checks open source first and records adopt, borrow or skip, with the license.
8. **Development runs through an orchestrator with fresh agents in worktrees**, gated by `tools/verify.mjs` and by a reviewer that is not the builder. Claude only.

## Parked

Not deleted, not extended without a new ADR: Inngest as runner, AgentRunner and the three model tiers, leases and fence tokens, Yjs per node, TipTap mentions, vector retrieval and PageRank, formal verifier adapters, the monitor LLM on Groq, the VS Code extension host.

The code scaffolds for these stay in `packages/` until a lane needs the space. The ESLint rule that confines model-call imports to `packages/skill/src/agent-runner` stays on.

## Removed

The Codex mirror (`.codex/`, `AGENTS.md`), the Ralph loop and its commands, the `/qa` Codex audit, and the cc-sdd install. The state before removal is tagged `pre-overhaul-2026-11-27`. The May task lists are kept as an archive under `docs/06 - Tasks/`.

## Consequences

- The dogfooding ladder in the Tech Spec no longer maps to phases one to one. The Board replaces the phase task lists.
- ADRs 0016 (verifier interface), 0019 (obligation attachment) and 0025 (scope change and stale requirements) become the design inputs for the two things we build.
- The independent check on agent work moves from Codex to a fresh Claude agent that did not do the work, plus deterministic gates.
- Claude Code is the only agent host for now. The spec files stay plain markdown, so another host can be added later without a data change.
- Risk carried: research found that models recover the "what" of a decision from code better than the "why". Intent is captured when it is stated, not guessed from code afterwards.
