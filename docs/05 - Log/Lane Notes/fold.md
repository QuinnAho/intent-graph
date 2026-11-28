---
lane: fold
branch: fold
worktree: .wt/fold
status: ready
go: owner, 2026-11-27
---
# Lane 12: a first view that fits

## The ask

The owner, paraphrased, on the three faults left after lane 11 (the graph crowded by 66 proposals, no fit when the window narrows, the problem count shown twice): each must be solved in the way that is most obvious to a person, and the way the page is used needs a rework. The page is going into a narrow editor panel ([[0032-a-thin-vs-code-extension-around-the-page]]).

Folding the proposals was already on the [[Board]] with a go. The other two come with it because all three decide whether the first view can be read.

## What exists (read these, not the whole tree)

Paths under `W/` are `packages/webview/src/`. Under `S/` they are `packages/skill/src/live/`.

- **Proposals.** The server makes each one an intent node with the id `inferred:<id>` (`S/infer-marks.ts:85-86`). Its parent is the concept named by `belongs_under`, or none (`S/compose.ts:156-158`). The page copies `inferred` into the node's data (`W/transport/graph-json-loader.ts:195`) and nests it in its concept (`:203-211`). The data shape: `LiveInferredSchema` in `packages/shared/src/schemas/infer.ts:39-49`.
- **Layout.** `layoutNested()` at `W/graph/layout/nested.ts:26` lays out the children, then the parents. A concept's size comes from `nested.ts:56`, the pad and header from `W/graph/view-tuning.ts:8,10`, its own base size from the sizer at `W/graph/nodes/ConceptNode.tsx:73`. ELK runs in `runLayout()` at `W/graph/layout/index.ts:51`.
- **No fold state exists.** UI state lives in `useUiStore` (`W/store/ui-slice.ts`).
- **The inferred count.** `W/app/InferredCount.tsx:29` calls `selectNextProposal()` in `W/app/inferred-actions.ts`. The view moves through `viewToClearPanel()` at `W/graph/keep-in-view.ts:26`, called from the effect in `W/graph/GraphCanvas.tsx` near lines 100 to 122.
- **Fit.** `fitView` is a prop at `GraphCanvas.tsx:432` with `FIT_VIEW_OPTIONS` (`:126`, padding 0.2, largest zoom 1.2). No smallest zoom is set, so React Flow's default applies. The first fit picks its nodes at `W/app/App.tsx:230`. The right-click menu has a fit entry (`W/graph/ContextMenu.tsx:98`). Nothing listens to a change of size. `onMoveStart` is at `GraphCanvas.tsx:460`.
- **Problems.** `<ProblemsPanel />` is mounted at `App.tsx:281` and draws the chip under the canvas and its list (`W/app/ProblemsPanel.tsx:48-62`: `data-problems-count`, a button, `ul[aria-label="spec problems"]`, `li[data-problem-file]`). The bar's count is `ProblemsCount` at `W/app/StateBar.tsx:69-83`, and a click opens and closes the same list through `useProblemsStore`. Four scripts use the chip or the list: `tools/e2e-edit.mjs:834-849`, `tools/e2e-live.mjs:220-233`, `tools/e2e-drift-marks.mjs:265`, `tools/e2e-glance.mjs:498-539`.
- **The wires script.** `tools/e2e-wires.mjs`: the example block at `:236-258`, the repo block at `:260-302`, the crossing count in `measureInPage` at `:126-176`. A third block goes after `:302`.
- **Known and still true.** In a checkout that holds a real inference report under `.runs/infer`, `e2e-wires` fails on the repo block: a wire crosses proposal boxes. This lane fixes it.

## Scope

Part A, fold the proposals:

