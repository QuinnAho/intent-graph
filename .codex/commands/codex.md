---
allowed-tools: [Bash(codex:*), Read, Glob, Grep]
description: Delegate a focused task to Codex CLI for isolated analysis or implementation.
argument-hint: <bounded task description>
---

> Mirrored from `.claude/commands/codex.md` for symmetry across the dual-assistant story. Codex does not invoke itself in practice; this file is here so the `.codex/` and `.claude/` surfaces stay aligned and so a human reading the Codex config sees the same discipline that ships to Claude Code.

Delegate a focused, bounded task to the Codex CLI in a sandboxed read-only run, then return a filtered summary to the parent session.

This command is **explicit-only**. It is never auto-invoked from context matching — invocation is the user's deliberate choice to spend tokens on a Codex run, per the controllability argument in https://paddo.dev/blog/claude-skills-controllability-problem/.

The command does not write code. The Codex run is `--sandbox read-only`, full stop. Any write work goes through the normal Ralph loop with human checkpoints.

## Inputs

- `$ARGUMENTS` — the bounded task. Required. If empty, ask the user for one and stop.

## Refuse the run when

1. **The task scope is not clearly bounded.** It must name the package or files in scope and the specific question or output. If unclear, ask one clarifying question.
2. **The task touches `tech-spec.md` phases 3, 4, or 6.** Mandatory human checkpoints per ADR-0007.
3. **The task asks for write work.** Redirect to `/intentgraph-ralph` or a manual implementer pass.
4. **The user wants the result in IntentGraph's own monitor-LLM trace later.** Codex runs are outside the trace store at this stage — see ADR-0008.

## Steps when running

1. **Verify codex is on PATH.** `codex --version`; fall back to the npm shim path if needed.
2. **Verify current flags.** Run `codex exec --help` and re-confirm the flags below.
3. **Gather minimal project context.** Package, 1–5 reference files, relevant `tech-spec.md` section number. Keep this under ~30s.
4. **Build the prompt** (same shape as `.claude/commands/codex.md`).
5. **Execute Codex** via stdin:
   ```bash
   printf '%s' "<prompt>" | codex exec \
     -C "<project-root>" \
     -s read-only \
     -a never \
     --color never \
     --skip-git-repo-check \
     -
   ```
   Never write `--full-auto`, `--sandbox workspace-write`, `--sandbox danger-full-access`, `--dangerously-bypass-approvals-and-sandbox`, or `--search` (the last is not accepted by `codex exec` in current versions). Bound the run to 5 minutes.
6. **Filter the output** into a `> [codex]:` fenced block — Findings, Answer, Open questions only.
7. **Log the invocation** to `automation/codex-log.jsonl`:
   ```json
   {"ts":"<ISO-8601>","task":"<first 200 chars>","scope":"<package/path>","exit":<int>,"duration_ms":<int>,"tokens":{"input":<int|null>,"output":<int|null>}}
   ```
8. **Report** with a one-line summary.

## Hard rules

- Never write `--full-auto` or any `workspace-write` / `danger-full-access` flag.
- Never auto-invoke this command from context matching.
- Never run for tech-spec phases 3, 4, or 6.
- Never push, publish, or otherwise mutate shared state from inside the Codex run.
- Always log to `automation/codex-log.jsonl`.

See `.claude/commands/codex.md` for the canonical body and rationale; both files must stay in sync.
