---
lane: nested-code
branch: nested-code
worktree: .wt/nested-code
status: ready
go: owner, 2026-11-27 and again 2026-11-28
---
# Lane 13: open an intent and see its code inside

## The ask

The owner, paraphrased: the tool should show the high-level implementation behind each intent, and it should be clear at first sight what is what. The owner likes how a Blueprint graph nests, and wondered whether the code belongs nested under its intent. This lane tries that in place: an intent opens into a box that lists the code it is bound to, and a click on code opens the file in the editor.

How an intent opens was call 2 on the [[Board]]. The owner left the pick open twice, so the recommended way is built: in place, no stepping inside.

## What exists (read these, not the whole tree)

Paths under `W/` are `packages/webview/src/`. Under `S/` they are `packages/skill/src/live/`.

- **Anchors.** `realized_by` in a spec file's frontmatter, parsed by `parseAnchor()` at `packages/skill/src/parser/spec-md/anchors.ts:30` into `raw`, `path`, an optional `name` and an optional `sig`.
- **What the server sends.** `S/compose.ts:115-124` turns each anchor into a `realizes` edge from the code node to the spec node, with the id `anchor:<target>-><node id>` (`:123`). An anchor with no target becomes only a warning string (`:118`). A symbol that is missing links to the file with a warning (`:121`). So the page has no ordered list of a node's anchors today, and cannot tell "not found" from "not there".
- **Code nodes.** Each carries an absolute `file://` path in `body.uri` (`packages/skill/src/build-graph.ts:200`), and a symbol has `range.start.line`, counted from 0 (`packages/skill/src/parser/tree-sitter.ts:328-330`). The page shows the uri on a selected file node (`W/graph/nodes/CodeModuleNode.tsx:24-29`). The absolute path is a fault listed under Known on the Board.
- **The intent node.** `W/graph/nodes/IntentNode.tsx`, 240 by 76 (`:36`). The shared look is `W/graph/nodes/shared/nodeChrome.tsx`.
- **The pattern to follow: the fold of lane 12.** State in `useUiStore.unfolded` (`W/store/ui-slice.ts`), the model in `W/graph/fold-model.ts`, the actions in `W/app/fold-actions.ts`, the row in `W/graph/nodes/FoldRow.tsx`, a new layout through `refold()` at `W/transport/graph-json-loader.ts:188`, and the layout options `footOf` and `bandOf` near `graph-json-loader.ts:296`. The fold row is part of its node, not a node of its own. See the builder notes in [[fold]].
- **Double-click.** `W/graph/GraphCanvas.tsx:440-453` renames a spec node and does nothing on a code node (`:451`).
- **Keys.** F2, Enter and the menu key in `W/app/direct-edit-model.ts:82-85`, the proposal keys in `W/app/inferred-model.ts:48-50`, F in `W/graph/fit-model.ts:26`. The letter O is free.
- **The menu.** `W/graph/ContextMenu.tsx`. It may be drawn under the side panel near the right edge (Known on the Board).
- **The editor bridge.** `openInEditor(path, line)` at `W/transport/shell-bridge.ts:43` returns false when no editor is around the page. The extension opens only a relative path with forward slashes, and a whole line from 1 (`packages/extension/src/open-file.ts:12-40`).
- **The example.** `tests/fixtures/live-workspace`: three intents, two with one anchor each, one with none.

## Scope

Part A, the data:

1. The live server puts an ordered list on every declared spec node that has `realized_by`: one entry per anchor, in the file's order, with the raw text, the path from the root, the symbol name when the anchor has one, the id of the code node it resolved to when there is one, the line from 1 when it resolved to a symbol, and whether the symbol was missing and the file was linked instead. A node with no anchors gets no list. Proposals get none in this lane.
2. Every code node gets its path from the root, and a symbol gets its line from 1. The absolute `file://` path leaves what the live server sends, and the page shows the path from the root instead. Stop and say so if anything outside the page reads that field from the live server.
3. The `realizes` edges and the warnings stay exactly as they are.

Part B, open and close:

