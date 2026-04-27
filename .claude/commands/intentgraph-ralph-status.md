---
description: Report the active Ralph loop's progress — completed, blocked, cost, time elapsed.
---

Run `bash automation/ralph.sh --status` and present the result in a short human-readable table.

If `automation/sessions/progress.json` does not exist, say "no active or recent Ralph session" and stop. Do not invent state.

Format:

```
Ralph session — <phase>
  Started:     <iso8601>
  CLI:         <claude|codex>
  Cost cap:    $<n>
  Cost spent:  $<n>
  Completed:   <n> tasks
  Blocked:     <n> tasks
  In flight:   <task id or "none">

Last 5 completed:
  - <task id> at <commit hash> — <subject>

Blocked tasks (most recent):
  - <task id> — <reason> (at <iso8601>)
```

Pull commit hashes via `git log --grep "ralph(<task-id>)" -1 --format=%h` for each completed task. If a task is in the completed array but no commit is found, flag that as an inconsistency for the user to investigate — it indicates `commit_task` succeeded internally but the change was reverted.
