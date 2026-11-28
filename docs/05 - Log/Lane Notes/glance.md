---
lane: glance
branch: glance
worktree: .wt/glance
status: ready
go: owner, 2026-11-27
---
# Lane 11: read the graph at a glance

## The ask

The owner, paraphrased: this should be a tool for every day. Today it is hard to tell at first sight what is what and how to use it. The state of the project and the status of the spec should be visible at all times, and what a model inferred should carry a robot icon.

This lane covers the part that needs no new data: the robot, a project state bar, a legend and key hints. Which agent works on what, more of what the AI is thinking, and opening an intent to see its code are later lanes on the [[Board]].

## What exists (read these, not the whole tree)

- Icons come from `lucide-react` (`packages/webview/package.json`). `Sparkles` marks inferred things in three places: the pill on a node (`packages/webview/src/graph/nodes/shared/nodeChrome.tsx`, `InferredRow`), the count in the strip (`src/app/InferredCount.tsx`), and the panel header (`src/app/EditPanel.tsx`). The lucide robot is `Bot`.
- Everything the bar needs is already on the page. The server sends each node with `status` (verified, failed, pending), `status_reasons`, `warnings`, `drift` and `inferred` (`packages/skill/src/live/compose.ts`, `LiveGraphNode`). The page keeps the graph in `src/store/graph-slice.ts`. No server change is needed.
- The marks: `StatusMark` and `DriftMark` in `nodeChrome.tsx`. Kind icons: `src/graph/nodes/nodeIcons.ts`.
- The strip under the canvas: `Notice`, `InferredCount` and `ProblemsPanel` in `src/app/App.tsx`.
- "Select the next one and bring it into view" already works for proposals: `selectNextProposal` in `src/app/inferred-actions.ts`, `nextInferred` in `src/app/inferred-model.ts`, `KeepInView` in `src/graph/GraphCanvas.tsx`.
- The panel sections: Checks, Drift, Warnings and the inferred panel, all in `src/app/EditPanel.tsx`.
- End-to-end pattern with a canned report: `tools/e2e-inferred.mjs` and `tools/e2e-drift-marks.mjs`.

## Scope

1. The robot. Everything a model said and no person confirmed carries one icon, the lucide `Bot`: the inferred pill on a node, the inferred count, the header of the inferred panel, and a drift mark whose verdict was decided by the model. `Sparkles` is gone from the source. The icon has a title in words: read from the code by a model, not confirmed by a person.
2. A project state bar, one row at the top of the page, always visible, never over a node or the panel. It shows, each with its mark and a word:
   - the spec: how many concepts, intents, constraints and decisions are declared
   - checks: verified, failing, pending
   - drift: drift, unclear, aligned, stale, or "no drift report" when there is none
   - inferred: how many proposals are open
   - problems: how many, and a click opens the problems list
3. Every count is a button. A click selects the next node in that state and brings it into view, clear of the panel. A second click goes to the one after. A count of zero is shown dim with a title, not hidden, so the bar never jumps.
4. The bar follows the live graph with no reload.
5. A legend. A "?" button at the end of the bar opens it. It explains, with the real components so it cannot go stale: each node kind with its icon and one line, solid against dashed with the robot, every mark with one line, pins and the count on a pin, and the keys (Enter, F2 or a double-click, Delete, Ctrl+Z, right-click, drag from a pin). It opens by itself on the first visit and stays closed after that. Esc closes it and focus goes back to the button.
6. Every mark and pill has a title that says what it means in words.
7. Key hints before selecting: an inferred node shows its keys on hover and on keyboard focus.
8. Read only is said once in the bar, with the reason, not only inside the panel.
9. Polish, the last step: open every frame you took and fix what looks off.

## Files the builder may touch

- `packages/webview/src/app/**`, `src/graph/**`, `src/store/**`, `src/styles/**`, `src/transport/**`
- new test files, and new cases in existing test files (never fewer assertions)
- `tools/e2e-glance.mjs` (new)
- this note: "Reuse record", "Builder notes" and "Results" only

If the work needs a file outside this list, change it and name the file and the reason in the report.

## Acceptance checks

1. `node tools/verify.mjs all` passes and the test count is 494 or more.
2. `node tools/e2e-glance.mjs` passes on a temp copy of the example with a canned inference report and a canned drift report, with real clicks and keys: every number in the bar equals the number the script counts in `/graph.json`, a click on each count selects a node in that state and it is in view, the numbers follow an accept and a changed test with no reload, the legend opens on the first visit and stays closed after a reload, the robot is on every inferred thing and on no declared one, and read only is said in the bar.
3. The bar's bottom edge is above the canvas's top edge, and the bar and the side panel do not overlap. Measured by the script.
4. `tools/e2e-edit.mjs`, `e2e-inferred.mjs`, `e2e-live.mjs`, `e2e-drift-marks.mjs` and `e2e-wires.mjs` still pass. Change them only where a selector had to move, and say where.
5. No new dependency. No server change. No console error.
6. Frames under `.runs/`: the first view with the bar, the legend open, after a click on a count, read only. On the example, and on this repo.

## Not in this lane

- Which agent is working on what. More of what the AI is thinking. Opening an intent to see its code. Folding many proposals into one chip.
- A new node kind, a new report, any model call.

## Stop clause

Stop and report after 60 minutes, or if the gate cannot be made green in two tries. If time runs short, finish and commit whole scope steps in order and list the ones left undone. Steps 1 to 4 come first.

## Reuse record

## Builder notes

Fix pass after the verifier's four faults:
- The bar wraps onto more lines in a narrow window instead of cutting buttons off (900 px: 2 lines, 480 px: 4). It stays one 36 px line at 1280. The group dividers are gone, since they stranded at line ends. A group's label wraps with its first count.
- The legend takes at most 70 percent of the window width and never grows past its row, so it scrolls inside itself. It already did at 600 px tall, the new end to end case now guards it.
- The legend lists a kind only when the bar counts it or the graph holds a node of it (`legendKinds`, tested first).
- The chip under the canvas stays. Three other scripts (edit, live, drift-marks) use its selectors and the list under the canvas, which is more than a one or two line change per script.
- New frames mode: `--lane-frames <dir> [--repo-from <dir>]`.

## Results
