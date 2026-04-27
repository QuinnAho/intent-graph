---
description: Start a Ralph autonomous loop for a phase (mechanical impl work in fresh-context iterations). Argument is the phase slug, e.g. phase-1-fork-cleanup.
argument-hint: <phase-slug>
---

Start an autonomous Ralph loop against the phase task list at `automation/tasks/$ARGUMENTS/tasks.json`.

Before invoking the loop, do the following:

1. Read `automation/README.md` once if you have not already; it documents the autonomy levels and the manual first-run checklist.
2. Confirm `automation/tasks/$ARGUMENTS/tasks.json` exists. If it does not, list the directories under `automation/tasks/` and stop.
3. Read the task list. Confirm `status` is `approved`. If it is `draft-needs-human-approval`, refuse to continue and direct the user to `automation/tasks/APPROVAL.md`.
4. Confirm `autonomy_level` is not `low`. If it is, refuse — phase 6 requires per-task explicit human approval.
5. Confirm `cc-sdd` skills are installed: run `automation/install.sh --check`. If it fails, run `automation/install.sh` first (this is the network install — surface the install output to the user).
6. Run `git status --short`. If the working tree has uncommitted changes outside `automation/sessions/`, refuse and tell the user to commit or stash first.

Then invoke:

```bash
bash automation/ralph.sh automation/tasks/$ARGUMENTS/tasks.json
```

Stream the output to the user. After the loop returns (or you halt it via Ctrl-C), run `bash automation/ralph.sh --status` and summarize the result: tasks completed, tasks blocked, total cost, any monitor-LLM verdicts that halted the loop. Point at the per-task commits and at `automation/sessions/progress.json` for the full record.

If the loop returns rc=4 (three consecutive failures) or rc=5 (monitor-LLM halt), stop and ask the user to investigate before resuming. Do not call `--resume` automatically.
