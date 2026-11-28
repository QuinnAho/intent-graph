---
lane: readable
branch: readable
worktree: .wt/readable
status: ready
go: owner, 2026-11-28 (polish and UX passes)
---
# Lane 17: a first view you can read

## The ask

The owner, paraphrased: after lane 13, keep doing polish passes and UX passes, with research where it is needed. Earlier: it should be clear at first sight what is what, and the tool should be good enough for every day.

A first-time walk on 2026-11-28 ranked 18 moments ([[2026-11-28 First Use Walk]]). A research pass measured the worst one ([[2026-11-28 Readable First View]]). This lane takes the fixes that change no direction. Read both notes first.

## What exists (read these, not the whole tree)

Paths under `W/` are `packages/webview/src/`. Line numbers moved with lane 13, so names are given.

- **Fit.** `FIT_VIEW_OPTIONS` and the fit call in `W/graph/GraphCanvas.tsx`, numbers in `FIT_TUNING` in `W/graph/view-tuning.ts` (padding 0.2, largest zoom 1.2, smallest 0.05), the rule for fitting again in `W/graph/fit-model.ts`. The first fit picks its nodes in `W/app/App.tsx` (`fitNodeIds`).
- **Measured on this repo** (research note, run): the spec block is 2126 by 1540. The fit gives zoom 0.487 at 1440 wide, 0.275 at 700, 0.188 at 480. The title font is 13 px, so the text is 6.3, 3.6 and 2.4 px.
- **The side panel moves the view**: `viewToClearPanel()` in `W/graph/keep-in-view.ts`.
- **The legend**: `W/app/Legend.tsx`. It lies over the canvas, opens by itself on a first visit at 700 px or wider, and is remembered as closed per address.
- **The bar**: `W/app/StateBar.tsx`, the model in `W/app/glance-model.ts`. With no drift report the Drift group reads "no drift report".
- **The side panel**: `W/app/EditPanel.tsx`.
- **Pins**: handles are drawn in `W/graph/nodes/shared/nodeChrome.tsx`. The walk measured 4 px to grab. 6 of 16 handles have no title (Known on the Board).
- **Proposals**: the dimmed look and the tags "planned" and "confidence semantic" come from `nodeChrome.tsx` and `W/app/inferred-model.ts`.
- **The menu**: `W/graph/ContextMenu.tsx`. The plus in a concept header: `W/graph/nodes/ConceptNode.tsx`.
- **Accept**: `W/app/inferred-actions.ts`. The walk timed about 6 s from the click until the node was drawn as declared, on a copy of this repo.
- **React Flow ships a minimap** (`MiniMap` in `@xyflow/react`, already a dependency).

## Scope

Part A, a first view that can be read:

1. A floor for every fit the page does by itself (first load, and fitting again on a change of size): zoom 0.7, so a 13 px title is 9.1 px. The person's own zoom keeps its floor of 0.05.
2. When everything fits at 0.7 or more, nothing changes. When it does not, the view starts at zoom 0.7 with the top left of the spec block at the top left of the canvas, 24 px in. It never starts on empty canvas.
3. F still fits everything, down to 0.05. F a second time goes back to the readable start of step 2.
4. When the view holds only part of the graph after a fit by the page, a small line at the foot of the canvas says so and names the key: it reads like "part of the graph, F shows all". It goes away once the person moves the view or presses F.
5. The minimap, bottom right, in windows 700 px wide or more: the built-in one, each box in its kind's colour, a click or drag on it moves the view. It never covers the canvas controls or the line of step 4. Under 700 px there is none.
6. With the legend open on a first visit, the fit leaves the legend's width free, so the legend covers no node. Closing it fits again when the person has not moved the view.
7. Under 700 px, where the legend does not open by itself, the "?" carries a short label, "what the marks mean", until the legend was opened once.

Part B, say what the state means:

8. When no node has a linked check at all, the Checks group reads "no checks linked yet" in place of three counts, the way Drift reads "no drift report". Its title says in one line how to link one. With one or more linked, the counts show as today.
9. The pending mark on a node gets a title: what pending means and what would change it.
10. The bar names the folder: its last path segment only, at the left, and a small mark that the page is live, with a title. The server may add the folder's name to `/graph.json` for this. Never a full path.

Part C, proposals and small editing faults:

11. A proposal marked "planned" is readable: its text has a contrast of 4.5 to 1 or better against its box. The tags say what they mean in plain words, and a tag that means nothing to a newcomer goes into the title. List the words in the builder notes.
12. Every pin can be grabbed in an area of 12 px or more, drawn size unchanged, and every pin has a title that says what dragging it does.
13. The plus in a concept header shows the word "intent" beside it while the concept is hovered, selected or holds the focus. A concept's right-click menu gains "Add intent".
14. After Accept, a toast says it was accepted and which file was written, with Undo. The new intent is selected. Measure click to drawn on the example and on a copy of this repo, five times each, and write the numbers in the builder notes. On the example it must be under 2 s. If the time on this repo is the server building the graph again, say so and leave it.
15. A right-click never leaves a title in edit mode behind the menu. A selected node's title looks like an edit field only when it is one.

Part D, narrow:

16. Under 600 px wide the side panel opens as a sheet at the foot, half the height at most, and the graph stays visible above it. The selected node is brought into the part that is still visible.
17. At 480 px the bar takes two lines at most. Counts that are zero may fold away there.
18. Everything new holds at 900 and 480 px and inside the editor panel. Every new control has a title and is reached by Tab.
19. The legend gets a row for the minimap and its key row says what F does on a second press.

Checks and frames:

20. A new `tools/e2e-readable.mjs` in the style of `e2e-fold.mjs`: the floor at 1440, 700 and 480 px on a copy of this repo with its real report (the text height is measured, 9 px or more), the start corner, F and F again, the line of step 4 comes and goes, the minimap moves the view, the legend covers no node, the Checks words, the folder name, pin areas, the toast, the sheet, the bar's two lines.
21. Older end-to-end scripts may need the new first view: a script that expects every declared node inside the first view may press F first. No assertion goes away. Say in the report what changed in each.
22. Frames under `.runs/frames-lane17/`: this repo at 1440 by 900, at 700 by 800 and at 480 by 800, each as first seen and after F, the example with the legend open, a planned proposal up close, the sheet at 480 px, the bar at 480 px.

## Files the builder may touch

- `packages/webview/src/app/**`, `src/graph/**`, `src/store/**`, `src/styles/**`
- `packages/webview/tests/**`
- `packages/skill/src/live/compose.ts` and the shared schema, only for the folder's name in step 10, with a test
- `tools/e2e-readable.mjs` (new), other end-to-end scripts only as step 21 allows
- this note: the reuse record and the builder notes

If the work needs a file outside this list, change it and name the file and the reason in the report. Do not touch `packages/extension/**`, `packages/webview/src/main.tsx`, `packages/webview/src/transport/shell-bridge.ts`, `tools/verify.mjs` or anything under `spec/`.

## Acceptance checks

1. `node tools/verify.mjs all` ends with a `PASS all` line, and the test count is not lower than on the lane's base.
2. `node tools/e2e-readable.mjs` passes five times in a row. It is a new file.
3. Every other end-to-end script still passes, `e2e-nested` and `e2e-extension` among them.
4. No new dependency. No existing assertion removed or loosened, other than the press of F that step 21 allows.
5. The frames of step 22 exist.

## Not in this lane

- A layout that follows the window's shape (the research note's second step), and levels of detail when zoomed out. Both come later.
- Keeping the other boxes still when one opens. That is lane 18.
- Whether a click only selects, and a delete in the menu. Both wait for the owner (calls 10 and 11 on the [[Board]]).
- The nine raw kind names in the new-intent form (call 4). A light theme. Remembering folds and the selection across a reload.

## Stop clause

Stop and report after 90 minutes, or if the gate cannot be made green in two tries. If time runs short, finish and commit whole parts in the order A, B, C, D and list what is left undone. Stop and say so if a check can only pass by loosening an older assertion in a way step 21 does not allow, or if the floor makes an older script's proof meaningless.

## Reuse record

Looked at before the start, the builder adds what it finds:

- React Flow's `fitView` options and `setViewport`: adopt. The floor is a `minZoom` on the page's own fit.
- React Flow's `MiniMap`: adopt, it ships with the dependency.
- tldraw's "fit, but never past 100 percent" start: borrow the idea, as a floor.
- ELK `rectpacking` with `aspectRatio`: measured, gains 13 to 30 percent, left for later.

## Builder notes

## Results

## Orchestrator's check
