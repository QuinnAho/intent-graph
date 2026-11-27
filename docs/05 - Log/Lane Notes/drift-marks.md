---
lane: drift-marks
branch: drift-marks
worktree: .wt/drift-marks
status: ready, waits for lane 4 to merge
go: owner, 2026-11-27
---
# Lane 5: drift on the graph

## The ask

"Drift on the graph": show the drift check's verdict as a mark on each node, next to the test status. Reuse comes first: use the best open source parts and cherry-pick, never rewrite from scratch.

## What exists (read these, not the whole tree)

- The drift check: `node tools/drift.mjs` writes `.runs/drift/<timestamp>/report.json` and `.runs/drift/latest.json`, which holds the path of the newest report (`tools/drift.mjs:29-31`). One report entry per commit and node: `DriftPairReportSchema` in `packages/shared/src/schemas/drift.ts:43`, with `node_id`, `commit`, `verdict` (aligned, drift, unclear), `decided_by`, `evidence` and `suggested_action`.
- The live graph: `composeLiveGraph` in `packages/skill/src/live/compose.ts:47` builds `/graph.json`. `LiveGraphNode` (line 18) carries `status`, `status_reasons` and `warnings`. The server pushes changes to the page.
- The page: the status mark is drawn in `packages/webview/src/graph/nodes/shared/nodeChrome.tsx`. Lane 4 has just reshaped that file, so read it as it is now. `packages/webview/src/store/drift-slice.ts` is an empty placeholder from May.
- The side panel: `packages/webview/src/app/EditPanel.tsx`. It already shows a node's checks and anchors.
- The scripts that must keep passing: `tools/e2e-live.mjs`, `tools/e2e-edit.mjs`, `tools/e2e-wires.mjs`.

## Scope

1. No model call from the live server, ever. It only reads a report that `tools/drift.mjs` wrote.
2. The server looks for `<workspace>/.runs/drift/latest.json` and the report it names. `tools/drift.mjs --root <workspace>` writes there. Check where it writes today and change only that.
3. Each node in `/graph.json` gains an optional `drift`: the worst verdict among its entries in that report (drift, then unclear, then aligned), the evidence and suggested action of that entry, its commit, how it was decided, when the report was written, and how many entries the node has.
4. `drift.stale` is true when a file the node is bound to (`realized_by`) changed on disk after the report was written. A stale mark must not look current.
5. A new, changed or removed report reaches the page without a reload, like every other change.
6. A report that is not valid JSON or does not match the schema becomes one entry in the problems list. Nothing crashes and no mark is shown from it.
7. The page: a drift mark beside the status mark, with an icon and a word, never colour alone. Aligned is quiet, unclear is a caution, drift is loud. A stale mark is dimmed and says so. A node with no entry shows no drift mark.
8. The side panel shows the verdict, the evidence, the commit and the suggested action for the selected node.
9. `tools/e2e-drift-marks.mjs`: a temp copy of the fixture, a canned report (one drift, one aligned, one unclear), then the checks in the list below. No model call, so it is free and repeatable.

## Files the builder may touch

- `packages/skill/src/live/**`
- `packages/shared/src/schemas/**`, only to add the shape of `drift` on a live node
- `tools/drift.mjs` and `packages/skill/src/drift/cli.ts`, only for where the report is written
- `packages/webview/src/graph/nodes/shared/**`, `packages/webview/src/store/drift-slice.ts`, `packages/webview/src/transport/**`, `packages/webview/src/app/EditPanel.tsx`, `packages/webview/src/styles/**`
- new test files under `packages/skill/tests/` and `packages/webview/tests/`
- `tools/e2e-drift-marks.mjs` (new)
- this note: "Reuse record", "Builder notes" and "Results" only

## Acceptance checks

1. `node tools/verify.mjs all` passes and the test count does not go down.
2. `node tools/e2e-drift-marks.mjs` passes: the three marks appear within 2 seconds of the report being written, a changed report updates the mark with no reload, a removed report removes the marks, and a broken report gives one problem and no mark.
3. A bound source file edited after the report makes that node's mark stale within 2 seconds.
4. `node tools/drift.mjs` still ends with PASS and the same counts (caught 4 of 4, wrongly flagged 0 of 5).
5. `tools/e2e-live.mjs`, `tools/e2e-edit.mjs` and `tools/e2e-wires.mjs` still pass.
6. The live server starts no model process. Say how you checked.
7. Frames under `.runs/`: a node with a drift mark, the panel with the evidence, and a stale mark.

## Not in this lane

- Running the drift check from the page or on save.
- Anchors on this repo's real spec files (ADR 0030 is still proposed), so this repo's own nodes will show no drift mark yet.
- Any change to the judge, its prompt or its scoring.

## Stop clause

Stop and report after 40 minutes, or if the gate cannot be made green in two tries.

## Reuse record

- Schema check: reused `DriftPairReportSchema` (zod) as is, one `safeParse` per report entry. No new validator.
- Icons: lucide-react, already in the webview (`ShieldCheck`, `CircleHelp`, `OctagonAlert`).
- Mark shape: copied the status pill in `nodeChrome.tsx`, same size and spacing, so the two marks line up.
- Report finding: a 400 ms poll that stats `latest.json` and the report it names. chokidar was not reused because the server's watcher deliberately ignores `.runs`, and watching a folder that may not exist yet is flaky.
- Proof pattern: copied `tools/e2e-live.mjs` (temp fixture copy, free port, Playwright, stop line, one PASS line).
- Nothing written from scratch that an open source part already did.

## Builder notes

- `tools/drift.mjs` wrote to its own repo's `.runs/drift` even with `--root`. It now writes under the `--root` folder when one is given, and under its own repo otherwise (unchanged default).
- Pure rules are in `packages/skill/src/live/drift-marks.ts` (worst verdict, stale rule, report parsing), file reading in `drift-reader.ts`, glue in `server.ts`. Tuning number: `driftPollMs` in `tuning.ts`.
- The report time is the report file's mtime. Stale means a `realized_by` file has an mtime newer than that. Among equal verdicts the later entry wins. A report outside `.runs/drift` is refused as a problem.
- A report is all or nothing: one bad entry gives one problem and no marks.
- Longer headers: with the test mark, the drift mark and a warning count, a title can be cut short on a 240 px node. The full title is in the tooltip and the panel.
- The server cannot start a model: no file in `live/` imports the drift code, and `tools/e2e-drift-marks.mjs` preloads a spy into the server that logs every process it starts. The log must hold no process naming claude or drift, and the report writes must start none.

## Results

See the report from the run for the numbers. Frames: `.runs/e2e-drift-marks/<stamp>/` (`01-drift-marks.jpg`, `02-drift-panel.jpg`, `03-drift-stale.jpg`).
