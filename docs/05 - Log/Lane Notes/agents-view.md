---
lane: agents-view
branch: agents-view
worktree: .wt/agents-view
status: ready, starts after lanes 13 and 17 are merged
go: owner, 2026-11-27
---
# Lane 14, second half: who is working on what, on the page

## The ask

The owner, paraphrased: the graph should show which agent is working on what, and the state of the project should be visible at all times.

The first half put the data in `/graph.json` ([[agents]]). This half draws it.

## What exists (read these, not the whole tree)

Paths under `W/` are `packages/webview/src/`. Names are given, not line numbers: lanes 13 and 17 moved the lines. Read the builder notes of [[agents]], [[nested-code]] and [[readable]] first.

- **The data.** `/graph.json` has a list `agents` at the top: for each lane its branch, its worktree as a path from the root (or none for the served checkout), active or idle, the time of its newest change, how many files changed, how many of them are not committed, and the role, model, effort and task from the run log when known. Shape: `LiveActivitySchema` in `packages/shared/src/schemas/activity.ts`. A lane is active when its newest change is younger than 10 minutes.
- **On nodes.** A list `activity` with the lane, its state and how the node is touched: `changed` on a file node or a spec node whose own file a lane changed, `code_changed` on a spec node whose code or test file a lane changed.
- **The page ignores both today.** The loader is `W/transport/graph-json-loader.ts`, live updates go through `W/transport/live-source.ts` and `W/transport/graph-merge.ts`.
- **The bar and a list under it.** `W/app/StateBar.tsx` with its model in `W/app/glance-model.ts`. The problems list opens under the bar (`W/app/ProblemsPanel.tsx`, state in `useProblemsStore`). That is the pattern for a second list.
- **The robot** (`RobotIcon`) means "a model inferred this". It must not be used for an agent at work.
- **Marks on a node** are drawn in `W/graph/nodes/shared/nodeChrome.tsx`. Code rows of an open intent: `W/graph/nodes/CodeRows.tsx`.
- **Picking nodes out**: `data.isDimmed` and `data.highlight` exist on nodes, and `selectOnly()` and `focusNode()` are used by the bar's counts.
- **A real case to look at.** This repo has worktrees under `.wt/` and a run log under `.runs/`, so its own live graph lists real lanes. Most of them are merged and have no changes.
- **The end-to-end script of the first half**, `tools/e2e-agents.mjs`, makes a temp git copy of the example with a worktree and edits a file in it while the server runs.

## Scope

Part A, the data reaches the page:

1. The loader copies `activity` into each node's data and `agents` into the store. A live update that changes only these draws again with no new layout and no move of the view.
2. A mark never changes a node's size.

Part B, the bar:

3. A group "Agents" in the bar. With lanes at work it reads like "2 at work". With only idle lanes that hold changes it reads like "1 idle". With neither it reads "nobody at work", dimmed. It is always there, so the answer is visible at all times.
4. A lane counts as "at work" when it is active. A lane with no changed file and no recent change counts for nothing.

Part C, the list:

5. A click on the group, or Enter on it, opens a list under the bar, in the place the problems list uses. Only one of the two lists is open at a time. Esc or a second click closes it and the focus goes back to the count.
6. One row per lane that is active or holds changes, active ones first, then by newest change. A row shows: the task when the run log gives one, else the branch. Small beside it: the branch, the role and the model when known. A state mark. How long since the newest change, in words such as "3 min ago", kept current without a reload. The files: "5 files, 2 not committed".
7. A long task is cut to one line with the full text in the title. The list is never wider than the window.
8. Lanes with no changed file and no recent change fold into one last line, such as "6 worktrees with no changes". A click unfolds their branch names.
9. A row also says how much of the graph the lane touches: "3 files, 1 intent".

Part D, on the graph:

10. A node touched by a lane carries an "at work" mark. Its shape differs from the robot and from every status mark. Active and idle differ by shape or fill, not by colour alone. With two lanes on one node the mark shows a 2.
11. The mark's title says it in words: who (task or branch, role), what ("is changing this file" or "is changing code this intent is bound to"), and how long ago.
12. A code row of an open intent carries the mark when a lane changed that row's file.
13. A click on a row of the list picks that lane: the nodes it touches are highlighted, the rest dimmed, and the view fits them. Hidden nodes stay hidden, and a concept with a touched, folded node is not unfolded. A second click, Esc, or picking another row clears it. A live update keeps the pick while the lane exists and clears it when the lane is gone.
14. When the lane touches no node of the graph, the row says so and a click does nothing.

Part E, polish:

15. Keyboard: Tab reaches the group, Enter opens the list, Tab or arrow keys move through rows, Enter picks, Esc closes.
16. Everything holds at 900 and 480 px and inside the editor panel. At 480 px the bar still takes two lines at most.
17. The legend gets a row for the mark, active and idle, and the words of the bar's group.
18. A lane with 300 changed files: the page stays usable and an update settles in under 1.5 s.
19. Read only: everything here works on a server without `--write` and sends no request other than GET.
20. A new `tools/e2e-agents-view.mjs` in the style of `e2e-agents.mjs` and `e2e-fold.mjs`: no lane, one active lane with a file an intent is bound to, the marks on the file node, the intent and the code row, the list's numbers against `/graph.json`, pick and clear, two lanes on one file, active to idle, commit, removal, six empty worktrees folded, a long task, read only.
21. Frames under `.runs/frames-lane14/`: the example with one lane at work, the list open, a lane picked, two lanes on one node up close, an open intent with a marked row, this repo read-only at 1440 by 900 with the list open, and the list at 480 px.

## Files the builder may touch

- `packages/webview/src/app/**`, `src/graph/**`, `src/store/**`, `src/styles/**`
- `packages/webview/src/transport/graph-json-loader.ts`, `graph-merge.ts`, `live-source.ts`
- `packages/webview/tests/**`
- `tools/e2e-agents-view.mjs` (new)
- this note: the reuse record and the builder notes

If the work needs a file outside this list, change it and name the file and the reason in the report. No server change: stop and say so if the data is not enough. Do not touch `packages/extension/**`, `packages/skill/**`, `tools/verify.mjs` or anything under `spec/`.

## Acceptance checks

1. `node tools/verify.mjs all` ends with a `PASS all` line, and the test count is not lower than on the lane's base.
2. `node tools/e2e-agents-view.mjs` passes five times in a row. It is a new file.
3. Every other end-to-end script still passes.
4. No new dependency. No existing assertion removed or loosened.
5. The frames of step 21 exist.

## Not in this lane

- Live detail from editor hooks: every edit as it happens, the step an agent is on. A hook is an install and needs the owner's yes.
- What an agent is thinking (lane 15). Starting, stopping or steering an agent from the page.
- "Since when" a lane has been at work: the data holds its newest change only.
- Pruning merged worktrees. That is the owner's call.

## Stop clause

Stop and report after 90 minutes, or if the gate cannot be made green in two tries. If time runs short, finish and commit whole parts in the order A, B, C, D, E and list what is left undone. Stop and say so if the data in `/graph.json` is not enough for a step.

## Reuse record

Looked at before the start, the builder adds what it finds:

- The problems list under the bar: borrow the place, the open and close, the focus rules.
- The bar's counts and `selectOnly()`, `focusNode()`: adopt.
- `Intl.RelativeTimeFormat` for "3 min ago": adopt, it is in every browser.
- VS Code's source control view and GitLens put the count in a bar and the detail in a list. Borrow the idea.

## Builder notes

## Results

## Orchestrator's check
