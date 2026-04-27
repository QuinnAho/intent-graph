# Task list approval

Every `tasks.json` ships with `"status": "draft-needs-human-approval"`. `ralph.sh` refuses to execute a draft. This document is the approval flow.

## Why this exists

Task lists are *contracts with the loop*. Once approved, the loop will work through them in fresh-context iterations and commit after each success. A bug in the task list (wrong scope, missing dependency, wrong spec reference, wrong completion signal) repeats every iteration — the loop is "deterministically bad" by design.

So: a human reads the draft, edits anything wrong, and signs the approval before the loop runs.

## The flow

1. **Read the draft.** Open `automation/tasks/<phase>/tasks.json`. Read every task end-to-end. Look for:
   - **Scope creep** — does any task try to do too much in one fresh-context iteration? Target ≤30 min of agent work.
   - **Missing dependencies** — does task `p1-t05` mention something `p1-t02` was supposed to produce but doesn't?
   - **Wrong spec references** — does the `spec_reference` actually contain the rules the task should follow?
   - **Vague completion signals** — is `completion_signal` a string the agent will produce naturally, or a token unlikely to appear by accident? Good: `PHASE1_T01_DONE`. Bad: `done`.
   - **Architectural calls in disguise** — does any task require a judgment that should produce an ADR? If yes, set `human_checkpoint: true` or `blocked_on_decision: "ADR-NNNN required"` instead of approving.

2. **Edit freely.** This is a draft. Add tasks, remove tasks, rewrite scope. Do not preserve the original out of politeness.

3. **Set `status` to `approved` and fill in `approval`.**

   ```json
   {
     "status": "approved",
     "approval": {
       "approved_by": "Quinn Aho",
       "approved_at": "2026-04-26T15:00:00-07:00",
       "git_commit_hash": "<hash of the commit that flips the status>"
     }
   }
   ```

   `approved_by` should match `git config user.name`. `approved_at` is the local time you signed. `git_commit_hash` you fill in *after* committing the approval — the schema validator allows the placeholder during the edit, but the CI workflow rejects a PR where the hash doesn't resolve to a real commit.

4. **Commit.** Single commit per approval, subject `chore(automation): approve <phase> task list`. Body should call out anything you changed from the draft and any tasks you flagged for `human_checkpoint`.

5. **Push and let CI verify.** `.github/workflows/automation-check.yml` will:
   - Re-validate the tasks.json against `automation/tasks/schema.json`.
   - Check that `approval.git_commit_hash` resolves to an ancestor commit.
   - For phases 3+, check that a referenced ADR exists if `blocked_on_decision` is null but the phase normally requires one.

## What `ralph.sh` enforces at runtime

Even if a task list is approved, `ralph.sh` adds runtime checks:

- **`autonomy_level: low` is never executed.** Phase 6 ships at `low`; tasks there require explicit per-task human approval recorded in `automation/tasks/phase-6-hardening/approvals.json`.
- **`status: draft-needs-human-approval` is never executed.** Even with `--force`, the script refuses.
- **`human_checkpoint: true` tasks** require the task ID to appear in `approvals.json` next to the tasks.json with a fresh approval timestamp.
- **`blocked_on_decision` non-null** causes the task to be skipped with a clear log message; the loop does not abort.

## What you cannot do

You cannot approve a task list with `autonomy_level` higher than the tech-spec section 6 phase classification. The CI workflow checks the level matches the documented phase autonomy in `automation/README.md`. Edit one or the other deliberately, with a corresponding ADR if the change is structural.

## Revoking approval

To withdraw approval, change `status` back to `draft-needs-human-approval` and clear the `approval` block. Commit. Any in-flight loop session sees the change on its next iteration's task-list reload and aborts cleanly.
