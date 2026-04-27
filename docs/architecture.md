# Architecture

This document is the entry point for newcomers. It links to the ADRs that record each pillar decision and points at the code that implements them. The full technical specification lives in `Tech-Spec.md` at the repository root.

## The five pillars

1. **Plugin-first VS Code extension.** See [`adr/0001-plugin-first.md`](./adr/0001-plugin-first.md). Implementation: [`packages/extension`](../packages/extension).
2. **Relational graph store as substrate.** See [`adr/0002-relational-graph-store.md`](./adr/0002-relational-graph-store.md). Implementation: [`packages/skill/src/db`](../packages/skill/src/db) and [`packages/skill/src/graph`](../packages/skill/src/graph).
3. **Spec-driven loop.** See [`adr/0003-spec-driven-loop.md`](./adr/0003-spec-driven-loop.md). Implementation crosses [`packages/skill/src/parser`](../packages/skill/src/parser), [`packages/skill/src/orchestrator`](../packages/skill/src/orchestrator), and [`packages/skill/src/verifiers`](../packages/skill/src/verifiers).
4. **Agent orchestration as a first-class artifact.** See [`adr/0004-agent-orchestration.md`](./adr/0004-agent-orchestration.md). Implementation: [`packages/skill/src/orchestrator`](../packages/skill/src/orchestrator) and [`packages/skill/src/agent-runner`](../packages/skill/src/agent-runner).
5. **Faithfulness via architecture, not training.** See [`adr/0005-faithfulness-by-architecture.md`](./adr/0005-faithfulness-by-architecture.md). Implementation: [`packages/skill/src/trace`](../packages/skill/src/trace) plus the AgentRunner chokepoint.

## Process boundaries

```
VS Code window
  ├─ Extension Host (Node)         ← packages/extension
  │    └─ Webview Panel (browser)  ← packages/webview
  └─ Skill Subprocess (Node)       ← packages/skill, exposed as @intentgraph/agent-skill
        ↑
        │ MCP over stdio
        ▼
  Claude Code CLI / Codex CLI       ← consumes packages/agent-skill identically
```

The MCP server in `packages/skill` is the single substrate. The extension is the richest client; the CLIs are equally first-class clients.

## Where to find things in under thirty seconds

