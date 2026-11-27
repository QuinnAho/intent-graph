---
lane: wire-edit
branch: wire-edit
worktree: .wt/wire-edit
status: ready, waits for lane 7 to merge
go: owner, 2026-11-27
---
# Lane 8: editing by wire

## The ask

The owner, paraphrased: editing on the graph has to be easy and intuitive, and every lane ends with polish. ADR 0031 step 6: drag from a pin to connect. This lane lets a person change how spec nodes hang together with the mouse, and take any change back.

## What exists (read these, not the whole tree)

- The one relation a spec file holds today is `parent` in its frontmatter. The parser turns it into an edge from the node to its parent (`packages/skill/src/parser/spec-md/index.ts:151-160`). An intent whose parent is a concept is drawn inside that concept's box. A constraint whose parent is an intent is drawn as a wire from the constraint to the intent. So connecting, disconnecting and moving a node are all one write: set or remove `parent`.
- The spec writer: `packages/skill/src/parser/spec-md/writer.ts`. `editSpecSource` changes a title and body and keeps every other byte. `SpecEdit` (line 26) has no `parent` yet.
- The write endpoints and their guards (`--write`, token, 127.0.0.1, origin, content hash): `packages/skill/src/live/edit-api.ts`.
- The page: pins are in `packages/webview/src/graph/nodes/shared/nodeChrome.tsx` (`isConnectable={false}` on both handles), the canvas in `graph/GraphCanvas.tsx` (`nodesConnectable={false}`), the server calls in `transport/edit-api.ts`. Lane 7 added the rename field and the right-click menu.
- Which wires are drawn: `packages/webview/src/graph/edges/wire-plan.ts`.
- What the four spec kinds allow as a parent: the `README.md` in `spec/intents`, `spec/constraints`, `spec/decisions` and `spec/concepts`, and the files that exist. Write the table you derive into "Builder notes".
- The end-to-end script of the editing lanes: `tools/e2e-edit.mjs`. Extend it, never loosen it.

## Scope

1. The writer learns one more edit: set `parent` to an id, or remove it. Only the `parent` line and `updated` change. Every other byte stays, including comments, key order, block values and line endings. Tests first: this is the code that writes a person's files.
2. A write endpoint for it, with the same guards as a save. It refuses, with a 4xx and a plain reason, a target that does not exist, the node itself, a code node, a pair of kinds the table does not allow, and a change that would make a loop.
3. Undo. The server remembers the last 20 writes it made (save, create, parent). Undo takes back the newest one and restores the file byte for byte. Undo of a create removes that file. If the file changed since the write, undo refuses and says so.
4. Connect: drag from a node's output pin to another node's input pin. While dragging, the nodes that can take the wire stand out and the others dim. A drop on a node that cannot take it writes nothing and says why. A drop on empty canvas writes nothing.
5. Disconnect: select a wire and press Delete, or right-click it and pick "Delete wire". The node's `parent` is removed.
6. Move: drag a node and drop it inside another concept box, and its `parent` becomes that concept. A drop anywhere else puts it back where it was and writes nothing. A small move inside its own box writes nothing.
7. Every change shows a short notice that says what happened, with an Undo button. Ctrl+Z and Cmd+Z undo when no text field has the focus. Inside a text field they stay the browser's own text undo.
8. Read only: pins do not connect, a dragged node goes back, the wire menu's entry is disabled with the reason, and nothing is sent.
9. A right-click opens the menu and nothing else. Today it also opens the side panel, so the view shifts under the open menu and the menu ends up over another node (`docs/05 - Log/Frames/2026-11-27 Day 2/7b-right-click-menu.jpg`).
10. Polish, the last step: open every frame you took and fix what looks off. The wire being dragged, the highlight on valid targets, the notice, the focus states.

## Files the builder may touch

- `packages/skill/src/parser/spec-md/**`, `packages/skill/src/live/**`
- `packages/webview/src/graph/**`, `packages/webview/src/app/**`, `packages/webview/src/transport/**`, `packages/webview/src/store/**`, `packages/webview/src/styles/**`
- new test files, and new cases in the editing tests (never fewer assertions)
- `tools/e2e-edit.mjs`
- this note: "Reuse record", "Builder notes" and "Results" only

If the work needs a file outside this list, change it and name the file and the reason in the report.

## Acceptance checks

1. `node tools/verify.mjs all` passes and the test count does not go down.
2. Writer tests prove that a parent change, a parent removal and an added parent each leave every other byte alone, on a file with comments, an odd key order, a block value and Windows line endings.
3. `node tools/e2e-edit.mjs` passes, and now also proves, with real mouse drags: a constraint wired to an intent, the wire deleted, an intent moved into another concept, a refused drop, a move that snaps back, each change undone with the file byte for byte as before, and nothing sent in read only.
4. Direct requests for a missing target, the node itself, a code node, a wrong pair and a loop each get a 4xx and write nothing. A request without the token gets 403.
5. `tools/e2e-live.mjs`, `tools/e2e-wires.mjs` and `tools/e2e-drift-marks.mjs` still pass.
6. No new dependency. No console error.
7. Frames under `.runs/`: a wire being dragged with valid targets lit, the notice with Undo after a connect, a node being moved into another concept, a refused drop.

## Not in this lane

- New kinds of relation. A spec file holds only `parent` today.
- Anchors to code and tests (`realized_by`, `verified_by`, ADR 0030).
- Deleting a node. Redo. A menu when a wire is dropped on empty canvas.

## Stop clause

Stop and report after 50 minutes, or if the gate cannot be made green in two tries. If time runs short, finish and commit whole scope steps in order and list the ones left undone. Steps 1 to 3 come first: nothing on the page may write before they are proven.

## Reuse record

(the builder fills this in)

## Builder notes

## Results