4. A closed intent with code shows a small count at its foot, such as "2 code", with a mark that says it opens. An intent with no code shows no count.
5. A click on the count, the key O on a selected node, or a new menu entry opens it. The same three close it. With no code, the key does nothing and the menu entry is disabled and says why in a few words.
6. Open, the node grows downward and shows one row per anchor in the file's order: the symbol name, then the path from the root. A bare file anchor shows the path alone. A row never shows anything else. The node may be up to 300 px wide when open, a row is about 26 px high, and text that does not fit is cut with the full text in the title.
7. A row is part of the intent node, not a node of its own. No wire ends on it. It must not look like a node: no border box of its own, no pins.
8. An anchor that is not in the graph gets a row that says the code was not found. A missing symbol whose file was found says so on its row.
9. Rows are copies of a reference, never the code node itself: two intents that cite the same symbol each show their own row, and the code block below the spec block is the same whether anything is open or not.
10. What is open is a set of node ids in `useUiStore`. It survives a live update, a rename in place, a move into another concept and an undo. Nothing opens by itself. It is not kept across a reload.
11. Layout: opening lays the graph out with the larger node, and nothing may overlap. Closing everything puts every node back where it was and at its old size, within 1 px. After a toggle the node's title stays within 40 px of where it was on screen.
12. On a copy of this repo with one accepted proposal opened: from the click to a settled layout in under 1.5 s, median of 5.
13. All of it works on a server without `--write`, with no request other than GET.

Part C, from the graph to the code:

14. A click on a row whose code was found: inside the editor panel it opens the file at the line through `openInEditor`. In a plain browser tab it selects the code node and brings it into view. The row's title says which of the two will happen.
15. A double-click on a code node, or Enter on a selected one, opens it in the editor when there is one. In a plain browser tab nothing changes.
16. `tools/e2e-extension.mjs` gains one step: in the panel, open an intent, click a row, and the file is the active editor at that line. If the script cannot see the active editor, prove the message the page posted and say so.

Part D, polish:

17. The menu always opens fully inside the window and above the side panel, and a click on its first entry lands on the entry.
18. Keyboard: Tab reaches a node, O opens and closes it, the focus stays on the node. Tab reaches each row of an open node, and Enter or Space on a row does what a click does. While a rename field or any text field has the focus, the letter is typed and nothing toggles.
19. Everything holds at 900 and 480 px wide, and inside the editor panel.
20. The legend gets one row for the code count and one key row for O. Every new control has a title.
21. A new `tools/e2e-nested.mjs` in the style of `e2e-fold.mjs`, on temp copies of the example: one and two anchors with one a bare path, order and text of the rows, not found, no anchors, open by click, key and menu, survive a rename, a move with undo and a live update, open all and measure overlaps, close all and compare places, read-only with only GET, the menu near the right edge with the panel open.
22. Frames under `.runs/frames-lane13/`: the example with one intent open at 1440 by 900, every intent open, an open node up close, a row that was not found, one open at 480 px, and this repo's copy with an accepted proposal open. This repo's frames use the real report from the main checkout's `.runs/infer`. If it is missing, skip them and say so.

## Files the builder may touch

- `packages/skill/src/live/compose.ts` and what it needs beside it, `packages/shared/src/schemas/**` for the new fields, tests under `packages/skill/tests/**` and `packages/shared/tests/**`
- `packages/webview/src/app/**`, `src/graph/**`, `src/store/**`, `src/styles/**`, `src/transport/graph-json-loader.ts`, `src/transport/graph-merge.ts`
- `packages/webview/tests/**`
- `tools/e2e-nested.mjs` (new), `tools/e2e-extension.mjs` for step 16. Another end-to-end script only where step 2 changes what it reads, with no assertion lost.
- this note: the reuse record and the builder notes

If the work needs a file outside this list, change it and name the file and the reason in the report. Do not touch `packages/extension/**`, the spec writer, `tools/verify.mjs` or anything under `spec/`.

## Acceptance checks

1. `node tools/verify.mjs all` ends with a `PASS all` line, 592 tests or more.
2. `node tools/e2e-nested.mjs` passes five times in a row. It is a new file.
3. The other end-to-end scripts still pass: `e2e-live`, `e2e-edit`, `e2e-wires`, `e2e-drift-marks`, `e2e-inferred`, `e2e-agents`, `e2e-glance`, `e2e-fold`, `e2e-extension`.
4. No dependency change. No existing assertion removed or loosened.
5. The frames of step 22 exist.

## Not in this lane

- Opening a proposal, a constraint, a decision or a concept. Lane 15 shows what a proposal cites.
- Moving code nodes into an intent, or hiding the code block.
- Any change to the anchor format (ADR 0030 is still proposed), to a spec file, or to the wires.
- Drawing who is working on what (lane 14).

## Stop clause

