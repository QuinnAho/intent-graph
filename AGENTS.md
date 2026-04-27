# IntentGraph — Codex project memory

> Loaded by Codex CLI on session start the way [`CLAUDE.md`](./CLAUDE.md) is loaded by Claude Code. Same hard rules, same dogfooding ladder. Where Codex and Claude Code differ in capability, this file documents the workflow split. The authoritative spec is [`tech-spec.md`](./tech-spec.md) — read it before making any architectural call.

## What this project is

IntentGraph is a spec-driven IDE plugin (forked from [QuinnAho/claudemap](./claudemap), MIT) where developers work in a living graph of intent, constraints, decisions, and rationale; AI continuously syncs implementation to the graph in both directions. v1 is TypeScript-only, VS Code-first, dogfoodable in 8–10 weeks. The product wedge is *persistent program theory plus structured verification* — code is a verifiable projection of intent, and the graph is the truth.

## The five architectural pillars

1. **Plugin-first, not standalone IDE.** VS Code extension + WebView panel are the richest client; the same skill subprocess is consumed identically by Claude Code and Codex CLIs. One MCP server, three clients. See [`docs/adr/0001-plugin-first.md`](./docs/adr/0001-plugin-first.md).
2. **Relational graph store as substrate.** better-sqlite3 (WAL) + sqlite-vec + Drizzle ORM is the single store. Hash-chained `event_log` is canonical; current-state tables are a deterministic projection. JSON is for export only, never for storage. See [`docs/adr/0002-relational-graph-store.md`](./docs/adr/0002-relational-graph-store.md).
3. **Spec-driven loop is the backbone.** Forward sync (intent edit → patch proposal in `git worktree` shadow → preview → apply) and backward sync (`onDidSaveTextDocument` → tree-sitter reparse → 4-tier semantic diff → drift events). Verification backplane attaches obligations to intent nodes. See [`docs/adr/0003-spec-driven-loop.md`](./docs/adr/0003-spec-driven-loop.md).
4. **Agent orchestration is first-class.** Inngest as the durable runner; AgentRunner over Vercel AI SDK v6 is the *only* path to model providers; three-tier routing (T0 hot / T1 warm / T2 frontier); leases with fence tokens + per-row OCC make state causally consistent. See [`docs/adr/0004-agent-orchestration.md`](./docs/adr/0004-agent-orchestration.md).
5. **Faithfulness via architecture, not training.** Every agent action records concrete artifacts (tool calls, retrieved node IDs, model + version, verifier outcomes, monitor verdict). A cheap monitor LLM (Llama 3.3 70B on Groq) gates every commit + 5% sample + always on `safety_critical`. Never train any IntentGraph component against the monitor's signal. See [`docs/adr/0005-faithfulness-by-architecture.md`](./docs/adr/0005-faithfulness-by-architecture.md).

## Hard rules

These are the same hard rules as in `CLAUDE.md`. They are load-bearing for the thesis.

- **AgentRunner-only model calls.** No file outside `packages/skill/src/agent-runner/` may import `generateText | streamText | generateObject | streamObject | embed | embedMany` from `ai`. Enforced by the ESLint rule `intentgraph/agent-runner-only` in [`eslint.config.mjs`](./eslint.config.mjs). Codex tasks that touch model calls go through AgentRunner or they fail CI.
- **No JSON-as-storage.** SQLite is the substrate. Markdown under `/spec/` and `graph.json` exports are dumps you can round-trip from, never sources.
- **Do not lift these from ClaudeMap.** Contracts, handlers, cache layer, enrichment pipeline, JSON storage. Lift the React Flow shell, the layout pipeline (ELK in worker), and the Zustand store patterns. Every lifted file carries a provenance header and an entry in `LIFT_LOG.md`. See the `intentgraph-claudemap-lifter` skill in `.codex/skills/`.
- **TypeScript strict everywhere.** No `any`, no `// @ts-ignore` without an ADR reference. `tsconfig.base.json` is the source.
- **No second graph model.** Inngest's task graph IS the IntentGraph task subgraph. Do not introduce LangGraph, Mastra, CrewAI, or AutoGen.
- **Never fine-tune against monitor signal.** ADR-0005, Baker et al.'s obfuscation-tax warning.
- **Specs under `/spec/` are contracts.** YAML frontmatter, verified-by links. Use the `intentgraph-spec-writer` skill.
- **Architectural decisions are ADRs under `/docs/adr/`.** Numbered sequentially, immutable after acceptance, supersede with a new ADR.

