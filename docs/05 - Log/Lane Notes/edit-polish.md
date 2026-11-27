---
lane: edit-polish
branch: edit-polish
worktree: .wt/edit-polish
status: ready, waits for lane 5 to merge
go: owner, 2026-11-27
---
# Lane 6: editing polish

## The ask

"Editing polish": highlight the selected node, keep the panel off the canvas, and have the new-intent form ask for target kinds. The rough edges below were found by the builder and the verifier of the first cut and in its frames (`docs/05 - Log/Frames/2026-11-27 Night 1/`, files `3a` to `3g` and `1d`).

## What exists (read these, not the whole tree)

- The panel and the create form: `packages/webview/src/app/{App,EditPanel,ProblemsPanel}.tsx` and `app/edit-model.ts`. Calls to the server: `packages/webview/src/transport/edit-api.ts`.
- The server's write endpoints: `/api/node` and `/api/intents` in `packages/skill/src/live/server.ts:251` and `:290-315`.
- The spec writer: `packages/skill/src/parser/spec-md/writer.ts`. `newIntentSource` (line 242) and `createIntentFile` (line 274) build a new intent.
- Why a new intent shows as a problem: `packages/skill/src/parser/spec-md/index.ts:196-200` warns when an intent has no `target_kinds`. `spec/intents/README.md:13` says it is required, with at least one entry. The allowed values are `NodeKindSchema` (`packages/shared/src/schemas/node.ts:31`).
- The scripts that must keep passing: `tools/e2e-live.mjs`, `tools/e2e-wires.mjs`, `tools/e2e-drift-marks.mjs`. `tools/e2e-edit.mjs` belongs to this lane: extend it, never loosen it.

## Scope

1. The selected node is clearly marked on the canvas.
2. The open panel does not cover the selected node. The graph keeps the node in view.
3. Read only looks read only: values are shown as text, not as dimmed inputs, and the reason is a plain notice.
4. A long file path in the panel header is never cut without a way to read it in full.
5. The new-intent form asks for the target kinds, with one preselected. The new file carries `target_kinds`, and creating an intent leaves no entry in the problems list. Tests first: this is the code that writes a person's files.
6. The open problems list does not cover a node's title.
7. Ctrl+S and Cmd+S both save.
8. A launcher to double-click on Windows, in the repo root: one file that opens the live graph of this repo for viewing, and one that opens it for editing (`--write`). Each builds the page if it is missing, starts the server on a free port, opens the browser at the printed address, and stops the server when its window is closed. The work is done by `tools/play.mjs`, and the two `.cmd` files only call it.

## Files the builder may touch

- `packages/webview/src/app/**`, `packages/webview/src/styles/**`, `packages/webview/src/transport/edit-api.ts`
- `packages/webview/src/graph/**`, only for the selected look and for keeping the node in view
- `packages/skill/src/live/server.ts`, only the create endpoint
- `packages/skill/src/parser/spec-md/writer.ts` and `write-tuning.ts`
- new test files, and new cases in the tests of the first cut (never fewer assertions)
- `tools/e2e-edit.mjs`, `tools/play.mjs` (new), two `.cmd` files in the repo root (new)
- this note: "Reuse record", "Builder notes" and "Results" only

## Acceptance checks

1. `node tools/verify.mjs all` passes and the test count does not go down.
2. `node tools/e2e-edit.mjs` passes, and now also proves: the selected node carries a visible selected state, the panel's box and the selected node's box do not overlap, a created intent has `target_kinds` in its file and adds no problem, and in read-only mode the title and body are not input elements.
3. A save still changes only the title, the heading and `updated` in the file. The writer's existing tests pass unchanged.
4. `tools/e2e-live.mjs`, `tools/e2e-wires.mjs` and `tools/e2e-drift-marks.mjs` still pass.
5. `node tools/play.mjs --no-open` starts, prints the address, serves the page, and stops cleanly on a `stop` line. Say what the `.cmd` files contain.
6. Frames under `.runs/`: the same seven views as `3a` to `3g`, so before and after can be laid side by side.

## Not in this lane

- Editing anchors, relations or any other frontmatter field.
- Connecting nodes by dragging a wire.
- Any change to what a save writes.

## Stop clause

Stop and report after 40 minutes, or if the gate cannot be made green in two tries.

## Reuse record

(the builder fills this in)

## Builder notes

## Results
