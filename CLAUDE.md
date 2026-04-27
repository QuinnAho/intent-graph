# IntentGraph — Claude Code project memory

> Loaded into every Claude Code session in this workspace. Keep terse. Authoritative source of truth is [`tech-spec.md`](./tech-spec.md) at the repo root — read it before making any architectural call.

## What this project is

IntentGraph is a spec-driven IDE plugin (forked from [QuinnAho/claudemap](./claudemap), MIT) where developers work in a living graph of intent, constraints, decisions, and rationale; AI continuously syncs implementation to the graph in both directions. v1 is TypeScript-only, VS Code-first, dogfoodable in 8–10 weeks. The product wedge is *persistent program theory plus structured verification* — code is a verifiable projection of intent, and the graph is the truth.

## The five architectural pillars

1. **Plugin-first, not standalone IDE.** VS Code extension + WebView panel are the richest client; the same skill subprocess is consumed identically by Claude Code and Codex CLIs. One MCP server, three clients. See [`docs/adr/0001-plugin-first.md`](./docs/adr/0001-plugin-first.md).
2. **Relational graph store as substrate.** better-sqlite3 (WAL) + sqlite-vec + Drizzle ORM is the single store. Hash-chained `event_log` is canonical; current-state tables are a deterministic projection. JSON is for export only, never for storage. See [`docs/adr/0002-relational-graph-store.md`](./docs/adr/0002-relational-graph-store.md).
3. **Spec-driven loop is the backbone.** Forward sync (intent edit → patch proposal in `git worktree` shadow → preview → apply) and backward sync (`onDidSaveTextDocument` → tree-sitter reparse → 4-tier semantic diff → drift events). Verification backplane attaches obligations to intent nodes. See [`docs/adr/0003-spec-driven-loop.md`](./docs/adr/0003-spec-driven-loop.md).
4. **Agent orchestration is first-class.** Inngest as the durable runner; AgentRunner over Vercel AI SDK v6 is the *only* path to model providers; three-tier routing (T0 hot / T1 warm / T2 frontier); leases with fence tokens + per-row OCC make state causally consistent. See [`docs/adr/0004-agent-orchestration.md`](./docs/adr/0004-agent-orchestration.md).
5. **Faithfulness via architecture, not training.** Every agent action records concrete artifacts (tool calls, retrieved node IDs, model + version, verifier outcomes, monitor verdict). A cheap monitor LLM (Llama 3.3 70B on Groq) gates every commit + 5% sample + always on `safety_critical`. Never train any IntentGraph component against the monitor's signal. See [`docs/adr/0005-faithfulness-by-architecture.md`](./docs/adr/0005-faithfulness-by-architecture.md).

## Hard rules

These rules are load-bearing for the thesis. Violating them invalidates the architecture, not just style. The ESLint `intentgraph/agent-runner-only` rule and CI enforce most of them.

- **AgentRunner-only model calls.** No file outside `packages/skill/src/agent-runner/` may import `generateText | streamText | generateObject | streamObject | embed | embedMany` from `ai`. Every model call must traverse AgentRunner so a `trace_event` row is recorded. The ESLint rule is in [`eslint.config.mjs`](./eslint.config.mjs).
- **No JSON-as-storage.** SQLite is the substrate. Markdown under `/spec/` and `graph.json` exports are dumps you can round-trip from, never sources.
- **Do not lift these from ClaudeMap.** Contracts, handlers, cache layer, enrichment pipeline, JSON storage. Lift the React Flow shell, the layout pipeline (ELK in worker), and the Zustand store patterns. Every lifted file carries a provenance header and an entry in `LIFT_LOG.md`. See the `intentgraph-claudemap-lifter` skill.
- **TypeScript strict everywhere.** No `any`, no `// @ts-ignore` without an ADR reference. `tsconfig.base.json` is the source.
- **No second graph model.** Inngest's task graph IS the IntentGraph task subgraph. Do not introduce LangGraph, Mastra, CrewAI, or AutoGen.
- **Never fine-tune against monitor signal.** Hard rule from ADR-0005, Baker et al.'s obfuscation-tax warning.
- **Specs under `/spec/` are contracts.** They have YAML frontmatter and verified-by links. Use the `intentgraph-spec-writer` skill to add or change them.
- **Architectural decisions are ADRs under `/docs/adr/`.** Numbered sequentially, immutable after acceptance, supersede with a new ADR.

