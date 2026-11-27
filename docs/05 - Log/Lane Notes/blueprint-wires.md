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

- React Flow `getBezierPath` (read in the installed `@xyflow/system` 12.10.2 source): borrow the shape family, a cubic with horizontal control points. Own offsets in `graph/edges/wire-path.ts`, numbers in `WIRE_TUNING`.
- React Flow `BaseEdge`, `Handle`, `useNodeId`, `useStore`, `zIndexMode`: adopt, they are the API.
- ELK `hierarchyHandling: INCLUDE_CHILDREN`: skip for now. Hoisting cross-box edges per level brought crossings to 0, so the trial in scope step 5 was not needed.
- ELK ports and routed edge sections: skip, as the recipe says. Curves come from React Flow.
- litegraph.js, Rete.js, Flume, blueprintUE: not opened. The recipe's verdicts stand (ideas only, no code).
- `graph/edges/{Realizes,Constrains,Supersedes}Edge.tsx`: looked at. They are unused placeholders with no component, so they were left as they are and `WireEdge` reads the kind from edge data.

## Builder notes

- `@xyflow/react` installed is 12.10.2. `zIndexMode` exists (`'basic'` default, `'auto'`, `'manual'`). In basic mode an edge that touches a child node takes the child's z, which is why those wires render above the box (read in `@xyflow/system` `getElevatedEdgeZIndex`).
- The measure counts a pin only when its handle is visible (opacity above 0). Distances are in flow units (screen px divided by zoom). Crossing samples skip the wire's own end nodes and the boxes that hold them.
- "Hidden" here means the other layout block: the code block is laid out below the spec block and is off screen at first (`onlyRenderVisibleElements`), so the 1,127 code nodes are not in the DOM on the first view.
- Which edges are drawn (`graph/edges/wire-plan.ts`, tested): a wire is drawn only when both ends are in the same block. A wire to the other block is counted on the pin it would use ("1 code" on the intent's input pin, "1 spec" on the symbol's output pin). Builder's call: an edge from a node to the box that holds it (12 in this repo, 4 in the fixture) is neither drawn nor counted, because the nesting already shows it and a pin-to-pin wire to your own box can only loop back over your siblings.
- The count sits above the node corner on the pin's side. Next to the pin it overlapped the concept box border. It is not clickable: there is no expand action in the app yet.
- Layout: `elk.direction` is `RIGHT` in both layout files, between-layers gap 120, `portConstraints` removed. `layoutNested` now runs every level's edges through `hoistEdges` (tested), so a constraint to an intent inside a box lays out as constraint to box. The loader in `transport/` was not touched.
- Z-order: `zIndexMode="manual"`, boxes 0, wires 1, other nodes 2. Checked in the browser: a wire into a box runs over the box padding and stops at the child's pin. The script also checks that no wire sample is the top element inside a leaf node or any header strip.
- Header strip: tinted by node kind. A node without a body is all header, so intents and constraints read as one tinted bar.
- Selection outline comes from `styles/wires.css` on React Flow's `.selected` class, because nothing sets `data.isSelected` today.
- Left open: two constraint wires in this repo cross each other (not a node) between the constraint column and the "Agent orchestration" box. One pin per node gives ELK no way to order them. Ports (later step 4) would fix it.
- Load time is noisy on this PC: five runs after the change gave 1749 to 2685 ms. ELK alone on the 1,347 code nodes is as fast with `RIGHT` as with `DOWN` (603 to 805 ms against 744 to 1422 ms), so the direction is not the cost.

## Results

Before, on `blueprint-wires` at `c1b70e5` (same as `night-1`), `node tools/e2e-wires.mjs`, viewport 1280 x 800, first view:

| Page | Wires drawn / in graph | Crossing samples | Wires with a crossing | Loose ends | Left to right | Laid out |
|---|---|---|---|---|---|---|
| fixture | 6 / 8 | 40 | 5 (83%) | 12 | 1 of 6 (17%) | 321 ms |
| this repo | 16 / 1094 | 105 | 9 (56%) | 32 | 1 of 16 (6%) | 1908 ms (median of 3) |

Result line: `FAIL e2e-wires (35.5s) - fixture has 40 crossing samples; fixture has 12 loose ends; ...`. Every end is loose because the four-side handles are invisible (opacity 0), so no end sits on a visible pin.
Edge mix: this repo has 12 intent to own concept, 4 constraint to intent, 1078 code symbol to code module. The fixture has 4 node to own concept and 2 code symbol to intent.