## Directory layout

| Path | Purpose |
|------|---------|
| `tech-spec.md` | Authoritative spec. Read before architectural decisions. |
| `AGENTS.md` (this file) | Codex project memory. |
| `CLAUDE.md` | Claude Code equivalent; same content, same rules. |
| `/spec/intents/` | Intent markdown files. Outcome-focused, frontmatter required. |
| `/spec/constraints/` | Verifiable narrowings of intents. |
| `/spec/decisions/` | In-spec decision records (not architectural — see `/docs/adr/` for those). |
| `/docs/adr/` | Architectural decision records. Immutable after acceptance. |
| `/docs/architecture.md` | Newcomer entry point linking ADRs to implementation. |
| `/packages/extension/` | VS Code extension host (Node). |
| `/packages/webview/` | React Flow + Zustand + TipTap webview (browser context). |
| `/packages/skill/` | Skill subprocess: MCP server, SQLite, tree-sitter, AgentRunner, verifiers, trace. |
| `/packages/shared/` | Zod schemas and types shared across extension, webview, and skill. |
| `/scripts/` | Dev scripts (seed-dev-db, eval-retrieval, package-skill, check-agent-config). |
| `/claudemap/` | Read-only reference fork. Source for lifts via the `intentgraph-claudemap-lifter` skill. |
| `/.codex/` | Codex project config: skills, subagents, commands, settings. |
| `/.claude/` | Claude Code parity; same skills and commands adapted to Claude conventions. |

## Dogfooding ladder

Phases gate on dogfooding maturity (L0–L3), not feature count.

| Level | Gate |
|-------|------|
| **L0** (end of Phase 2) | `pnpm build && open app/dist/index.html` shows IntentGraph's own intents and code modules. |
| **L1** (end of Phase 3) | Editing `/spec/intents/auth.md` in VS Code updates the on-screen graph within 2s without restart. |
| **L2** (end of Phase 4) | In one week of normal team coding, ≥80% of symbol-vs-intent drift is auto-detected and ≥50% of suggestions are accepted as-is. |
| **L3** (end of Phase 5) | CI fails when `verify.run --strict` shows any drift. No merged PR contains an undocumented exported symbol for 4 consecutive weeks. |

See `tech-spec.md` §6 for the full effort table.

## Workflow split — Codex vs Claude Code

Use both tools, with different bias. Both consume the same skill subprocess via stdio MCP, so the project state is shared.

| Codex CLI is best for… | Claude Code is best for… |
|------------------------|---------------------------|
| Well-scoped implementation tasks that map to a GitHub issue. | In-flight design exploration and iterative refactor. |
| Async background runs and long-running batch work. | Synchronous local sessions where the human steers turn-by-turn. |
| GitHub-first workflows: issues, PRs, automated review. | Local terminal workflows: editing, debugging, dogfooding. |
| `intentgraph-implementer` skill against a spec or ADR. | `intentgraph-architect` skill, ADR drafting, lift work. |
| Ralph-loop / cc-sdd style task-list execution. | Spec-writer and verifier-author work that needs human eyes after each step. |

**Rule of thumb.** If the task can be stated as "given this issue and this ADR, produce a PR," prefer Codex. If the task is "we need to figure out how to model X," prefer Claude Code. The architect skill exists precisely to push exploratory work back into Claude Code before Codex picks it up.

## Codex configuration mirrors `.claude/`

The `.codex/` directory mirrors `.claude/` so the same discipline ships across both tools:

- `.codex/skills/` — the same five skills as `.claude/skills/`. SKILL.md format is identical.
- `.codex/subagents/` — Codex-side equivalents of `.claude/agents/`. The Codex convention puts subagent definitions under `subagents/` rather than `agents/`; the YAML frontmatter is the same.
- `.codex/commands/` — slash commands. Same shape as `.claude/commands/`.
- `.codex/config.toml` — Codex CLI settings: sandboxing, command allowlist/denylist, MCP server registrations.

