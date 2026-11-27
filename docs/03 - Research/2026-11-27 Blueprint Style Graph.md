# Blueprint-style graph: research and recipe

Date: 2026-11-27. Goal: move the React Flow graph toward the Unreal Blueprint feel: pins on node sides, smooth wires, left-to-right flow.

Answer first. Step one is small: put one input pin on the west side and one output pin on the east side of every node, flip the layout to left-to-right, and draw all wires with one custom bezier edge. Do not draw ELK's own routes. Wires to hidden code nodes are not drawn at all; the node shows a count badge instead.

Why wires cross boxes today (from the two frames and the code): the nodes have handles on all four sides, the layout runs top-down, and the layout only sees edges inside one box level (`layout/nested.ts` filters edges to the same level). Edges that cross a concept box are never laid out. The React Flow sub-flow page says edges that touch a node with a parent render above nodes, so they sit on top of labels.

## What Blueprint does

Ranked for a graph that is mostly read and sometimes edited. Source column: D = Epic docs read, M = from memory of the editor, not verified.

| Rank | Convention | Why it matters here | Src |
|---|---|---|---|
| 1 | Pins on the sides: inputs west, outputs east, flow runs left to right | Gives wires a fixed place to leave and enter. Fixes wires through labels. | M |
| 2 | Smooth horizontal-tangent wire, one thin line, leaves right and enters left | The look. Also makes direction readable without arrows. | M |
| 3 | Node anatomy: coloured header strip, title, pin rows below | Kind is readable at a glance. Pin rows give a stable place for count badges. | M |
| 4 | Pin colour by type, wire takes the colour of its source pin | Maps to edge kind (realizes, constrains, and so on). Epic says pins are "typically colour coded to reflect the type of connection". | D |
| 5 | Hover and selection: wire thickens, selected node outlines, connected wires highlight | Helps reading. Cheap. | M |
| 6 | Drag from a pin; compatible pins show a green check, incompatible ones show why not | Needed when editing. React Flow has `isValidConnection`. | D |
| 7 | Drop a wire on empty canvas: context menu to add a node, auto-connected | Fast authoring. Later step. | D |
| 8 | Levels of detail when zoomed out (titles only, then boxes only) | Large graphs. Not in Epic docs. | M |
| 9 | Reroute node (double-click a wire, or "Add Reroute Node" from a pin drag) | Tidies long wires. Epic describes it. Later. | D |
| 10 | Comment boxes that group nodes | The concept box already does this. Skip. | M |
| 11 | Details panel for the selected node | The webview likely has its own panel. Skip. | M |

Epic's reference pages on dev.epicgames.com load their text with scripts, so the fetch returned an empty page. Only the "Connecting Nodes" page gave text. Treat rows marked M as unverified.

## The recipe for step one