## Directory layout

| Path | Purpose |
|------|---------|
| `tech-spec.md` | Authoritative spec. Read before architectural decisions. |
| `CLAUDE.md` (this file) | Project memory loaded into every Claude Code session. |
| `AGENTS.md` | Codex-equivalent project memory; same rules, Codex conventions. |
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
| `/.claude/` | Claude Code project config: skills, agents, commands, settings. |
| `/.codex/` | Codex parity: same skills and commands adapted to Codex conventions. |

## Dogfooding ladder

Phases gate on dogfooding maturity (L0–L3), not feature count. The team's own intents must work for L0 before L1 starts.

| Level | Gate | What works |
|-------|------|------------|
| **L0** (end of Phase 2) | `pnpm build && open app/dist/index.html` shows IntentGraph's own intents and code modules. New team member finds an intent visually within 60s. | Static graph build from `/spec/*.md` + tree-sitter walk → `graph.json` + seeded SQLite. |
| **L1** (end of Phase 3) | Editing `/spec/intents/auth.md` in VS Code updates the on-screen graph within 2s without restart. `git diff` after a UI edit shows clean human-readable markdown. | MCP server + bidirectional markdown sync + VS Code extension v0.1 + TipTap node editor. |
| **L2** (end of Phase 4) | In one week of normal team coding, ≥80% of symbol-vs-intent drift is auto-detected and ≥50% of suggestions are accepted as-is. | Drift detection + AgentRunner + Inngest + monitor LLM + patch proposal mode + 5s undo. |
| **L3** (end of Phase 5) | CI fails when `verify.run --strict` shows any drift on the team's repo. Tool writes new intent stubs from PR commits and asks the author to confirm. For 4 consecutive weeks, no merged PR contains an undocumented exported symbol. | sqlite-vec + voyage embeddings + HippoRAG-style PPR + eval harness in CI + audit/replay. |

Beyond L3: Phase 6 hardening + first external pilot users; Phase 7 Python (v1.1); Phase 8 Go *or* Rust (v2). See `tech-spec.md` §6 for the full effort table.

## Commands to run before marking work complete

Run these in the workspace root. All three must pass.

```bash
pnpm typecheck         # TypeScript strict across the monorepo
pnpm lint              # ESLint, including the AgentRunner chokepoint rule
pnpm test              # Vitest across all packages
```

Or invoke `/intentgraph-verify` to run the sequence and refuse to continue on failure.

For DB-touching work add `pnpm migrate:lint` (Atlas migration linter). For configuration-only changes (this file, `.claude/`, `.codex/`, ADRs, `/spec/` markdown) instead run `pnpm tsx scripts/check-agent-config.ts`.

## Commit style

- Subject line is **all lowercase**, **one sentence**, no trailing period.
- No `Co-Authored-By: Claude` trailer. No assistant signature anywhere in the message.
- Body, if needed, cites file:line that changed and the relevant qa-report or ADR ID so future audits can grep for it.

## Skills, subagents, and commands available

These live under `.claude/`. Use them — they encode the project's discipline.

**Skills** (Skill tool, autoload by description):
- `intentgraph-architect` — read-only planner. Activates on architectural decisions, schema changes, tech-spec interpretation. Returns an ADR draft, never code.
- `intentgraph-implementer` — worker for well-scoped tasks. Refuses architectural calls, escalates to architect.
- `intentgraph-claudemap-lifter` — enforces the do-not-lift list, requires provenance headers and `LIFT_LOG.md` updates.
- `intentgraph-spec-writer` — frontmatter discipline for `/spec/*.md`.
- `intentgraph-verifier-author` — TestGen-LLM filter cascade for property tests and obligations.