When IntentGraph's own MCP server ships in Phase 3, both `.claude/settings.json` and `.codex/config.toml` register it as `intentgraph` over stdio.

## Commands to run before marking work complete

Run these in the workspace root. All three must pass.

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Or invoke `/intentgraph-verify` to run the sequence and refuse to continue on failure.

For DB-touching work add `pnpm migrate:lint`. For configuration-only changes (this file, `.claude/`, `.codex/`, ADRs, `/spec/` markdown) instead run `pnpm tsx scripts/check-agent-config.ts`.

## Skills, subagents, and commands available

These are mirrored to `.codex/` and `.claude/` so both tools see the same discipline.

**Skills** — `.codex/skills/`:
- `intentgraph-architect` — read-only planner. Returns an ADR draft, never code.
- `intentgraph-implementer` — worker for well-scoped tasks. Refuses architectural calls.
- `intentgraph-claudemap-lifter` — enforces the do-not-lift list, requires provenance + `LIFT_LOG.md`.
- `intentgraph-spec-writer` — frontmatter discipline for `/spec/*.md`.
- `intentgraph-verifier-author` — TestGen-LLM filter cascade for property tests and obligations.

**Subagents** — `.codex/subagents/`:
- `intent-extractor` — proposes intent nodes from existing code. Read-only.
- `drift-reconciler` — proposes graph mutations for drift events. Edits only in shadow workspace.
- `code-generator` — forward sync; intent edit → code patch proposal.
- `monitor` — cheap monitor LLM pattern; trace event in, JSON verdict out.
- `adr-writer` — drafts ADRs in `/docs/adr/` for human review.

**Slash commands** — `.codex/commands/`:
- `/intentgraph-init`, `/intentgraph-status`, `/intentgraph-lift <file>`, `/intentgraph-spec <intent-id>`, `/intentgraph-adr <title>`, `/intentgraph-verify`, `/intentgraph-ralph <task-list>`.
- `/intentgraph-ralph-run <phase>`, `/intentgraph-ralph-resume`, `/intentgraph-ralph-status`, `/intentgraph-ralph-cancel` — multi-task autonomous loop. Mirrored from `.claude/commands/`.
- `/codex <task>` — mirrored slash command for symmetry with `.claude/commands/codex.md`. See *Delegating to Codex* below.
- `/qa [--max-lines N]` — mirrored. Audits uncommitted changes via parent self-report plus independent Codex review. See *Auditing your own work* below.

## Auditing your own work

`/qa` is the per-commit gate (rationale in [`docs/adr/0013-qa-self-audit-pattern.md`](./docs/adr/0013-qa-self-audit-pattern.md)). Two passes: parent self-reports what it believes it changed, then a second agent independently audits the diff. The auditor must not be the agent that produced the work — Baker et al. 2503.11926.

In the Claude-Code-driven workflow (the primary use case), the parent is Claude Code and the auditor is Codex via `/codex`. In a Codex-driven session, invoking `/qa` would run Codex under itself, which defeats the design's point. From a Codex session: commit the work, then run `/qa` from a fresh Claude Code session against the prior HEAD, OR (in the autonomous loop) rely on the bash entrypoint `automation/qa.sh` that the Ralph loop calls automatically.

When to use it:

- **Before any commit on phase 3+ work — mandatory.** Phases 3/4/6 have mandatory human checkpoints per ADR-0007. `/qa` is the substrate-level check that a goodwill-compliant agent did not slip a load-bearing decision past review.
- **Before any commit on phase 1–2 work — recommended.** Catches the failure mode where the agent believes a rule was followed but the diff does not show it.
- **After every Ralph task verification gate — mandatory and automatic.** `automation/ralph.sh` calls `automation/qa.sh` between the monitor-LLM gate and the commit step. Severity → action: blockers mark the task blocked, majors halt the loop, minors and nits proceed to commit.

`/qa` is **not** a substitute for the project-wide QA pass that audits committed state at phase boundaries. That pass sweeps the whole repo against the architecture; `/qa` is per-commit. Both should exist.

`/qa` is read-only by design. Writes one file: a Markdown report under `automation/qa-reports/qa-report-<UTC>.md`. No auto-fix, no auto-commit, no source modification.

