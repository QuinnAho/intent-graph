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

- Lanes 4 and 5 changed the node look and the panel today (header strip, pins, counts, a drift mark, a drift section). Read `packages/webview/src/graph/nodes/shared/nodeChrome.tsx` and `app/EditPanel.tsx` as they are now.
- The panel and the create form: `packages/webview/src/app/{App,EditPanel,ProblemsPanel}.tsx` and `app/edit-model.ts`. Calls to the server: `packages/webview/src/transport/edit-api.ts`.
- The server's write endpoints: `/api/node` and `/api/intents` in `packages/skill/src/live/server.ts:251` and `:290-315`.
- The spec writer: `packages/skill/src/parser/spec-md/writer.ts`. `newIntentSource` (line 242) and `createIntentFile` (line 274) build a new intent.
- Why a new intent shows as a problem: `packages/skill/src/parser/spec-md/index.ts:196-200` warns when an intent has no `target_kinds`. `spec/intents/README.md:13` says it is required, with at least one entry. The allowed values are `NodeKindSchema` (`packages/shared/src/schemas/node.ts:31`).
- The scripts that must keep passing: `tools/e2e-live.mjs`, `tools/e2e-wires.mjs`, `tools/e2e-drift-marks.mjs`. `tools/e2e-edit.mjs` belongs to this lane: extend it, never loosen it.

## Scope

1. The selected node is clearly marked on the canvas. Lane 4 added an outline through React Flow's `.selected` class (`packages/webview/src/styles/wires.css`). Keep it, and make sure the node whose panel is open always carries it, also right after a create and after a live update.
2. The open panel does not cover the selected node. The graph keeps the node in view.
3. Read only looks read only: values are shown as text, not as dimmed inputs, and the reason is a plain notice.
4. A long file path in the panel header is never cut without a way to read it in full.
5. The new-intent form asks for the target kinds, with one preselected. The new file carries `target_kinds`, and creating an intent leaves no entry in the problems list. Tests first: this is the code that writes a person's files.
6. The open problems list does not cover a node's title.
7. Ctrl+S and Cmd+S both save.
8. A node's title stays readable. With a status mark and a drift mark in the header, titles are cut after about 14 characters today. A title of up to 40 characters is shown in full, on one line or two, and the layout knows the node's real size.
9. A launcher to double-click on Windows, in the repo root: one file that opens the live graph of this repo for viewing, and one that opens it for editing (`--write`). Each builds the page if it is missing, starts the server on a free port, opens the browser at the printed address, and stops the server when its window is closed. The work is done by `tools/play.mjs`, and the two `.cmd` files only call it.

## Files the builder may touch

- `packages/webview/src/app/**`, `packages/webview/src/styles/**`, `packages/webview/src/transport/edit-api.ts`
- `packages/webview/src/graph/**`, only for the selected look, for keeping the node in view and for the title's room in a node
- `packages/skill/src/live/server.ts`, only the create endpoint
- `packages/skill/src/parser/spec-md/writer.ts` and `write-tuning.ts`
- new test files, and new cases in the tests of the first cut (never fewer assertions)
- `tools/e2e-edit.mjs`, `tools/play.mjs` (new), two `.cmd` files in the repo root (new)
- this note: "Reuse record", "Builder notes" and "Results" only

## Acceptance checks

1. `node tools/verify.mjs all` passes and the test count does not go down.
2. `node tools/e2e-edit.mjs` passes, and now also proves: the selected node carries a visible selected state, the panel's box and the selected node's box do not overlap, a created intent has `target_kinds` in its file and adds no problem, in read-only mode the title and body are not input elements, and no title on the fixture is cut while a drift report is loaded.
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

Reused: the writer's yaml and refuse helpers for the new `target_kinds` lines, `NodeKindSchema` from the shared schemas as the one list of allowed kinds, lane 4's `.selected` outline, the node chrome and `getLayoutSize` for the title room, React Flow's `setViewport` for keeping a node clear of the panel, and the drift report writer shape from `tools/e2e-drift-marks.mjs` (copied into `tools/e2e-edit.mjs`, not imported).
New: `graph/layout/title-room.ts`, `graph/keep-in-view.ts`, `app/edit-tuning.ts`, `tools/play.mjs`, two launcher files.

## Builder notes

- The create endpoint lives in `packages/skill/src/live/edit-api.ts` (`createIntent`), not in `server.ts`. I changed it there, one file outside the list, because the endpoint logic is only there.
- A create without `target_kinds` still works and gets the default kind from `write-tuning.ts`, so the first cut's server test (which posts none) passes unchanged. A create that sends kinds the schema does not allow, an empty list, a non-list or a repeat gets 422 and writes nothing. `newIntentSource` without `targetKinds` writes the old file, so the writer's old test passes unchanged.
- Titles: spec nodes are 420 wide (was 340) and their height follows the title (`specNodeHeight`). The estimate reserves room for a status mark and a drift mark even when none shows, so a drift report arriving later never resizes a node. A 40 character title takes two lines.
- Panel off the node: `KeepInView` in `GraphCanvas` reads the drawn node box 250 ms after a selection (the layout moves the node a little when it is selected) and pans or zooms out only when the node sits under the panel. The box comes from the DOM because React Flow's absolute position for a node inside a concept was off by the group padding.
- Problems list: it moved from a floating box over the canvas to a strip under the canvas, so it takes its own room and covers nothing.
- Ctrl+S and Cmd+S: the old code already matched both. I moved the test into `isSaveKey`, added unit cases and a Meta+S step in `e2e-edit`.
- `tools/e2e-edit.mjs`: one old check was replaced, not loosened. "title and body are disabled in read only" became "no input, textarea or select exists in the read-only panel, and the title and body show as text". Nothing else was removed.
- Closing the launcher window sends the stop line to the server. If `play.mjs` itself is killed hard, the server it started keeps running, because `cli.ts` only stops on a stop line, SIGINT or SIGTERM.

## Results

1. `node tools/verify.mjs all`: PASS all, 304 tests in 39 files (was 285 in 35).
2. `node tools/e2e-edit.mjs`: PASS. New proofs: selected outline, panel box clear of the selected node (intent, concept and a new intent), target_kinds in the new file with no new problem, no inputs in read only, no cut title with a drift report loaded (40 character title whole on two lines), problems list covers no title, Cmd+S saves, server refuses a bad kind with 422.
3. A save still changes only the title, the heading and `updated`: the old byte check in `e2e-edit` and the writer's old tests pass unchanged.
4. `e2e-live`, `e2e-wires`, `e2e-drift-marks`: PASS.
5. `node tools/play.mjs --no-open`: prints the address, serves the page and graph.json, exits 0 on a stop line. `open-graph.cmd` runs `node tools\play.mjs`, `open-graph-edit.cmd` runs `node tools\play.mjs --write`, both from the repo root, and pause only if the script failed.
6. Frames: `.runs/e2e-edit/<stamp>/` holds 01 to 06 and `extra-read-only.jpg`, the same seven views as 3a to 3g, plus `extra-long-titles-drift.jpg` and `extra-problems-open.jpg`.
