---
type: approaches
status: decided 2026-11-27, see ADR 0029
updated: 2026-11-27
---
# Direction after six months: approaches

Written 2026-11-27 by Claude for the owner. The project was last touched 2026-05-20.
Detail and sources are in the three research notes next to this one: [[2026-11-27 Abstraction Layer]], [[2026-11-27 Graph Libraries]], [[2026-11-27 Landscape]].
Tags: [O] the research agent opened the page. [S] search snippet only.

## The call

Which shape does IntentGraph take from here? My recommendation is **B: slim to the wedge**.

## What changed since May 2026

- **Spec-as-source retreated.** CodeSpeak retired its compiler on 2026-07-13 and moved to agent plugins that pull atomic requirements out of chats. Its own post says users did not write the specs themselves [O]. Tessl dropped its spec-as-source framework for a skills platform [O].
- **Orchestration became a commodity.** Claude Code now does worktrees, background agents that open draft PRs, plan mode, hooks and plugin packaging [O, partial changelog]. Augment Intent and Kiro ship multi-agent spec workflows.
- **Spec tooling is crowded.** GitHub Spec Kit has about 152k stars [O]. OpenSpec, Kiro and Traycer cover spec writing, task breakdown and plan checks.
- **The problem got a name.** Storey's "intent debt" paper (arXiv 2603.22106, Mar 2026) describes missing rationale, goals and constraints as its own kind of debt [O abstract].
- **Specs decay, and nobody checks continuously.** A study of spec-driven development in practice (arXiv 2608.25202) found spec-to-code checks run only at completion [O abstract]. Fiberplane's Drift (Mar 2026) flags stale specs but cannot judge meaning [O].
- **A warning for our thesis.** LLMs recover the "what" of a decision from code but often miss the "why" (arXiv 2609.03721) [S]. Intent has to be captured when it is stated, not guessed later from code.
- **MCP changed.** The 2026-07-28 spec is stateless with no session handshake [O]. Check it before writing our server.

## The options

### A. Stay the May plan

Phase 3 (MCP server, two-way markdown sync, VS Code extension), then Phase 4 (drift, AgentRunner, Inngest, monitor).

- Builds: everything in `Tech Spec.md`. It was sized for two or three senior engineers over 9 to 11 months.
- My read: about half of it is now a commodity (orchestration, worktrees, agent routing, leases). Building it alone means months before the part that is actually new.
- Risk: Augment Intent or Kiro add a graph view in one release while we are still on plumbing.

### B. Slim to the wedge (recommended)

Keep what is already here and build only what nobody ships.

- Source of truth: the typed markdown nodes under `/spec` (intents, constraints, concepts, decisions). They already exist.
- The graph: a view rendered from those files and the code symbols. This is the L0 graph you like, plus status colours.
- New thing 1, **obligations tied to real checks**: a spec node names the tests or commands that prove it. The graph shows verified, failed or pending per node.
- New thing 2, **intent-level drift check**: at commit, a separate cheap model compares the changed code with the nodes linked to it and says whether the intent still holds. A human confirms any change to a spec.
- Packaging: a Claude Code plugin (skills, hooks, a small MCP server for graph queries) plus the webview. The VS Code extension comes later.
- Parked: Inngest, AgentRunner and model tiers, leases and fence tokens, Yjs and TipTap editing, vector retrieval, formal verifiers, Codex parity.
- My read: this reaches something unique and usable on our own repo in weeks, with one developer and agents. It uses the platform instead of rebuilding it.
- Risk: it sets aside a lot of the 28 ADRs. Some become "superseded" and that work is sunk. It is Claude Code first.

### C. A high-level language with an AI compiler underneath

A spec language that compiles to code.

- My read: do not build it. Both flagship attempts retreated this year, and the research agent found no benchmark showing LLM compilation is reliable.
- What survives of the idea: option B already treats `/spec` as the high-level language. The nodes are typed, small and linked, and obligations make them executable. The "compiler" is an agent plus the checks, and code stays ordinary and hand-editable.

### D. Decision traces only

A plugin that records decisions from agent sessions into a queryable graph, with no verification.

- My read: memory tools are a commodity and there is no evidence yet that decision memory improves agent results [S]. Fold the capture idea into B later.

## Graph libraries

- **graphify**: a Python tool, about 154k stars. Tree-sitter for code, an LLM pass for docs and media, output `graph.json`. Its 71x token claim is one 52-file case. Independent checks show about 7x or less, and a 360-trial study found no clear gain for strong agents [O for the repo, S for the study]. Verdict: borrow its EXTRACTED versus INFERRED edge tag. Do not depend on it.
- **colbymchenry/codegraph**: MIT, Node, SQLite, tree-sitter, file watcher, MCP. The one candidate that could replace part of our extraction and freshness code as a dependency. Test it on a real repo before building more.
- **Keep**: SQLite, our tree-sitter walk, React Flow with ELK. Add scip-typescript for symbol identity when it is needed. Sigma 4 for an overview past about 5k nodes.
- **Note**: React Flow 13 is out (2026-11-23) with breaking changes. Kuzu's successor is LadybugDB, not needed yet.

## State of the repo today (measured 2026-11-27 on the dev PC)

- `pnpm install`, `typecheck`, `lint` pass. Tests: 90 pass in 11 files.
- `pnpm build` fails in `packages/skill`: tsup's type build rejects the `incremental` tsconfig option (TS5074).
- Phase 2 (static graph, L0) was signed off on 2026-05-04. Phase 3 is blocked on an ADR for the MCP tool surface.

## Not verified

- "Nobody ships it" means the research found none, not that none exists.
- Several claims rest on search snippets: Tessl's history, Augment Intent's launch date, the rationale-recovery paper, the 88,052-PR study.
- Codeplain was not opened. Cursor, Windsurf and Antigravity details come from comparison articles.
- No independent benchmark was found for LLM-as-compiler reliability, for the right unit of regeneration, or for rendering 5k to 50k nodes in a webview.