**Subagents** (`Agent` tool, fresh-context workers):
- `intent-extractor` — proposes intent nodes from existing code. Read-only.
- `drift-reconciler` — proposes graph mutations for drift events. Edits only in shadow workspace.
- `code-generator` — forward sync; intent edit → code patch proposal.
- `monitor` — cheap monitor LLM pattern; reads a trace event, returns JSON verdict.
- `adr-writer` — drafts ADRs in `/docs/adr/` for human review.

**Slash commands**:
- `/intentgraph-init` — bootstraps a session: reads CLAUDE.md, lists gates, surfaces open ADRs.
- `/intentgraph-status` — current phase, next gate, blockers, in-flight work.
- `/intentgraph-lift <file>` — invoke the lifter against a ClaudeMap reference file.
- `/intentgraph-spec <intent-id>` — open or create an intent markdown file with prefilled frontmatter.
- `/intentgraph-adr <title>` — invoke the adr-writer subagent.
- `/intentgraph-verify` — runs typecheck + lint + test in sequence; refuses to continue on failure.
- `/intentgraph-ralph <task-list>` — Ralph-loop pattern: execute a task list via the implementer in fresh-context iterations, commit after each success. (Single-task invocation.)
- `/intentgraph-ralph-run <phase>` — start a multi-task Ralph session against `automation/tasks/<phase>/tasks.json`.
- `/intentgraph-ralph-resume` — resume the most recently interrupted Ralph session from `automation/sessions/progress.json`.
- `/intentgraph-ralph-status` — report the active session's progress (completed, blocked, cost, time).
- `/intentgraph-ralph-cancel` — gracefully halt the active session and write a final report.
- `/codex <task>` — delegate a bounded read-only task to the Codex CLI; output comes back as a quoted block. See *Delegating to Codex* below.
- `/qa [--max-lines N]` — audit uncommitted changes via self-report plus independent Codex review. See *Auditing your own work* below.

## Auditing your own work

`/qa` is the per-commit gate. It runs in two passes: Claude self-reports what it believes it changed and which hard rules apply, then `/codex` independently audits those claims against the actual diff. The auditor must not be the agent that produced the work — that is the principle from Baker et al. 2503.11926 (a weaker monitor detects reward hacking on a stronger reasoner) carried over into the dev-time loop. Design rationale: [`docs/adr/0013-qa-self-audit-pattern.md`](./docs/adr/0013-qa-self-audit-pattern.md).

When to use it:

- **Before any commit on phase 3+ work — mandatory.** Phases 3, 4, and 6 carry mandatory human checkpoints per ADR-0007; `/qa` is the substrate-level safety net so a Claude session with goodwill compliance does not slip a load-bearing decision past the human review.
- **Before any commit on phase 1–2 work — recommended.** The cost is a short Codex run; the benefit is catching the failure mode where Claude believes a rule was followed but didn't actually follow it.
- **After every Ralph task completes verification — mandatory and automatic.** `automation/ralph.sh` invokes [`automation/qa.sh`](./automation/qa.sh) (the bash entrypoint) after every successful `verify.sh` + `monitor-llm.sh` gate. Severity → action: blockers mark the task blocked, majors halt the loop, minors and nits proceed to commit.

`/qa` is **not** a substitute for the project-wide QA pass that audits committed state at phase boundaries (the kind that produced [`docs/qa/qa-report-001.md`](./docs/qa/qa-report-001.md)). That pass sweeps the whole repo against the architecture; `/qa` is per-commit and per-task. Both should exist; neither replaces the other.

`/qa` is read-only by design. It writes one file: a Markdown report under `automation/qa-reports/qa-report-<UTC>.md`. It does not auto-commit, does not auto-fix, and does not modify any source file.

## Delegating to Codex

`/codex` wraps `codex exec` in a sandboxed read-only run for cases where Codex's perspective is useful inside a Claude Code session. The wrapper is documented in [`.claude/commands/codex.md`](./.claude/commands/codex.md) and the design rationale is in [`docs/adr/0008-codex-bridge.md`](./docs/adr/0008-codex-bridge.md). It is **explicit-only** — never auto-invoked from context matching.

