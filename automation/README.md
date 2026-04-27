# Autonomous workflow

The IntentGraph autonomous workflow runs **mechanical implementation work** unattended against an approved task list. It is built on two layered tools:

1. **[cc-sdd](https://github.com/gotalab/cc-sdd)** — installs the `kiro-*` skill family into both `.claude/skills/` and `.codex/skills/`. Provides the discovery → spec-init → requirements → design → tasks → impl flow that produces task lists in the first place.
2. **A bash-loop Ralph implementation** ([`ralph.sh`](./ralph.sh)) — executes those task lists one fresh-context iteration at a time. Each iteration spawns a clean agent, runs it against one task, gates on verification + monitor-LLM verdict, commits on success, and moves on.

The bash-loop pattern is non-negotiable. Single-session loops (e.g. the `ralph-wiggum` Claude Code plugin, which uses a Stop hook to re-feed the same prompt inside one session) accumulate context bloat that defeats the point — by iteration 10 the agent is reasoning over 9 prior iterations of its own output. A bash loop guarantees *every iteration is a fresh context window*, with state passed only through git, the file system, and `progress.json`.

See [`/docs/adr/0007-autonomous-workflow.md`](../docs/adr/0007-autonomous-workflow.md) for the full decision record.

## When to use this

- **Use it for** mechanical implementation work where the design is already locked: scaffolding files, wiring up boilerplate, applying a known pattern across multiple files, writing tests against a frozen interface, doing a renames-and-imports sweep.
- **Use it inside an approved phase** with `autonomy_level` of `high`, `medium`, or `medium-low` (see autonomy table below). Autonomy `low` phases are explicitly blocked from autonomous execution.
- **Run it overnight** for high-autonomy phases. Read the `progress.json` and the per-task commits in the morning.

## When NOT to use this

The loop is the wrong tool when the task requires **judgment**. Specifically:

- **Architectural decisions.** Anything that would normally produce an ADR. The loop will write *something* but it won't be the right something — and once committed, the wrong abstraction will pin every subsequent task.
- **Schema design.** Drizzle schema, Zod schemas, MCP tool surfaces. These have downstream consequences that span phases. Hand-design them.
- **MCP surface design.** Tool names, input/output shapes, error conventions. The skill is the substrate; the MCP surface is its API. Design it deliberately.
- **Anything mid-phase that hits a "we should think about this" moment.** Stop the loop, write the ADR, then resume.

If you're unsure, the test is: *would I be uncomfortable reviewing 50 of these decisions back-to-back in a single PR?* If yes, it's not a Ralph task.

## Phase-aware autonomy levels

Autonomy maps to the dogfooding ladder in `tech-spec.md` §6. Phases with architectural decisions baked in (3, 4, 6) require human checkpoints; phases that mechanically apply already-decided patterns (1, 2, 5) can run more freely.

| Phase | Topic | Autonomy | Monitor-LLM gate | Notes |
|---|---|---|---|---|
| Phase 1 | Fork & cleanup | **high** | optional (`--monitor`) | Mostly file moves, JS→TS conversions, dependency pinning. Mechanical. |
| Phase 2 | Static graph build → L0 | **high** | optional (`--monitor`) | Tree-sitter walk, `/spec/*.md` parser, `graph.json` emit. Pattern-application. |
| Phase 3 | MCP server + bidir sync → L1 | **medium** | recommended (`--monitor`) | Tool surface + extension wiring. **Mandatory human review per task.** |
| Phase 4 | Drift + AgentRunner + monitor → L2 | **medium-low** | **mandatory** | The faithfulness layer. Monitor-LLM verdicts gate every task. |
| Phase 5 | Retrieval + eval → L3 | **high** | optional (`--monitor`) | sqlite-vec wiring, eval harness, regression alerts. Mechanical once vec backend is decided. |
| Phase 6 | Hardening + first external users | **low** | **mandatory** | Multi-workspace, marketplace, privacy controls. Loop disabled; tasks run only with explicit per-task human approval. |

The autonomy level is read from each phase's `tasks.json` and **enforced by `ralph.sh`** before any iteration starts. You cannot raise autonomy by editing the script.

## Cost estimates are unverified

> ⚠️ The cost numbers below are **placeholders**, not measurements. The first real loop run is the first real measurement. Update this section once you've measured it on this codebase.

The defaults in `ralph.sh` and the per-phase `max_total_cost_usd` fields:

| Knob | Default | Source |
|---|---|---|
| Per-task max cost | $4 | guess based on T1-tier model + ~15 iterations × ~30K tokens/iter |
| Per-session max cost | $100 (cap), $200 (hard cap) | guess; you cannot raise either above $200 from inside the script |
| Per-iteration token estimate | ~30K input + ~5K output | guess based on a small task with `tech-spec.md` excerpt + diff context |

These will be wrong. Do this on the first three real runs:

1. After every loop session, capture the actual API spend (Anthropic console, OpenAI dashboard, or Vercel AI Gateway dashboard) and log it next to the `progress.json` for that session.
2. After three sessions, compute median cost-per-task and median cost-per-session. Edit the defaults in this README and in `ralph.sh`.
3. If the median cost-per-session exceeds the cap by >20%, raise the cap with an explicit justification in the relevant `tasks.json` `max_total_cost_usd` field — do **not** patch the script's hard cap.

The hard cap of $200 per session is a circuit breaker, not a budget. If you find yourself hitting it routinely, you have a deeper problem (tasks too big, model too expensive, verification gate too lax, etc.) that raising the cap won't solve.

## Manual first-run checklist

The smoke test was deliberately removed from setup — the first real loop run doubles as the smoke test. Watch for each of these:

1. **Task picked up.** `ralph.sh` prints the task ID and title, the spec reference, and the verification commands it will gate on.
2. **Fresh-context spawn.** A new `claude` (or `codex`) process is spawned. Its PID is logged. The process has *no* prior conversation memory.
3. **Agent works the task.** The agent reads the task, the spec excerpt, and the affected files. It edits, runs commands, and emits its completion signal token in its final output.
4. **Verification gate fires.** `ralph.sh` runs `pnpm typecheck && pnpm lint && pnpm test` plus any phase-specific checks. You should see all three exit 0.
5. **Monitor-LLM verdict (if enabled).** `monitor-llm.sh` calls Groq with the diff and the agent's output. A JSON verdict is logged: `{flagged, score, categories, evidence, recommended_action}`. If `recommended_action ∈ {block, require_human_review}`, the loop halts and waits.
6. **Commit lands.** A single commit with the task ID in the subject, the spec reference in the body, and the verification output in the trailer. `git log --oneline -1` shows it.
7. **`progress.json` updated.** The completed task is marked `done`; the next task with satisfied dependencies becomes the next iteration target.

If any step is missing or surprising, **stop the loop** (`/intentgraph-ralph-cancel` or `Ctrl-C`) and investigate before resuming. The loop is "deterministically bad" — a bug here repeats every iteration until you fix it.

## Files in this directory

```
automation/
├── README.md             ← you are here
├── install.sh            ← runs npx cc-sdd install; idempotent; --check verifies post-install
├── ralph.sh              ← the bash loop
├── verify.sh             ← gating verification commands
├── monitor-llm.sh        ← Groq Llama 3.3 70B verdict
├── tasks/
│   ├── schema.json       ← JSON Schema for every tasks.json
│   ├── APPROVAL.md       ← human approval flow for draft task lists
│   ├── phase-1-fork-cleanup/tasks.json
│   ├── phase-2-static-graph/tasks.json
│   ├── phase-3-mcp-bidirectional/tasks.json   (stub, blocked)
│   ├── phase-4-drift-detection/tasks.json     (stub, blocked)
│   ├── phase-5-retrieval-eval/tasks.json      (stub, blocked)
│   └── phase-6-hardening/tasks.json           (stub, blocked)
└── staging/              ← files staged for placement once a missing dependency lands
```

## Slash commands

These live in `.claude/commands/` (and have Codex equivalents under `.codex/commands/` once the agent-config pass lands them):

- **`/intentgraph-ralph-run <phase>`** — start a loop for the named phase (e.g. `phase-1-fork-cleanup`). Refuses to start if `autonomy_level=low` or if the task list is `status: draft-needs-human-approval`.
- **`/intentgraph-ralph-resume`** — resume the most recent interrupted loop from `progress.json`.
- **`/intentgraph-ralph-status`** — print the current loop's progress: completed tasks, in-flight task, blocked tasks, total cost so far, time elapsed.
- **`/intentgraph-ralph-cancel`** — gracefully halt the active loop, write a final progress report, leave the workspace in a committed state.

The pre-existing `/intentgraph-ralph <task-list>` command (referenced in CLAUDE.md from the agent-config pass) is the **single-task** invocation; the `-run`/`-resume`/`-status`/`-cancel` set is the **multi-task session** layer on top.

## Hard rules

These are enforced in code (`ralph.sh` refuses to violate them):

- The loop **never** runs `git push`, `npm publish`, or any network-mutating command.
- The loop **never** modifies `.env`, `.env.*`, files outside the workspace, or any path matching `**/secrets/**`.
- The loop **refuses** to start in a working tree with uncommitted, unrelated changes — this would mix loop output with human work.
- The loop **never** trains, fine-tunes, or otherwise feeds the monitor-LLM's verdicts back into any model. The monitor's job is to detect drift; using its verdicts as a training signal destroys that signal (per Baker et al. 2503.11926, the obfuscation tax).
- Three consecutive task failures **abort** the loop. This is the "deterministically bad" signal — if the same shape of failure repeats, the loop is in the wrong direction and human eyes are required.
