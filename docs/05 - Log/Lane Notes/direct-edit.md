---
lane: direct-edit
branch: direct-edit
worktree: .wt/direct-edit
status: ready
go: owner, 2026-11-27
---
# Lane 7: direct editing

## The ask

The owner, paraphrased: editing on the graph has to be easy and intuitive, and every lane ends with polish. Today a rename means click the node, find the title field in the side panel, type, save. Adding an intent means finding a small button above a concept box. This lane puts both where the hand already is: on the node and under the right mouse button.

## What exists (read these, not the whole tree)

- The node look: `packages/webview/src/graph/nodes/shared/nodeChrome.tsx`. The title element carries `data-node-title` (line 314) and the header strip `data-node-header` (line 292).
- The canvas: `packages/webview/src/graph/GraphCanvas.tsx`. A double-click zooms today (`zoomOnDoubleClick`, line 228).
- The side panel and the create form: `packages/webview/src/app/{App,EditPanel}.tsx`, with pure helpers in `app/edit-model.ts` (`titleProblem`, `isSaveKey`, `selectOnly`).
- The calls to the server: `packages/webview/src/transport/edit-api.ts`. `fetchEditableNode` returns a node's title, body and content hash, `saveNode` writes a title and body against that hash, `createIntent` makes a new intent. No new server endpoint is needed for this lane.
- The end-to-end script of the editing lanes: `tools/e2e-edit.mjs`. Extend it, never loosen it.
- Scripts that must keep passing: `tools/e2e-live.mjs`, `tools/e2e-wires.mjs`, `tools/e2e-drift-marks.mjs`.

## Scope

1. Rename in place. A double-click on a spec node's title, or F2 with the node selected, turns the title into a text field on the node, with the text selected. Enter saves, a click elsewhere saves if the text changed, Esc cancels. It saves through `saveNode` with the body it just fetched, so the conflict rule and the byte rule are the same as in the panel.
2. A double-click on a node no longer zooms. A double-click on empty canvas behaves as before.
3. The field does not make the node jump: same font, same place, and the node keeps its size within 1 px.
4. If the panel holds unsaved text for that node, the rename happens in the panel's title field, so no text is lost.
5. A right-click menu on the canvas. On a concept: "Add intent here", "Rename", "Edit details". On any other spec node: "Rename", "Edit details". On empty canvas: "Fit view". It opens at the pointer, stays inside the window, and closes on Esc, on a click elsewhere and when the view moves. The browser's own menu still appears outside the canvas, so copy and paste work in text fields.
6. The menu works from the keyboard: the menu key or Shift+F10 opens it for the selected node, the arrow keys move, Enter picks, and focus returns to the node.
7. Enter on a selected node opens its details. Esc closes the top thing first: the menu, then the rename field, then the panel.
8. A plus button in a concept's header strip adds an intent to it, in place of the floating button above the box, which could be cut off at the top edge.
9. Read only: no rename field opens, the menu's edit entries are shown disabled with the reason, and nothing is sent to the server.
10. Polish, the last step: open every frame you took and fix what looks off. Alignment, spacing, cut text, the hover and focus states, a visible focus ring on everything the keyboard can reach.

## Files the builder may touch

- `packages/webview/src/graph/**`, `packages/webview/src/app/**`, `packages/webview/src/styles/**`, `packages/webview/src/store/**`
- new test files under `packages/webview/tests/`, and new cases in the editing tests (never fewer assertions)
- `tools/e2e-edit.mjs`
- this note: "Reuse record", "Builder notes" and "Results" only

If the work needs a file outside this list, change it and name the file and the reason in the report.

## Acceptance checks

1. `node tools/verify.mjs all` passes and the test count does not go down (304 today).
2. `node tools/e2e-edit.mjs` passes, and now also proves: a rename by double-click and Enter changes the label and only the title, the heading and `updated` in the file, Esc leaves the file untouched, F2 opens the field, a double-click on a node leaves the zoom where it was, the right-click menu on a concept opens the create form for that concept, and in read only the menu's edit entries are disabled.
3. The node's box is the same size, within 1 px, with the rename field open and closed.
4. The whole flow works with the keyboard alone: select, F2, type, Enter, then the menu key, arrows, Enter.
5. `tools/e2e-live.mjs`, `tools/e2e-wires.mjs` and `tools/e2e-drift-marks.mjs` still pass.
6. No new dependency. No console error.
7. Frames under `.runs/`: the rename field open on a node, the menu on a concept, the menu in read only, the plus button in a concept header.

## Not in this lane

- Connecting nodes by dragging a wire, moving a node into another concept, undo. They are lane 8.
- Deleting a node. Creating a concept, a constraint or a decision.
- Any change to the server or to what a save writes.

## Stop clause

Stop and report after 40 minutes, or if the gate cannot be made green in two tries. If time runs short, finish and commit whole scope steps in order and list the ones left undone.

## Reuse record

(the builder fills this in)

## Builder notes

## Results
