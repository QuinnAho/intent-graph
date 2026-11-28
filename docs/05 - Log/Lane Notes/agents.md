---
lane: agents
branch: agents
worktree: .wt/agents
status: ready
go: owner, 2026-11-27
---
# Lane 14, first half: which agent is working on what, the data

## The ask

The owner, paraphrased: the graph should show which agent is working on what.

This half makes the data and puts it in `/graph.json`. Drawing it on the page is the second half, after lane 11 is merged, because both touch the same page files.

## The approach

Read what is already on disk. No install, no model call, nothing written.

- Each lane works in its own git worktree on its own branch. So the worktrees of the served repo say who is at work.
- For each worktree: the files it changed against the served checkout, the files changed but not committed yet, and when the newest change happened.
- The run log, when there is one: the newest line that names the worktree gives the role, the model, the effort and the task.

Live detail, every edit as it happens and the step an agent is on, would come from editor hooks. A hook is an install and needs the owner's yes. It is not in this lane.

## What exists (read these, not the whole tree)

- How a reader is added to the live server: `packages/skill/src/live/drift-reader.ts` and `infer-reader.ts` (a path guard, a signature for the poll, one problem for a bad file), and their timers in `server.ts` (`driftPoll`, `inferPoll`, with `driftPollMs` and `inferPollMs` in `tuning.ts`).
- How marks reach a node: `composeLiveGraph` in `packages/skill/src/live/compose.ts` takes the drift and the inference input as optional arguments and writes `drift`, `inferred` and `warnings` on nodes.
- Node ids: a file is `code_module:<path from the repo root>` and a symbol is `code_symbol:<path>#<name>#<hash>` (`packages/skill/src/build-graph.ts`). An intent's code arrives as edges of kind `realizes` from the code node to the intent, and its tests as `verifies`.
- The server already starts child processes for the linked tests: `packages/skill/src/live/test-runner.ts`. It kills only what it started.
- The file watcher ignores `.wt`, `.runs`, `.git` and `node_modules` (`IGNORED_DIRS` in `server.ts`). Leave that as it is: this lane polls git, it does not watch the worktrees.
- The run log: `.runs/<run>/log.jsonl`, one JSON object per line, machine-local. Lines for an agent run carry `lane`, `worktree` (such as `.wt/glance`), `role`, `model`, `effort`, `task`. It is free text written by a person or an orchestrator, so read it leniently.

## Scope

1. A reader, `activity-reader.ts`. It lists the work in progress:
   - `git worktree list --porcelain` in the served root
   - for each other worktree: the files changed on its branch since it left the served checkout's commit, and its uncommitted files
   - the served checkout's own uncommitted files, as one more entry
2. Every git call uses `execFile` with fixed arguments, never a shell, with a 3 second limit, and `--no-optional-locks`, so it never takes a lock an agent in that worktree is waiting for. Only commands that read.
3. Not a git repo, no git on the machine, or a call that runs out of time: no activity, no problem in the list, one log line, and the server keeps serving.
4. Active or idle. A lane is active when its newest change, a file time for uncommitted work or a commit time, is younger than `activeWindowMs` (10 minutes, in `tuning.ts`). Otherwise it is idle: work is there, nobody touched it lately.
5. Who. The newest line of any `.runs/*/log.jsonl` whose `worktree` is this worktree's path from the root, or whose `lane` is its branch, gives `role`, `model`, `effort` and `task` when they are text. Only files under `<root>/.runs` are read. A line that is not JSON is skipped. Nothing found: the branch name is the label.
6. The shape, `LiveActivitySchema` in `packages/shared/src/schemas/activity.ts`: the lane (its branch), the worktree as a path from the root or null for the served checkout, active or idle, the time of the newest change, how many files changed, how many of them are uncommitted, and the four words from the run log when known. Never an absolute path.
7. In `/graph.json`: a list `agents` at the top, and on nodes a list `activity` with the lane, its state and how the node is touched:
   - a file node whose path a lane changed: changed
   - a spec node whose own file a lane changed: changed
   - a spec node with a `realizes` or `verifies` edge from such a file node, or from a symbol of that file: its code is being changed