- A schema → `packages/shared/src/schemas/`
- A graph or DB query → `packages/skill/src/graph` or `packages/skill/src/db`
- A model call → `packages/skill/src/agent-runner` (the only place `ai`'s call surface may be imported)
- A VS Code command, codelens, or status bar item → `packages/extension/src/{controllers,codelens,statusbar}`
- A node renderer or graph interaction → `packages/webview/src/graph`
- An MCP tool definition → `packages/skill/src/mcp/tools`

See [`STRUCTURE.md`](../STRUCTURE.md) at the repo root for the full layout and the import-direction rules.

## Working with Agents on This Project

IntentGraph is built using Claude Code and Codex CLI. The discipline below is what makes that work without the architecture eroding turn over turn. The same rules apply when contributors run agents themselves.

### Hard rules (load-bearing — violations invalidate the architecture)

1. **AgentRunner is the only path to model providers.** No file outside `packages/skill/src/agent-runner/` may import `generateText | streamText | generateObject | streamObject | embed | embedMany` from `ai`. Enforced by the `intentgraph/agent-runner-only` ESLint rule in [`../eslint.config.mjs`](../eslint.config.mjs). Trace recording happens inside AgentRunner; bypassing it means the action has no record.
2. **Architectural decisions are ADRs.** New constraints, schema changes, MCP tool surface changes, or anything that crosses the contract between extension, webview, and skill require an ADR under [`adr/`](./adr/). ADRs are immutable after acceptance — supersede with a new ADR rather than editing.
3. **Specs under `/spec/` are contracts.** YAML frontmatter (`id`, `title`, `parent`, `confidence`, optional `verified_by` and `adrs`). Use the `intentgraph-spec-writer` skill to add or change them.
4. **Do not lift these from ClaudeMap.** Contracts (`claudemap/contracts/`), handlers (`claudemap/handlers/`), the cache layer, the enrichment pipeline, or any JSON-as-storage code. The IntentGraph equivalents are Drizzle + Zod, MCP tools with Zod-validated I/O, SQLite + WAL, Inngest functions + AgentRunner, and SQLite (not JSON) respectively. The `intentgraph-claudemap-lifter` skill enforces this.
5. **TypeScript strict everywhere.** No new `any`, no new `// @ts-ignore` without an ADR reference in the comment.
6. **No second graph model.** Inngest's task graph IS the IntentGraph task subgraph. Do not introduce LangGraph, Mastra, CrewAI, or AutoGen.
7. **Never train any IntentGraph component against the monitor's signal.** This is the obfuscation tax Baker et al. 2503.11926 warn about. ADR-0005.

### Workflow split — Codex vs Claude Code

Both tools consume the same skill subprocess via stdio MCP, so project state is shared. The bias differs.

| Codex CLI is best for… | Claude Code is best for… |
|------------------------|---------------------------|
| Well-scoped implementation tasks that map to a GitHub issue. | In-flight design exploration and iterative refactor. |
| Async background runs and long-running batch work. | Synchronous local sessions where the human steers turn-by-turn. |
| GitHub-first workflows: issues, PRs, automated review. | Local terminal workflows: editing, debugging, dogfooding. |
| `intentgraph-implementer` skill against a spec or ADR. | `intentgraph-architect` skill, ADR drafting, lift work. |
| `/intentgraph-ralph` task-list execution. | `intentgraph-spec-writer` and `intentgraph-verifier-author`. |

**Rule of thumb.** If the task can be stated as "given this issue and this ADR, produce a PR," prefer Codex. If the task is "we need to figure out how to model X," prefer Claude Code. The architect skill exists precisely to push exploratory work back into Claude Code before Codex picks it up.

### Dogfooding ladder

Phases gate on dogfooding maturity, not feature count.

| Level | Phase | Gate criterion |
|-------|-------|----------------|
| **L0** | end of Phase 2 | `pnpm build && open app/dist/index.html` shows IntentGraph's own intents and code modules. New contributor finds an intent visually within 60s. |
| **L1** | end of Phase 3 | Editing `/spec/intents/auth.md` in VS Code updates the on-screen graph within 2s without restart. `git diff` after a UI edit shows clean human-readable markdown. |
| **L2** | end of Phase 4 | In one week of normal team coding, ≥80% of symbol-vs-intent drift is auto-detected and ≥50% of suggestions are accepted as-is. |
| **L3** | end of Phase 5 | CI fails when `verify.run --strict` shows any drift on the team's repo. Tool writes new intent stubs from PR commits and asks the author to confirm. For 4 consecutive weeks, no merged PR contains an undocumented exported symbol. |

Beyond L3: Phase 6 hardening + first external pilot users; Phase 7 Python (v1.1); Phase 8 Go *or* Rust (v2). See `Tech-Spec.md` §6 for the full effort table.

### Available agent surfaces

The discipline ships as skills, subagents, and slash commands under `.claude/` (and mirrored under `.codex/`). See [`STRUCTURE.md` § Agent configuration](../STRUCTURE.md#agent-configuration) for the file layout. The high-level map:

- **Five skills** — `intentgraph-architect` (read-only ADR drafter), `intentgraph-implementer`, `intentgraph-claudemap-lifter`, `intentgraph-spec-writer`, `intentgraph-verifier-author`.
- **Five subagents** — `intent-extractor`, `drift-reconciler`, `code-generator`, `monitor`, `adr-writer`.
- **Seven slash commands** — `/intentgraph-init`, `/intentgraph-status`, `/intentgraph-lift`, `/intentgraph-spec`, `/intentgraph-adr`, `/intentgraph-verify`, `/intentgraph-ralph`.

### What to do when uncertain

- Read the relevant `Tech-Spec.md` section. It's the source of truth.
- If a decision is being made: write an ADR via `/intentgraph-adr <title>`.
- If the decision is load-bearing and the spec is silent: ask the human. Don't guess.
- Before lifting from `claudemap/`: invoke the lifter skill via `/intentgraph-lift <file>`.
- Before marking work complete: run `/intentgraph-verify`.
