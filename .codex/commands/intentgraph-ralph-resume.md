---
description: Resume the most recently interrupted Ralph loop from automation/sessions/progress.json.
---

Resume the most recent Ralph loop. Do not start a fresh session.

1. Read `automation/sessions/progress.json`. If it does not exist, tell the user there is no session to resume and stop.
2. If `progress.json` has a `cancelled_at` field, tell the user the previous session was explicitly cancelled and ask whether to start a fresh run with `/intentgraph-ralph-run` instead.
3. Show the user the session summary: phase, started_at, completed count, blocked count, cost_so_far_usd, in_flight task. Wait for confirmation.
4. On confirm, run:

```bash
bash automation/ralph.sh --resume
```

Stream output. After return, run `bash automation/ralph.sh --status` and summarize as `/intentgraph-ralph-run` does.
