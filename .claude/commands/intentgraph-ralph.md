---
description: Ralph-loop / cc-sdd bridge. Reads a task list markdown file and executes tasks via the implementer subagent in fresh-context iterations, committing after each success. Usage — /intentgraph-ralph <task-list-path> [--max-iterations N]
argument-hint: <task-list-path> [--max-iterations N]
---

Run a Ralph-loop pass against a task list at `$ARGUMENTS`. The task list is a markdown file with one task per `- [ ] <task>` checkbox line. Each task is executed in a *fresh-context* iteration via the `intentgraph-implementer` skill, committed individually on success, and skipped on failure (after one retry). The loop exits when the list is empty or `--max-iterations` is hit.

## Inputs

- `$1` = task list path (required), e.g., `tasks/phase-2-graph-build.md`.
- `--max-iterations N` (optional, default 20).

## Loop body — repeat until exit condition

1. **Read the task list** from `$1`. Extract the first unchecked task `- [ ] <task>`.
   - If no unchecked tasks remain → exit with "Task list complete."
   - If iteration count ≥ `--max-iterations` → exit with "Max iterations reached. <N> tasks remain."

2. **Sanity-check the task is in scope for the implementer.** If it requires architectural decisions, schema changes, or new specs:
   - Mark the task as `- [!] <task>` (escalation marker) in the file.
   - Skip to the next iteration.

3. **Spawn `intentgraph-implementer`** as a subagent with the task as input. Brief it with:
   - The task text.
   - The relevant spec or ADR references (grep `/spec/` and `/docs/adr/` for the task keywords).
   - The acceptance criterion: "All three of `pnpm typecheck && pnpm lint && pnpm test` pass."

4. **Wait for the implementer to return.** It will report files changed and gate results.

5. **If gate clean:**
   - Run `git add` on the changed files (only the changed ones — do not `git add -A`).
   - Commit with message: `<task text>` (single line, ≤72 chars; truncate with `…` if needed).
   - Mark the task as `- [x] <task>` in `$1`.
   - Increment iteration counter.

6. **If gate red:**
   - One retry: spawn the implementer again with the gate output as additional context.
   - If retry also red: mark the task as `- [!] <task>` and add a comment line `<!-- failed: <one-line reason> -->`. Increment iteration counter. Continue.

7. **Loop.**

## Exit conditions

- All tasks checked → "Task list complete. <N> committed, <M> escalated, <K> failed."
- Max iterations → "Max iterations reached. <N> tasks remain. Resume with `/intentgraph-ralph $1`."
- Hard error (git failure, file not found) → stop and surface to user.

## What this command refuses

- Running without a task list path. If `$ARGUMENTS` is empty, ask for the path.
- Auto-merging escalated tasks. They stay marked `- [!]` for human review.
- Pushing the commits. Only commits locally; the user pushes.
- Running with `--max-iterations` >100 without explicit user confirmation.

## Notes

- The fresh-context-per-iteration discipline matters: each implementer spawn does not see the previous one's reasoning, only the codebase state and the spec. This is the cc-sdd / Ralph pattern.
- Do not batch-mark tasks. One commit per task is the contract.
- If a task implies multiple files, that's fine; the implementer handles it. If the implementer reports it had to touch >10 files, that's a sign the task was too coarse — note in the failure reason and escalate.