1. **Pins.** In `nodeChrome.tsx` replace `HiddenHandles` (lines 127 to 170) with two handles: `<Handle id="in" type="target" position={Position.Left}/>` and `<Handle id="out" type="source" position={Position.Right}/>`. Keep ids stable. Visible dot, 10 px wide, centred on the node edge, at the vertical middle of the header row. Fill by edge kind, ring only when nothing is connected. Add `isConnectable={false}` until editing exists.
2. **Edges.** Set `sourceHandle: 'out'` and `targetHandle: 'in'` on every edge when the edges are built. Source is the node that points to the other (for example intent to constraint, as the schema says: `src` to `dst`).
3. **One edge component.** Write `WireEdge.tsx`, register it for all kinds in `edgeTypes` (defined outside the component), and let `Realizes`, `Constrains`, `Supersedes` only pass a colour and dash. It receives `sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition`. Render `<BaseEdge id path style interactionWidth={16}/>`.
4. **Wire path** (see the next section for the formula): stroke 2 px, hover 3 px, hit area 16 px, colour from the source pin kind at 0.85 opacity, 1.0 when selected or when either end is selected.
5. **Layout.** In `layout/index.ts` and `elk.worker.ts` change `elk.direction` from `DOWN` to `RIGHT`. Remove `portConstraints: FIXED_ORDER` (it does nothing without ports). Keep spacing: `nodeNodeBetweenLayers` 84 to 120 so wires have room to curve, `nodeNode` 64.
6. **Boxes.** In `nested.ts` keep the per-level pass. After a box is laid out left to right, its children flow left to right inside it. Keep `groupPad` and `groupHeader`.
7. **Cross-box edges.** Edges between a node inside a box and a node outside it are not in any level. Hoist each one to the top level: for layout only, replace an endpoint inside a box with that box's id. This puts boxes in columns by dependency.
8. **Z-order.** Set `zIndexMode="basic"` and give edges `zIndex: 0` and all nodes (boxes included) `zIndex` 1, children 2, so wires run below node bodies. Check this in the browser, because the sub-flow page says edges touching a child render above nodes by default. If wires still cross a body, that is the cue for the next step, not for z-index tricks.
9. **Hidden code nodes.** Do not pass edges to hidden nodes to React Flow. Count them per visible node and show a badge on the output pin: "3 code". Click expands (existing expand action). No stub line.
10. **Show it.** Frames: `1a` and `1e` again, same data. Pass when no wire crosses a label and no wire ends in empty space.

### The wire formula

React Flow's `getBezierPath` (read in source) uses a cubic with horizontal control points. With `dx = targetX - sourceX`: if `dx >= 0` the control offset is `dx / 2`. If `dx < 0` it is `curvature * 25 * sqrt(-dx)` with curvature 0.25. Default curvature 0.25. Example from the docs: from (0,20) to (150,100) gives `M0,20 C75,20 75,100 150,100`.

Blueprint feel, own numbers (the Blueprint values are from memory, not verified):

- `dx = targetX - sourceX`, `c` = control offset.
- Forward (`dx >= 0`): `c = max(40, min(dx / 2, 220))`.
- Backward (`dx < 0`): `c = clamp(60 + |dx| / 4, 60, 240)`. The wire leaves east, loops, enters from the west, and does not fold through the node.
- Path: `M sx,sy C sx+c,sy tx-c,ty tx,ty`.
- Same row (`dy` near 0) and `dx >= 0`: still use the formula. It becomes a straight line.
- Stroke 2 px, hover 3 px, hit area 16 px. Dash only for `supersedes` (6 4). No arrowheads; direction comes from the pins.
- Blueprint's own tangent is, as far as I recall, about `|dx|` clamped at 1000 in the x direction. The pin-to-pin shape is the same family.

## Later steps

Ranked.

1. Hover highlight: dim all wires except those of the hovered or selected node. Use the `isDimmed` flag already in node data.
2. Wire label chips at the midpoint (`EdgeLabelRenderer`) for kind and drift count, shown only when zoom is above 0.8.
3. Level of detail: read zoom with a store selector (`useStore((s) => s.transform[2])`, boolean result so it does not rerender on every pan). Below 0.5 hide the pin rows; below 0.3 show boxes only. Set `onlyRenderVisibleElements` if the graph passes about 500 nodes.
4. Several pins per node, one per edge kind, with the colour table. Then ELK ports become useful.
5. Editing: `isValidConnection` on `<ReactFlow>` (not per Handle, the docs advise this), `onConnect` to create the edge, `onConnectEnd` with `connectionState.isValid === false` to open a menu at the drop point (convert with `screenToFlowPosition`).
6. Reroute nodes for long wires. Only if wires still tangle after step one.
7. ELK-routed edges, only if curves still cross bodies after step one (see below).

### Layout: ELK routes or React Flow curves

Use React Flow curves. Reasons: ELK routes are orthogonal polylines, which is a different look from Blueprint; the route is stale as soon as a node is dragged; and a nested layout here runs per level, so ELK never sees whole wires anyway. If routes are wanted later, the options are:

- `elk.algorithm: layered`, `elk.direction: RIGHT`
- `elk.hierarchyHandling: INCLUDE_CHILDREN` on the root (one run for all levels, verified: it lets cross-box edges lay out). This replaces step 7 and makes `nested.ts` mostly unnecessary.
- Ports on each node: `port.side` `WEST` for inputs and `EAST` for outputs, `elk.portConstraints: FIXED_SIDE` on the node (the option exists; its meaning is from the ELK naming, not from its page).
- `elk.edgeRouting: SPLINES` or `ORTHOGONAL`, then draw the `sections` points.

## Hidden targets

How editors do it (from memory, not verified): Blender and ComfyUI collapse a node and keep wires on the collapsed shell; Unreal keeps wires on a collapsed node; n8n and Node-RED show a count. No editor draws a wire to nothing.
Here: hide the edge, show a count badge on the visible end. The badge is the way back in. Optional later: on hover, ghost the hidden nodes at 0.1 opacity (the `isGhosted` flag exists).

## Reuse

| Project | License | Verdict |
|---|---|---|
| React Flow examples (add-node-on-edge-drop, elkjs, custom edges) | MIT | Adopt. They are the API reference for this recipe. |
| litegraph.js (Comfy-Org fork) | MIT | Borrow an idea: pin shapes and the link-midpoint marker. Skip the code, it is canvas based. |
| Rete.js (v1.5.2 checked) | MIT | Borrow an idea: typed sockets with a compatibility table. Skip the code, own renderer. |
| Flume | MIT | Borrow an idea: socket colours and the wire drawn from pin colour. Skip the code. |
| blueprintUE self-hosted | MIT | Skip. It renders Unreal paste text; not a graph editor library. |

Licenses were read from the GitHub API (`license.spdx_id`) or `package.json` on 2026-11-27. The litegraph LICENSE file URL I tried returned 404; the API said MIT.

## Sources

Read on 2026-11-27. V = read in full from the page or source; S = page seen only in part or through a summary.

- Epic, Connecting Nodes: https://dev.epicgames.com/documentation/en-us/unreal-engine/connecting-nodes-in-unreal-engine (V, text via fetch)
- Epic, Blueprint Editor references (two pages) : empty on fetch, not used.
- React Flow Handle: https://reactflow.dev/api-reference/components/handle (V)
- React Flow getBezierPath: https://reactflow.dev/api-reference/utils/get-bezier-path (V docs)
- React Flow bezier source, `packages/system/src/utils/edges/bezier-edge.ts` in xyflow/xyflow (S, summarised by the fetch tool, not read raw)
- React Flow add node on edge drop: https://reactflow.dev/examples/nodes/add-node-on-edge-drop (V)
- React Flow ConnectionState: https://reactflow.dev/api-reference/types/connection-state (V)
- React Flow props: https://reactflow.dev/api-reference/react-flow (V)
- React Flow sub-flows: https://reactflow.dev/learn/layouting/sub-flows (V)
- React Flow custom edges: https://reactflow.dev/learn/customization/custom-edges (V)
- React Flow ELK example: https://reactflow.dev/examples/layout/elkjs (V)
- ELK portConstraints: https://eclipse.dev/elk/reference/options/org-eclipse-elk-portConstraints.html (V, no value descriptions)
- ELK hierarchyHandling: https://eclipse.dev/elk/reference/options/org-eclipse-elk-hierarchyHandling.html (V)
- GitHub API for Comfy-Org/litegraph.js, chrisjpatty/flume, blueprintue-self-hosted-edition; Rete package.json (V)

Not verified: Blueprint pin colours, wire tangent numbers, reroute and comment details (Epic pages did not load); the exact `useStore` zoom selector against 12.10 (check the types before use); whether `zIndexMode` exists in 12.10 (a fetched doc lists it, the version was not checked); the sub-flow z-order claim in the running app; ELK `FIXED_SIDE` behaviour; how other editors show hidden targets.
