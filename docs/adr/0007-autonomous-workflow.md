# ADR 0007 — Autonomous workflow: cc-sdd + bash-loop Ralph

## Status

Accepted 2026-04-27. The "future model-fine-tune CI check" clause is partially superseded by ADR-0012 (deferral until first fine-tune script lands).

## Context

Mechanical implementation work in this codebase — wiring scaffolds into working code, applying decided patterns across many files, generating tests against a frozen interface — is bounded but voluminous. Doing it by hand is slow; doing it inside a single live Claude Code or Codex session is faster but unsafe at scale because long sessions accumulate context, and by iteration ten the agent is reasoning over nine prior iterations of its own output rather than the spec.

We need a workflow that lets the project run mechanical work unattended overnight, gates every iteration on real verification, and refuses to act when the work requires architectural judgment.

## Decision

Adopt a two-layer autonomous workflow:

1. **[cc-sdd](https://github.com/gotalab/cc-sdd)** as the structured-spec harness. It packages the `kiro-discovery → kiro-spec-init → kiro-spec-requirements → kiro-spec-design → kiro-spec-tasks → kiro-impl` flow as skills installable into both `.claude/skills/` and `.codex/skills/` from a single command. This matches the project's dual-assistant requirement (CLAUDE.md and AGENTS.md both load the same skill surface) and produces the task lists that the loop consumes.
2. **A bash-loop Ralph implementation** in `automation/ralph.sh`, executing those task lists one fresh-context iteration at a time. Each iteration spawns a clean `claude` (or `codex`) process with a clean prompt. State persists only through git history, the file system, and `automation/sessions/progress.json`. No conversation memory crosses iterations.

We **reject** the single-session Anthropic `ralph-wiggum` plugin (verified to exist at `anthropics/claude-code/blob/main/plugins/ralph-wiggum/README.md`). It uses a Stop hook to re-feed the same prompt inside one Claude Code session. That re-uses the prior context window, which is exactly the failure mode the bash-loop pattern exists to avoid. The plugin is appropriate for short single-session tasks; it is the wrong tool for an overnight sweep across ten tasks.

## Phase-aware autonomy levels

Autonomy maps to the dogfooding ladder in `tech-spec.md` §6:

| Phase | Topic | Autonomy | Monitor-LLM gate |
|---|---|---|---|
| 1 | Fork & cleanup | high | optional |
| 2 | Static graph build → L0 | high | optional |
| 3 | MCP server + bidir sync → L1 | medium | recommended |
| 4 | Drift + AgentRunner + monitor → L2 | medium-low | **mandatory** |
| 5 | Retrieval + eval → L3 | high | optional |
| 6 | Hardening + first external users | low | **mandatory** |

The autonomy level is read from each phase's `tasks.json` and enforced by `ralph.sh` before any iteration starts. The script refuses to execute `autonomy_level=low` task lists at all — phase 6 ships at `low` and requires explicit per-task human approval recorded in `automation/tasks/phase-6-hardening/approvals.json`.

Phases 3, 4, and 6 carry mandatory human checkpoints because those phases involve architectural decisions: the MCP tool surface (phase 3); the trace-event shape, diff ladder hyperparameters, and monitor verdict schema (phase 4); marketplace publishing, multi-workspace, and privacy controls (phase 6). The loop will get these wrong and the wrong answers will pin every downstream phase. The checkpoint requirement is **not negotiable** even if it slows the build.

## Cost caps

`ralph.sh` enforces three cost guards:

- **Per-task max iteration count** (default 15) — small enough to bound a single task's cost, large enough that a competent agent finishes well-scoped work.
- **Per-session cost cap** (default \$100, declared in each `tasks.json`) — abort cleanly when reached and emit a partial-progress report.
- **Hard cap of \$200 per session** — circuit breaker, not a budget. Cannot be raised from inside the script. Any task list with `max_total_cost_usd > 100` requires a justification field in the JSON.

The dollar figures themselves are placeholder estimates pending real measurement; see `automation/README.md` § *Cost estimates are unverified*.

## Monitor-LLM gate

After every task that completes verification, an external `automation/monitor-llm.sh` calls Groq's Llama 3.3 70B with the just-committed diff and the task's stated intent. It returns the JSON verdict shape from `tech-spec.md` §4: `{flagged, score, categories, evidence, recommended_action ∈ {allow, require_human_review, block}}`. A non-`allow` verdict halts the loop and waits for human review.

This is a **separate process** from any in-session monitor subagent (e.g. `.claude/agents/monitor`). The subagent works during a single Claude Code session; the script works at the loop level — across many sessions and in CI — where the bash loop runs.

The gate is **mandatory in phases 4 and 6** and optional elsewhere. We never train any IntentGraph component against the monitor's verdicts (per Baker et al. 2503.11926, the obfuscation tax). This is restated as a hard rule in `automation/README.md`, in the agent prompt template inside `ralph.sh`, and as a CI check that any future model-fine-tune script does not consume `monitor-*.json` artifacts.

## Three-failure abort

`ralph.sh` aborts the entire session when three consecutive tasks fail (verification gate, agent missing the completion signal, monitor halt, etc.). This is the "deterministically bad" signal the snarktank/ralph philosophy demands: if the same shape of failure repeats, the loop is in the wrong direction and human eyes are required.

## Hard rules enforced in code

- The loop never runs `git push`, `npm publish`, or any network-mutating command.
- The loop never modifies `.env`, `.env.*`, `**/secrets/**`, or files outside the workspace root.
- The loop refuses to start in a working tree with uncommitted, unrelated changes.
- The loop refuses to execute `autonomy_level=low` task lists, `status: draft-needs-human-approval` task lists, or tasks with `human_checkpoint: true` lacking an entry in `approvals.json`.

## Decisions made during this implementation pass that aren't in the parent prompt

- **ADR number is 0007, not 002.** The repo's ADR convention is `NNNN-slug.md` with four-digit zero-padded numbers, sequential. `ADR-002-autonomous-workflow.md` would conflict with the existing `0002-relational-graph-store.md` and break the convention. The prompt's `ADR-002` label is treated as informal naming; the file-on-disk follows the convention.
- **Tech-spec filename normalised to lowercase `tech-spec.md`.** Done for Linux CI compatibility; the existing `Tech-Spec.md` would have been a different file on a case-sensitive filesystem. CLAUDE.md and STRUCTURE.md still reference the old casing in places — fixing those is a separate sweep.
- **Slash commands placed directly in `.claude/commands/`** (which existed at the time of this pass), not staged in `automation/staging/commands/`. The agent-config parallel pass had landed the commands directory; the four new commands extend the existing pattern.
- **The pre-existing `/intentgraph-ralph <task-list>` command** (referenced in CLAUDE.md from the agent-config pass) is the **single-task** invocation; the four `-run`/`-resume`/`-status`/`-cancel` commands added here are the **multi-task session** layer on top. They are complementary, not duplicates.
- **Bash-loop validation strategy.** `ralph.sh` prefers `ajv-cli` for full JSON-Schema validation, falls back to `npx ajv-cli` if available, and degrades to a minimal `jq`-based check otherwise. The CI workflow always uses `ajv-cli` so the strict path is enforced at PR time even if a developer's local environment lacks it.

## Consequences

- New mechanical work in approved phases lands in coherent task-sized commits with a clear audit trail (commit message, verification log, monitor verdict, prompt file).
- The first real loop run is also the first real cost measurement; we cannot accurately budget until then. Defaults are placeholders.
- Phase 3, 4, and 6 task lists are stubs until ADRs land. The CI workflow rejects any approved phase 3+ task list whose tasks reference an ADR that doesn't exist on disk.
- A bug in a task list repeats every iteration. The approval process in `automation/tasks/APPROVAL.md` is the place to catch this — once a list is approved and the loop starts, the deterministically-bad behavior is the loop's contract, not its bug.