1. By default the proposals of a concept are folded. The concept shows its declared children as before, and one dashed row at its foot: the robot and a count such as "9 inferred". The row is part of the concept node, about 28 px high. It is not a node of its own, so no wire can end on it. Folded proposals are not laid out and not drawn.
2. A click on the row, or Enter or Space on it, unfolds that concept. Its proposals are laid out inside it as today, below the declared ones, and the row reads "fold 9 inferred". The concept's header stays within 40 px of where it was on screen.
3. Proposals with no concept fold the same way into one dashed box at the root: "N inferred, no concept yet".
4. Nothing is lost: the numbers on the rows always add up to the bar's inferred count.
5. A click on the bar's inferred count still goes to the next open proposal. When it is folded, its concept unfolds first. `?focus=<id>` on a folded proposal does the same.
6. Unfolded, everything from lane 10 works as before: Enter, a double-click, Delete, undo. When the last proposal of a concept is settled, the row goes away. With a concept folded, no key can settle a proposal that is not shown.
7. What is unfolded is kept in `useUiStore` and survives a live update. It is not kept across a reload: a first view always starts folded.
8. On this repo with its real report, 66 proposals, in a window of 1440 by 900: every declared node is inside the first view, no proposal is drawn, and no wire crosses a box.
9. `tools/e2e-wires.mjs` gets a third block: a temp copy of the example with a canned report of 40 proposals in one concept that has a wire coming in. Folded: 0 crossings, that must hold. Unfolded: the number is measured and printed, with no pass or fail.
10. A new `tools/e2e-fold.mjs` in the style of the others: fold and unfold by click and by key, the numbers add up, the bar count and `?focus` unfold, accept and undo inside an unfolded concept, a live update keeps what was unfolded, the first view of the 40-proposal copy fits.
11. `tools/e2e-inferred.mjs` and `tools/e2e-glance.mjs` may gain an unfold step before their steps that need a proposal on screen. No assertion goes away.

Part B, fit again:

12. Note when the person moves the view: a pan, a zoom, a wheel. Watch the size of the canvas. When it changes by more than 8 px and the person has not moved the view since the last fit, fit again with the same options, at most once per 150 ms. When they have moved it, leave the view alone.
13. The key F fits, unless the focus is in a text field. After that, a change of size fits again.
14. A first load in a narrow window fits.

Part C, one place for problems:

15. The chip under the canvas goes. The bar's count is the only count. The list opens from the bar's count, under the bar, clear of the canvas controls. It keeps `ul[aria-label="spec problems"]` and `li[data-problem-file]`. Esc or a second click closes it and the focus goes back to the count.
16. Each row says what is wrong, in which file as a path from the root, and what to do next in a short line. Write one hint for each kind of problem that exists today, 12 words at most, and list them in the builder notes so the owner can change the words. Where no hint fits, show the message alone. A click on a row that belongs to a node selects it and brings it into view.
17. Change `e2e-edit`, `e2e-live`, `e2e-drift-marks` and `e2e-glance` to open the list from the bar's count. Every assertion on what the list holds stays. Say in the report what changed in each.

Part D, polish:

18. Everything new holds at 900 and 480 px wide: nothing is cut off, and the list is never wider than the window.
19. Keyboard: Tab reaches each fold row in reading order, the focus ring shows, and every new control has a title.
20. The legend gets one row for the fold row and one key row for F.
21. Frames under `.runs/frames-lane12/`: this repo folded at 1440 by 900, one concept unfolded, this repo at 480 px, the fold row up close on the example, the problems list open, and the example after a resize from 1280 to 480 px. This repo's frames use the real report from the main checkout's `.runs/infer` and a canned drift report. If the real report is missing, skip them and say so.

## Files the builder may touch

- `packages/webview/src/app/**`, `src/graph/**`, `src/store/**`, `src/styles/**`
- `packages/webview/src/transport/graph-json-loader.ts`, only if folding is applied there
- `packages/webview/tests/**`, new test files
- `tools/e2e-fold.mjs` (new), `tools/e2e-wires.mjs`, `tools/e2e-inferred.mjs`, `tools/e2e-glance.mjs`, `tools/e2e-edit.mjs`, `tools/e2e-live.mjs`, `tools/e2e-drift-marks.mjs`
- this note: the reuse record and the builder notes

If the work needs a file outside this list, change it and name the file and the reason in the report. Another lane is building the editor panel at the same time: do not touch `packages/webview/src/main.tsx`, `packages/webview/src/transport/shell-bridge.ts`, `packages/extension/**`, `tools/play.mjs` or `tools/verify.mjs`.

## Acceptance checks

