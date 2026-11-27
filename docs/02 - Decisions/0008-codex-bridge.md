# ADR 0008 — Codex bridge: slash command, not auto-invoking skill

## Status

Accepted 2026-04-27.

## Context

IntentGraph runs in a dual-assistant world. Claude Code is the synchronous, edit-and-verify driver. Codex is sometimes a better fit for read-only analysis, parallel investigation, and second-opinion architecture review, especially on tasks where its training distribution differs usefully from Claude's. We need a way for a Claude Code session to delegate a bounded subtask to Codex and pull a clean answer back.

The shape of that bridge is the load-bearing decision. Anthropic's skill system can auto-invoke a skill from semantic matching: a skill named `codex-delegate` with a description like "use when the task needs Codex's perspective" would be triggered by Claude's own reasoning, not by the user. That is the wrong default.

Paddo's post on the controllability problem with skills (https://paddo.dev/blog/claude-skills-controllability-problem/) frames it precisely: *"Skills use LLM reasoning for invocation, which is inherently non-deterministic"* — whereas slash commands give deterministic, deliberate control over when capabilities activate. The post offers four advantages for the slash-command pattern:

- Explicit invocation: the user triggers it, not Claude's semantic reasoning.
- Clear boundaries: the tool runs, returns results, exits cleanly.
- Isolated context: specialized tool output does not pollute the main conversation.
- Predictable cost: the user knows when they are paying for external services.

For a bridge that spends tokens on an *external paid model*, predictable cost is not optional. A skill could trigger a $0.30 Codex run on what looked like a routine question; a slash command cannot. The same logic appears in IntentGraph's own discipline elsewhere: AgentRunner is a chokepoint precisely so model calls are auditable, and ADR-0005 makes faithfulness "via architecture, not training" a load-bearing rule. Letting an auto-invoking skill spend money on an opaque external model would undermine that.

## Decision

Wrap the Codex CLI as a `/codex` slash command in `.claude/commands/codex.md`, mirrored to `.codex/commands/codex.md` for symmetry. The command is explicit-only; it has no `when_to_use` field and is never auto-invoked.

Concrete shape:

- **Frontmatter:** `allowed-tools: [Bash(codex:*), Read, Glob, Grep]` and a one-line `description` that names the menu entry. No invocation triggers.
- **Body:** numbered steps that gather minimal context, build a structured prompt that names the relevant `tech-spec.md` section, run `codex exec` non-interactively in a read-only sandbox, filter the output into a `> [codex]:` block, and log the invocation to `automation/codex-log.jsonl`.
- **Refusal rules:** the command refuses runs that are vaguely scoped, that ask for write work, that touch `tech-spec.md` phases 3 / 4 / 6 (architectural decisions and hardening — see ADR-0007's mandatory human checkpoints), or that need to land in IntentGraph's monitor-LLM trace store later. Codex runs are outside the trace store at this stage; see *Deferred decision* below.
- **Sandbox:** `-s read-only -a never`. The command never writes `--full-auto`, `--sandbox workspace-write`, `--sandbox danger-full-access`, or `--dangerously-bypass-approvals-and-sandbox`, even commented out. Write work goes through the Ralph loop with human checkpoints, not through `/codex`.
- **Output discipline:** Codex's answer is surfaced as a quoted, fenced block, never silently paraphrased — so the parent session reader can always tell which thoughts came from where.
- **Audit log:** every invocation appends a JSON line to `automation/codex-log.jsonl` with timestamp, task summary, exit code, duration, and (when Codex reports them) input/output token counts.

## Flag verification — discrepancy with the paddo.dev template

The paddo.dev post showed `codex exec --search -C <project>...` as the canonical invocation. Verifying against `codex --version 0.121.0` (`@openai/codex` from npm), three things changed:

1. **`--search` is not a flag on `codex exec`.** It exists only on the interactive `codex` entrypoint. `codex exec --help` does not list it. The `/codex` command therefore omits `--search`. If a task genuinely needs web search, the right move is interactive Codex; the read-only delegation pattern does not cover it.
2. **`--full-auto` and `-s read-only` are contradictory.** `codex exec --help` documents `--full-auto` as "Convenience alias for low-friction sandboxed automatic execution (--sandbox workspace-write)" — it overrides the sandbox to `workspace-write`. The user's original spec asked for both `-s read-only` and `--full-auto`; using both would silently grant write access. The command uses `-s read-only` instead.
3. **`-a never` is not accepted by `codex exec`.** An earlier draft of this ADR and of `.claude/commands/codex.md` / `.codex/commands/codex.md` documented `codex exec ... -s read-only -a never ...`. Running that against codex-cli 0.121.0 errors with `unexpected argument '-a' found`. The `-a / --approval-policy` option exists only on the interactive `codex` entrypoint where there is a human to escalate to. `codex exec` is non-interactive by default, so no approval flag is needed and none is accepted. The command files have been updated to drop `-a never`; this section records the correction (per QA report 001, finding F-CODEX-CMD-FLAG, 2026-04-27).

The command's body documents these discrepancies inline so future maintainers re-checking `codex exec --help` can confirm the choice.

The actual flag set used: `codex exec -C <project-root> -s read-only --color never --skip-git-repo-check -` (with the prompt piped on stdin).

## What this decision rejects

- **An auto-invoking `codex-delegate` skill.** Cost unpredictability, semantic-match invocation, context pollution. See the controllability argument above.
- **Running Codex with write access.** The Ralph loop already has the right shape for write work — task list, fresh-context iteration, monitor-LLM gate, human checkpoint where mandated. `/codex` would duplicate that surface badly.
- **Treating Codex output as authoritative.** The output is a quoted second opinion, never a decision. The parent Claude Code session retains the call.

## Deferred decision

When IntentGraph's own MCP server ships in Phase 3 (per ADR-0003 and the `tech-spec.md` §5 MCP surface), revisit whether Codex should be a registered MCP capability rather than a CLI bridge. The MCP path would let Codex runs participate in the trace store (every model call traverses AgentRunner → `trace_event`), which is the gap that currently makes `/codex` refuse runs whose results need to be auditable later. That revisit is a new ADR; this one stays scoped to the pre-MCP CLI bridge.

## Consequences

- A bounded, auditable way to ask Codex a focused question from inside Claude Code, without auto-invocation risk.
- One more file to keep in sync between `.claude/` and `.codex/`. The agent-config check (`scripts/check-agent-config.ts`) already enforces parity for the `.claude/` ↔ `.codex/` mirror; the new file falls under that.
- Codex runs do not currently land in the IntentGraph trace store. The deferred Phase-3 decision addresses this. Until then, `/codex` refuses tasks whose results need a trace artifact later.
- Audit log at `automation/codex-log.jsonl` accrues over time. The CI check should fail PRs that grow it without a corresponding `/codex` invocation in the session record (a small amount of manual hygiene; can be tightened later).
- The flag drift from paddo.dev's template is a reminder that wrapping a third-party CLI bakes its surface into our config. Re-verify `codex exec --help` whenever the `@openai/codex` version bumps; bump this ADR's *Flag verification* section if anything moves.