## Delegating to Codex

`/codex` lives at [`.codex/commands/codex.md`](./.codex/commands/codex.md) (mirrored from `.claude/commands/codex.md`) and wraps `codex exec` in a sandboxed read-only run. The design rationale is in [`docs/adr/0008-codex-bridge.md`](./docs/adr/0008-codex-bridge.md). It is **explicit-only**, never auto-invoked. In practice the parent of a `/codex` run is a Claude Code session — Codex does not invoke itself — but the file lives in `.codex/` for parity so a human reading the Codex config sees the same discipline.

**Use it for:**
- Well-scoped read-only analysis where the package, files, and specific question are already known.
- Second-opinion architecture review when an ADR draft is on the table.
- Parallel investigation while the main thread continues elsewhere.

**Do not use it for:**
- Write work. The wrapper is `--sandbox read-only`; write tasks go through `/intentgraph-ralph` with the human checkpoint.
- Anything in tech-spec phases 3, 4, or 6. Mandatory human checkpoints per ADR-0007; architectural decisions per ADR-0008.
- Anything you want to land in IntentGraph's monitor-LLM trace store later. Codex runs are outside the trace store at this stage; ADR-0008 defers the MCP-registered version to Phase 3.

Every `/codex` invocation logs to `automation/codex-log.jsonl`.

## Autonomous workflow

Multi-task mechanical work in approved phases runs through the bash-loop Ralph implementation in `automation/ralph.sh`, layered on [`cc-sdd`](https://github.com/gotalab/cc-sdd) for spec-driven task generation. Read [`automation/README.md`](./automation/README.md) for the strategy and [`docs/adr/0007-autonomous-workflow.md`](./docs/adr/0007-autonomous-workflow.md) for the rationale.

For Codex specifically: the bash-loop spawns a fresh `codex exec` process per task when invoked with `--cli codex`. Codex's non-interactive mode is the natural fit for the loop's "fresh context, one task, exit" contract. Use Codex for unattended overnight runs of approved high-autonomy phases (1, 2, 5); use Claude Code for the synchronous edit-and-verify cadence on phases that need human judgment between tasks (3, 4, 6).

Hard rules (also enforced in `ralph.sh`):

- The loop only runs against `status: approved` task lists.
- Phases 3, 4, and 6 carry mandatory human checkpoints. Do not lower them.
- Phase 6 ships at `autonomy_level: low`; the loop refuses without per-task approval in `approvals.json`.
- Hard cap of \$200 per loop session.
- The monitor-LLM gate is mandatory in phases 4 and 6; never train any model against its verdicts (Baker et al. 2503.11926).

## Parallel agents and branch state

If a parallel Codex run, Ralph iteration, or Claude Code session is active in this repo, **branching the working tree mid-session can desynchronise its progress.** The other agent may commit on top of the branch you just created, or its `progress.json` may reference a HEAD you've moved off. Before creating a side branch, check `git log --oneline -5` and `automation/sessions/progress.json` for in-flight work, and prefer committing on `main` (or fast-forwarding back) when no isolation is actually required. When isolation *is* required, tell the user so they can pause the parallel agent first.

## What to do when uncertain

- **Read the relevant `tech-spec.md` section.** It's the source of truth. Sections are numbered (1 exec summary, 2 pillars, 3 components, 4 schema, 5 MCP, 6 phase plan, 7 risks, 8 reading list).
- **If a decision is being made: write an ADR.** Use `/intentgraph-adr <title>` to invoke the adr-writer subagent.
- **If the decision is load-bearing and the spec is silent or ambiguous: ask the human.** Don't guess.
- **For load-bearing changes, prefer the architect skill.** It's read-only by design.
- **Before lifting from ClaudeMap, invoke the lifter skill.**

## Working with this project as an agent

- Specs are contracts. Treat `/spec/*.md` and ADRs the way you'd treat a public API.
- Trace artifacts are the architecture's faithfulness mechanism. Do not write code that produces a model call without traversing AgentRunner.
- The repo dogfoods itself. As features land they should be used to develop the next phase.
- See [`docs/architecture.md` § Working with Agents on This Project](./docs/architecture.md#working-with-agents-on-this-project) for the workflow split.
