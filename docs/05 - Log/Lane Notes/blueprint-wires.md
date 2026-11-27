---
lane: blueprint-wires
branch: blueprint-wires
worktree: .wt/blueprint-wires
status: ready
go: owner, 2026-11-27
---
# Lane 4: Blueprint-style wires and pins

## The ask

"Edge routing": wires are drawn through boxes and labels today, and it is the first thing the eye lands on. The owner's direction for node-based views is to move toward the way the Unreal Blueprint editor works (ADR 0031). This lane is step one of that: pins on the sides, smooth wires, left to right.

## What exists (read these, not the whole tree)

- The recipe: [[2026-11-27 Blueprint Style Graph]]. Follow "The recipe for step one". Rows marked M in that note are from memory, so check them in the running app.
- Why wires cross today: `packages/webview/src/graph/nodes/shared/nodeChrome.tsx:127-170` puts hidden handles on all four sides, the layout runs top-down (`graph/layout/index.ts:31`, `graph/layout/elk.worker.ts:34`), and `graph/layout/nested.ts` only lays out edges inside one box level, so a wire that leaves a concept box is never laid out.
- Edge components: `graph/edges/{Realizes,Constrains,Supersedes}Edge.tsx`, registered in `graph/GraphCanvas.tsx:155`. Edge kinds: `packages/shared/src/schemas/edge.ts:6`.
- Libraries: `@xyflow/react` ^12.10.0 and `elkjs` ^0.9.3. No new dependency is expected.
- Frames from before this lane: `docs/05 - Log/Frames/2026-11-27 Night 1/`, files `1a` to `1e`.
- Scripts that must keep passing: `node tools/e2e-live.mjs` and `node tools/e2e-edit.mjs`. They find nodes and marks by their text.

## Scope

1. Write the measuring script first: `tools/e2e-wires.mjs`. It opens the fixture workspace (`tests/fixtures/live-workspace`) and this repo through the live server. For every drawn wire it samples 40 points along the path. It counts (a) samples that fall inside a node box that is neither an end of the wire nor a box that holds one of the ends, and (b) wire ends farther than 6 px from a pin of a visible node. It prints the counts, the share of wires that run left to right, the time from page load to a laid-out graph, and one PASS or FAIL line. Run it before changing anything and record the numbers. It must say FAIL today.
2. Pins: one input pin on the west side and one output pin on the east side of every node. Visible, 10 px, not connectable.
3. One wire component for all edge kinds, with the recipe's path formula. Stroke 2 px, 3 px on hover, 16 px hit area. Colour by edge kind, dashes only for `supersedes`. No arrowheads.
4. Layout from left to right. Children flow left to right inside their box.
5. Wires that cross a box edge take part in the layout (the recipe's step 7). If crossings remain, try `elk.hierarchyHandling: INCLUDE_CHILDREN` once, measure both and keep the better one.
6. Wires run under node bodies, never over a label.
7. A wire whose other end is hidden is not drawn. The visible end shows a count on its pin, such as "3 code".
8. Node anatomy: a header strip coloured by node kind, with the icon and the title in it. The status mark, the warning count and everything else a node shows today stay visible.
9. Selecting or hovering a node makes its wires stand out.

## Files the builder may touch

- `packages/webview/src/graph/**`
- `packages/webview/src/styles/**`
- `packages/webview/src/store/selectors.ts`, only to add a selector
- new test files under `packages/webview/tests/`
- `tools/e2e-wires.mjs` (new)
- this note: "Reuse record", "Builder notes" and "Results" only

## Acceptance checks

1. `node tools/verify.mjs all` passes and the test count does not go down (249 today).
2. `node tools/e2e-wires.mjs` passes. On the fixture: 0 crossing samples and 0 loose ends. On this repo: 0 loose ends, at most 5% of wires with a crossing sample, and at least 80% fewer crossing samples than before the change. The numbers from before are in "Results".
3. At least 90% of drawn wires run left to right (the target pin is to the right of the source pin).
4. `node tools/e2e-live.mjs` and `node tools/e2e-edit.mjs` still pass.
5. The time from page load to a laid-out graph of this repo is at most 1.5 times what it was before. Both numbers are in "Results".
6. No new dependency. No console error on either page.
7. Frames under `.runs/`: this repo at fit, this repo zoomed, the fixture with its marks, and one node selected. Each is named in the report.

## Not in this lane

- Connecting or disconnecting by dragging a wire. Pins are not connectable yet.
- One pin per edge kind, reroute nodes, the menu on wire drop, levels of detail.
- The side panel, the live server, the spec writer, the drift check.

## Stop clause

Stop and report after 50 minutes, if the gate cannot be made green in two tries, or if neither layout approach brings the crossing count on the fixture to 0. Report what was measured.

## Reuse record

(the builder fills this in: what was looked at, and adopt, borrow or skip for each)

## Builder notes

- `@xyflow/react` installed is 12.10.2. `zIndexMode` exists (`'basic'` default, `'auto'`, `'manual'`). In basic mode an edge that touches a child node takes the child's z, which is why those wires render above the box (read in `@xyflow/system` `getElevatedEdgeZIndex`).
- The measure counts a pin only when its handle is visible (opacity above 0). Distances are in flow units (screen px divided by zoom). Crossing samples skip the wire's own end nodes and the boxes that hold them.
- "Hidden" here means the other layout block: the code block is laid out below the spec block and is off screen at first (`onlyRenderVisibleElements`), so the 1,127 code nodes are not in the DOM on the first view.

## Results

Before, on `blueprint-wires` at `c1b70e5` (same as `night-1`), `node tools/e2e-wires.mjs`, viewport 1280 x 800, first view:

| Page | Wires drawn / in graph | Crossing samples | Wires with a crossing | Loose ends | Left to right | Laid out |
|---|---|---|---|---|---|---|
| fixture | 6 / 8 | 40 | 5 (83%) | 12 | 1 of 6 (17%) | 321 ms |
| this repo | 16 / 1094 | 105 | 9 (56%) | 32 | 1 of 16 (6%) | 1908 ms (median of 3) |

Result line: `FAIL e2e-wires (35.5s) - fixture has 40 crossing samples; fixture has 12 loose ends; ...`. Every end is loose because the four-side handles are invisible (opacity 0), so no end sits on a visible pin.
Edge mix: this repo has 12 intent to own concept, 4 constraint to intent, 1078 code symbol to code module. The fixture has 4 node to own concept and 2 code symbol to intent.