Stop and report after 90 minutes, or if the gate cannot be made green in two tries. If time runs short, finish and commit whole parts in the order A, B, C, D and list what is left undone. Stop and say so if closing cannot put the nodes back within 1 px, or if a check can only pass by loosening an older assertion.

## Reuse record

Looked at before the start, the builder adds what it finds:

- React Flow sub-flows: already used for concepts. Borrow nothing new.
- React Flow's expand and collapse example: a paid example. Skip the code, the idea is the same as the fold.
- The fold of lane 12: borrow the state, the model, the layout call and the row.
- Builder: borrowed `refold()`, `footOf`, `absolutePosition` and the view shift from the fold as they were. `findTarget` moved from `compose.ts` to `S/code-refs.ts` so the server list and the edges use one rule.
- Builder: React Flow's own `setCenter` brings a code node into view, `createPortal` from react-dom puts the menu on the page body. Nothing new installed.

## Builder notes

- Server: each declared spec node with `realized_by` gets `code`, one entry per anchor in the file's order: `raw`, `path`, `name` when it names a symbol, `target` (the code node id or null), `line` from 1 when it resolved to a symbol, `symbol_missing`. Schema `LiveCodeRefSchema` in `packages/shared/src/schemas/code-ref.ts`. Code nodes get `path` (read from the id) and symbols `line`, and `body.uri` is dropped. Nothing outside the page read `body.uri`. Edges and warnings are unchanged.
- State: the open intents are `useUiStore.nested`, a set of ids. `applyNest()` in `W/graph/nest-model.ts` puts `data.nest = { count, open }` on every declared intent with code, on load, live update and toggle, next to `applyFold()`. Proposals never open in this lane.
- One count per node (the orchestrator's call on step 4): the old "N code" pin chip goes away on an intent with code, and the new count is the one control. The chip's wire meaning moved into the count's title ("1 wire from the code block is not drawn."). The chip stays on every other node and for "spec" wires. Rule: `chipHidden()` in `nest-model.ts`.
- Sizes (`NEST_TUNING` in `W/graph/view-tuning.ts`): the count line is 24 px and fits the room a closed node already has, so a closed node does not grow. Open adds 26 px per row plus 8 px. The node stays 420 px wide, the spec width the layout already gives every spec node, so it never needed the note's 300 px.
- Closed nodes take their own height again: `applyLayout` drops a height left by an earlier open. Closing everything puts every node back within 0 px in the script.
- Speed: opening one intent in this repo's copy took about 1.5 s, mostly layout. The layout of each block is now cached by a key of its nodes, sizes and wire ends (`W/graph/layout/layout-cache.ts`), so the code block is not laid out again on a toggle. Median now about 0.8 s. The fold of lane 12 gets the same cache.
- Clicks: a row in the editor panel calls `openInEditor(path, line)`. In a browser tab it selects the code node and `ApplyViewFocus` in `GraphCanvas.tsx` centres it. A double-click or Enter on a selected code node opens the editor, in a tab nothing happens. A row whose code is not found is `aria-disabled` and does nothing.
- Keys: O works on the focused intent, else the selected one. It is read in the same capture handler as F2 and Enter, so any field, button or open menu keeps the letter. After a toggle the focus is put back on the node after two frames, a layout can drop it.
- Menu: drawn through a portal on the page body, so the side panel can no longer cover it. Intent menus get "Show code" or "Hide code" last, so the keyboard order of Rename and Edit details did not move. It works on a read-only page.
- Words on screen the owner may want to reword: "2 code" (the count), "Show code" and "Hide code" (menu), "No code bound to it" (disabled reason), "code not found" and "symbol not found, file linked" (row notes), the count's title "Show the 2 pieces of code this intent is bound to. O opens it.", a row's title "add in src/math.ts. Click to open it in the editor at line 1." or "... Click to select it in the graph.", the legend row "The code an intent is bound to. Click it or press O to list it, click a row to go to the code." and the key row "Show or hide the code of the selected intent."
- Fix round 1: the dead room at the foot came from the open node taking the layout's height, which is built from a wide guess of the title (and the closed room) and was taller than the real header, more so with chips or a wrapped title. An open intent now drops that height and is as tall as its content, with 8 px kept under the last row (`padPx`), so the foot is 9 px (8 plus the border) on every node. The layout still reserves the guessed height, only as spare room. The count reads "hide 2 code" when open. `e2e-nested.mjs` step 1b measures the foot.
- `e2e-nested.mjs` makes its own example in the temp copy: two anchors with one a bare path, an intent whose code is not there, and a second concept to move into.

## Results

## Orchestrator's check
