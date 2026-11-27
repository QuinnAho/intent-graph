---
lane: inferred-graph
branch: inferred-graph
worktree: .wt/inferred-graph
status: ready
go: owner, 2026-11-27
---
# Lane 10: inferred intents on the graph

## The ask

The owner, paraphrased: we should be able to see the intent and the intent inferred from the code, and a person should be able to change it easily. Lane 9 made the proposals. This lane puts them on the graph and lets a person settle each one with one key. The recommendation it follows is in [[2026-11-27 Layers - Approaches]], under "Declared and inferred".

## What exists (read these, not the whole tree)

- The proposals: `.runs/infer/latest.json` names a `report.json`, and the proposals sit under `report.proposals` in it. The shape is in `packages/shared/src/schemas/infer.ts`. Each proposal has `id` (stable while the code is the same), `folder`, `title`, `body`, `anchors` (`path#Symbol`, or a bare path for a file with no symbol), `belongs_under` (a declared concept or none), `restates` (a declared intent or none), `confidence` (a word from ADR 0022), `planned` (true when all the code it cites is a placeholder) and `code_hash`. This repo gives about 64 proposals from 42 folders.
- How a report already reaches the page: the drift report. `packages/skill/src/live/drift-reader.ts` reads it with a path guard and a schema check, `drift-marks.ts` attaches it in `compose.ts`, and the page shows it. Follow that shape.
- How the server writes: `packages/skill/src/live/edit-api.ts`. Every write goes through one queue, is guarded (`--write`, token, 127.0.0.1, origin), and is remembered for undo.
- How an intent file is made: `createIntentFile` in `packages/skill/src/parser/spec-md/writer.ts`. It does not write `realized_by` yet.
- The page: nodes in `packages/webview/src/graph/nodes/shared/nodeChrome.tsx`, keys and menus in `graph/GraphCanvas.tsx` and `app/`, notices with Undo in the strip under the canvas, calls in `transport/edit-api.ts`.
- The end-to-end scripts: `tools/e2e-edit.mjs` for editing, `tools/e2e-drift-marks.mjs` as the pattern for a canned report.

## Scope

1. The server reads the newest inference report, with the same guards as the drift report: only under `.runs/infer`, checked against the schema, a bad file is one problem and no proposal.
2. Each proposal becomes a node in `/graph.json`, marked as inferred, under the concept it belongs to, or at the top when it has none. Its evidence becomes edges from the code it cites, the same kind a declared intent's anchors give.
3. On the page an inferred node is told apart at once: a dashed outline, the word "inferred" and its confidence word. Never by colour alone. Its panel shows the body, the folder it was read from and the evidence. A planned proposal says "planned" as well and is fainter, so code that does not work yet never looks like code that does.
4. Accept. Enter on a selected inferred node, or "Accept" in its right-click menu or its panel, writes a real intent file: the title, the body, the concept as its parent, and the evidence as `realized_by`. The node turns solid. Tests first: this is the code that writes a person's files.
5. Edit first. A double-click or F2 opens the same rename field as on any node. Enter then accepts with the new title.
6. Dismiss. Delete on a selected inferred node, or "Dismiss" in the menu or the panel, removes it. A dismissed proposal does not come back on the next report unless its code changed. The list of dismissed ids lives under `.runs/infer/`, never in `spec/`.
7. Undo takes back an accept (the file is removed) and a dismiss, like every other change.
8. A proposal that restates a declared intent is still a node. It says "same as" and the title of that intent, on the node and in the panel. The model names a restated intent too often (14 of 66 on this repo, some of them a stretch), so the person decides: dismiss it as a duplicate, or accept it as its own intent.
9. A count of open proposals sits in the strip under the canvas, such as "14 inferred". A click on it selects the next one, so a person can go through them with Enter and Delete alone.
10. Read only: proposals are shown, and accept, edit and dismiss are disabled with the reason.
11. Polish, the last step: open every frame you took and fix what looks off.

## Files the builder may touch

- `packages/skill/src/live/**`, `packages/skill/src/parser/spec-md/**`
- `packages/shared/src/schemas/**`, only for the shape of an inferred node in the live graph
- `packages/webview/src/graph/**`, `packages/webview/src/app/**`, `packages/webview/src/transport/**`, `packages/webview/src/store/**`, `packages/webview/src/styles/**`
- new test files, and new cases in existing test files (never fewer assertions)
- `tools/e2e-inferred.mjs` (new)
- this note: "Reuse record", "Builder notes" and "Results" only

If the work needs a file outside this list, change it and name the file and the reason in the report.

## Acceptance checks

1. `node tools/verify.mjs all` passes and the test count does not go down.
2. Writer tests prove an accepted proposal gives a file that the parser reads back with the same title, body, parent and anchors, and that a title with YAML specials survives.
3. `node tools/e2e-inferred.mjs` passes on a temp copy of the example with a canned report, with real keys and clicks: the proposals show dashed with the word, Enter accepts and the file exists with `realized_by`, a double-click, a new title and Enter accept under that title, Delete dismisses, each is undone byte for byte, the count goes down by one each time, a new report with the same dismissed id shows nothing, and in read only nothing is sent.
4. A broken report, and a report outside `.runs/infer`, each give one problem and no proposal.
5. `tools/e2e-edit.mjs`, `tools/e2e-live.mjs`, `tools/e2e-wires.mjs` and `tools/e2e-drift-marks.mjs` still pass.
6. No new dependency. No console error. The live server starts no model process.
7. Frames under `.runs/`: inferred nodes beside declared ones, the panel of an inferred node, one being accepted with its notice, the count in the strip.

## Not in this lane

- Opening an intent to see its code nested inside. That is the lane after this one.
- Tying the code a model found to an intent that is already declared. Scope step 8 only shows the claim.
- Running the inference from the page. A review tray. A side-by-side view.
- A new kind of spec node.

## Stop clause

Stop and report after 55 minutes, or if the gate cannot be made green in two tries. If time runs short, finish and commit whole scope steps in order and list the ones left undone. Steps 1 to 4 come first.

## Reuse record

(the builder fills this in)

## Builder notes

## Results