**Use it for:**
- Well-scoped read-only analysis where the package, files, and specific question are already known.
- Second-opinion architecture review when an ADR draft is on the table and the human wants a perspective trained on a different distribution.
- Parallel investigation while you continue the main thread in Claude Code (e.g., "while I keep editing the schema, ask Codex to audit `packages/skill/src/db/` for missing indices").

**Do not use it for:**
- Write work. The wrapper is `--sandbox read-only`; write tasks go through `/intentgraph-ralph` or a manual implementer pass with the human checkpoint.
- Anything in tech-spec phases 3, 4, or 6 (MCP server, drift+monitor, hardening). Those phases have mandatory human checkpoints per ADR-0007 and architectural decisions per ADR-0008. The command refuses these.
- Anything you want to land in IntentGraph's own monitor-LLM trace store later. Codex runs are outside the trace store at this stage; ADR-0008 defers the MCP-registered version to Phase 3. If faithfulness-tracking matters, run the work through AgentRunner instead.

Every `/codex` invocation logs to `automation/codex-log.jsonl` (timestamp, task summary, exit code, duration, tokens when reported).

## Autonomous workflow

For mechanical implementation work in approved phases, IntentGraph uses a two-layer autonomous workflow: [`cc-sdd`](https://github.com/gotalab/cc-sdd) for spec-driven task generation, and a bash-loop Ralph implementation in `automation/ralph.sh` that executes tasks one fresh-context iteration at a time. Read [`automation/README.md`](./automation/README.md) for the full strategy and [`docs/adr/0007-autonomous-workflow.md`](./docs/adr/0007-autonomous-workflow.md) for the rationale.

Hard rules for the loop (also enforced in `ralph.sh`):

- The loop only runs against `status: approved` task lists; drafts are refused. Approval flow is in [`automation/tasks/APPROVAL.md`](./automation/tasks/APPROVAL.md).
- Phases 3, 4, and 6 carry mandatory human checkpoints because they involve architectural decisions; the loop will get those wrong. Do not edit the task lists to lower the checkpoint requirement.
- Phase 6 ships at `autonomy_level: low`; the loop refuses to execute it without explicit per-task approval in `approvals.json`.
- Hard cap of \$200 per loop session; cannot be raised from inside the script.
- The monitor-LLM gate (`automation/monitor-llm.sh`) is mandatory in phases 4 and 6; never train any model against its verdicts.

## Parallel agents and branch state

If a parallel Claude Code session, Ralph iteration, or background agent is active in this repo, **branching the working tree mid-session can desynchronise its progress.** The other agent may commit on top of the branch you just created, or its `progress.json` may reference a HEAD you've moved off. Before creating a side branch, check `git log --oneline -5` and `automation/sessions/progress.json` for in-flight work, and prefer committing on `main` (or fast-forwarding back) when no isolation is actually required. When isolation *is* required, tell the user so they can pause the parallel agent first.

## What to do when uncertain

- **Read the relevant `tech-spec.md` section.** It's the source of truth. Sections are numbered (1 exec summary, 2 pillars, 3 components, 4 schema, 5 MCP, 6 phase plan, 7 risks, 8 reading list).
- **If a decision is being made: write an ADR.** Use `/intentgraph-adr <title>` to invoke the adr-writer subagent. Even if you think the decision is small, if it constrains future work, it's load-bearing.
- **If the decision is load-bearing and the spec is silent or ambiguous: ask the human.** Don't guess. The cost of a bad architectural call cascades; the cost of a 60-second ask is zero.
- **For load-bearing changes, prefer the architect skill.** It's read-only by design — it cannot accidentally implement the wrong thing.
- **Before lifting from ClaudeMap, invoke the lifter skill.** It gates against the do-not-lift list.

## Working with this project as an agent

- Specs are contracts. Treat `/spec/*.md` and ADRs the way you'd treat a public API.
- Trace artifacts are the architecture's faithfulness mechanism. Do not write code that produces a model call without traversing AgentRunner.
- The repo dogfoods itself. As features land they should be used to develop the next phase. If a change makes dogfooding harder, it's probably wrong even if the diff is clean.
- See [`docs/architecture.md` § Working with Agents on This Project](./docs/architecture.md#working-with-agents-on-this-project) for the workflow split between Claude Code and Codex.