1. `node tools/verify.mjs all` ends with a `PASS all` line, 535 tests or more.
2. `node tools/e2e-fold.mjs` passes five times in a row. It is a new file.
3. `node tools/e2e-wires.mjs` passes, with its third block.
4. The other end-to-end scripts still pass: `e2e-glance`, `e2e-agents`, `e2e-edit`, `e2e-inferred`, `e2e-live`, `e2e-drift-marks`.
5. No dependency change. No server change: `/graph.json` and the bar's numbers are the same as before.
6. No existing assertion removed or loosened.
7. The frames of step 21 exist.

## Not in this lane

- Opening an intent to see its code (lane 13). Drawing who is working on what (lane 14). A single "needs attention" number (call 9 on the Board).
- A layout in which unfolded proposals never sit under a wire. Step 9 only measures it.
- Any change to the server, to the data, or to what a proposal is.

## Stop clause

Stop and report after 90 minutes, or if the gate cannot be made green in two tries. If time runs short, finish and commit whole parts in the order A, B, C, D and list what is left undone. Stop and say so if this repo's copy shows fewer than 50 or more than 80 proposals, or if folding would need a change to the server.

## Reuse record

- `layoutNested()` gained two options, a foot height and bands. With neither set it lays out as before, so the old tests and graphs do not move.
- The canned report rows and the server helpers in `e2e-fold.mjs` are copied from `e2e-inferred.mjs`, the crossing count is a short copy of `measureInPage` in `e2e-wires.mjs`.
- `inferredOf()`, `nextInferred()`, `selectOnly()`, `focusNode()`, `RobotIcon` and the bar's count are used as they were. React Flow's own `fitView`, `useStore` width and height, and `onMoveStart` do the fitting.

## Builder notes

- Fold state is a set of concept ids in `useUiStore.unfolded`. `applyFold()` (`W/graph/fold-model.ts`) runs on every load, live update and fold change. It marks folded proposals `hidden` in the store, so the bar still counts all of them, and the canvas and the layout skip hidden nodes.
- Proposals with no concept fold into one node, `inferred-fold:root`, with no pins. It is left out when a live update is compared, so it never forces a layout.
- Unfolded proposals are a second band laid out below the declared children. After a fold the view moves by the concept's change of place, so its header stays put (0 px in the script).
- Fit again: any pan, zoom or wheel by the person stops it, F starts it again. The smallest zoom is now 0.05, the old default of 0.5 could not fit this repo at 480 px.
- The legend is a layer at the right under the bar, so it never changes the canvas size. Only its X, Esc and the "?" close it. Under 700 px it does not open by itself, and from "?" it takes the full width with the words under each label.
- `?focus=<id>` also selects the node, once, in `App.tsx` after the first layout. A second select in the same effect looped on a re-render.
- At 480 px the first fit shows the declared nodes, code files may lie outside, so the repo step holds only the declared nodes to the window.
- Unfold of the biggest concept (16 proposals), click to open: 1.0 to 1.8 s. About 0.5 s is layout, mostly the unchanged code group, about 1 s is render. A cache of the code layout cut layout to 0.1 s but total time did not move, so it was reverted.
- The problems list sits in its own row under the bar, not over the canvas, so it covers no title (the `e2e-edit` check stays). A row selects its node when the message names an id or the file is `<kind>s/<stem>.md` for a node `<kind>-<stem>`.
- Problem hints (step 16), in `W/store/problems.ts`, for the owner to reword:
  - no YAML frontmatter: "Start the file with a --- block holding id, title, parent, confidence."
  - YAML does not parse: "Fix the YAML between the two --- lines."
  - frontmatter not a mapping: "Write the frontmatter as key: value lines."
  - required field missing: "Add the missing id, title, parent or confidence field."
  - id without its kind prefix: "Start the id with its kind, like intent- or concept-."
  - intent without target_kinds: "Add a target_kinds list to the frontmatter."
  - constraint without its fields: "Add predicate_kind, expr and scope_node to the frontmatter."
  - concept without regeneration_scope: "Add regeneration_scope: atomic or cooperative."
  - parent loop: "Point one parent in the loop at a concept outside it."
  - drift report unusable: "Run node tools/drift.mjs again for a fresh report."
  - inference report unusable: "Run node tools/infer.mjs again for a fresh report."

## Results
