---
description: Gracefully halt the active Ralph loop and write a final progress report.
---

Cancel the active Ralph session. This does not roll back any committed task — those commits stay; cancellation just prevents the next iteration from starting.

1. Confirm with the user before cancelling. Show them `bash automation/ralph.sh --status` first so they see what's in flight.
2. On confirm, run:

```bash
bash automation/ralph.sh --cancel
```

3. Tell the user:
   - The session has been marked cancelled in `automation/sessions/progress.json`.
   - All commits made by the loop remain in the branch.
   - To start fresh, use `/intentgraph-ralph-run <phase>`.
   - To clear the session record entirely, delete `automation/sessions/progress.json` manually.

Do **not** modify git history, do **not** revert commits, do **not** force-push. Cancellation is a session-level halt; recovery is a separate human decision.