8. The poll. A timer, `activityPollMs` (5 seconds). The git calls run without blocking the server. A tick is skipped while the last one still runs. The graph is published again only when the result changed.
9. Limits: at most 20 worktrees and 2000 files a lane. Past that the entry says it was cut.
10. Paths from git become paths from the repo root with forward slashes. A path outside the root is dropped. On Windows paths are compared without regard to case.

## Files the builder may touch

- `packages/skill/src/live/**`
- `packages/shared/src/schemas/activity.ts` (new) and its line in the schemas index
- new test files, and new cases in existing test files (never fewer assertions)
- `tools/e2e-agents.mjs` (new)
- this note: "Reuse record", "Builder notes" and "Results" only

Nothing under `packages/webview`. If the work needs a file outside this list, change it and name the file and the reason in the report.

## Acceptance checks

1. `node tools/verify.mjs all` passes and the test count is 494 or more.
2. Tests on a temp git repo, written first: a worktree that changes a file an intent is realized by gives one entry in `agents`, and the file node and that intent carry `activity`, and no other intent does. After a commit it is still listed. With the worktree removed it is gone. A folder that is not a git repo gives nothing and no error. A run log line gives the role, the model and the task. A broken run log, or one that names a path outside the root, is ignored.
3. `node tools/e2e-agents.mjs` passes: the live server on a temp git copy of the example, a worktree made and a file edited in it while the server runs, and `/graph.json` shows the lane on the right nodes within 15 seconds, then follows a commit and the removal. A spawn spy shows the server started nothing but git and the linked test runs. No file in any worktree changed.
4. `tools/e2e-edit.mjs`, `e2e-inferred.mjs`, `e2e-live.mjs`, `e2e-drift-marks.mjs` and `e2e-wires.mjs` still pass.
5. No new dependency. No model call. No absolute path in `/graph.json`.

## Not in this lane

- Anything drawn on the page. Editor hooks. Marks on single symbols. Branches without a worktree, other machines, pull requests.
- The parked lease and task code from the May plan (ADR 0029). This lane reads git, it does not hand out work.

## Stop clause

Stop and report after 60 minutes, or if the gate cannot be made green in two tries. If time runs short, finish and commit whole scope steps in order and list the ones left undone. Steps 1 to 7 come first.

## Reuse record

- The reader follows `drift-reader.ts` and `infer-reader.ts`: pure parsing in `activity-marks.ts`, io in `activity-reader.ts`, a timer in `server.ts`, numbers in `tuning.ts`.
- `composeLiveGraph` takes activity as an optional 7th argument, the same way as drift and inference. Every old caller is unchanged.
- The e2e script reuses the spawn spy from `e2e-inferred.mjs`, logging each call as json so the git arguments can be checked one by one.

## Builder notes

- Git calls: `execFile('git')`, `--no-optional-locks`, `-c core.fsmonitor=false`, a 3 second limit, `-z` output split on NUL. Only `worktree list`, `status`, `diff --name-only` and `log -1`. `GIT_DIR` and its friends are dropped from the env so a caller's variables cannot point the reader at another repo.
- Committed files are `git diff <served HEAD>...HEAD`, so the merge base decides what the branch changed.
- The served checkout gets an entry only when it has uncommitted files. A linked worktree is listed even with no change yet, as idle.
- Paths under `.vite`, `.runs`, `.intentgraph` and `.wt` are left out. The linked test runs leave vitest's cache in `.vite` of the root, and that is nobody's work.
- A failed call drops only that worktree, with a log line. A failed `worktree list` means no agents at all.
- Spec nodes are also marked `code_changed` when a lane changes one of their `verified_by` test files. The graph has no `verifies` edges yet, the marks read them when they come.
- The file walker already ran `git branch --show-current` before this lane. The spawn spy counts it apart from the reader.
- Code node bodies already carry a `file://` uri with an absolute path from the static build. Older than this lane and left as is. The checks cover what this lane adds: `agents` and `activity`.

## Results

- Scope steps 1 to 10 done. Drawing on the page is the second half.
- `node tools/verify.mjs all`: PASS, 516 tests in 50 files.
- `node tools/e2e-agents.mjs`: PASS five times in a row, about 27 s each. The lane shows within one poll (about 5 s), the commit and the removal follow within one more.
- `e2e-edit`, `e2e-inferred`, `e2e-live`, `e2e-drift-marks`, `e2e-wires`: PASS once each, unchanged.
