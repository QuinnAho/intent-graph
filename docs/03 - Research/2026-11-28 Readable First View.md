# Readable first view and steady boxes

Date: 2026-11-28. Tags: read = from docs or code, run = my spike, reasoned = my own inference.

## The answer in five lines

1. Layout shape alone cannot fix the first view. The best top-level shape I measured gives 4.2 px text at 480 px wide (run). The spec block is about 1900 to 2100 px wide and 1400 to 1600 px tall whatever the shape.
2. Fix it with a text floor: never fit below zoom 0.7 (13 px title becomes 9.1 px). When the whole block does not fit at the floor, start at the top-left region that does (reasoned, common practice).
3. Layout that follows the window (`rectpacking` with `elk.aspectRatio`) is a second step. It gains 13 to 30 percent of zoom (run).
4. For steady boxes, keep every top-level box where it was and only push apart what the toggled box now overlaps. ELK's interactive options changed nothing in my spike (run).
5. Unfolding 16 proposals grows a concept from 498x470 to 1378x1730 (run). Cap that growth to one direction, or no push can be small.

## A. What node tools do (one line each)

- Unreal Blueprint: a fixed zoom floor (-12), no text-hiding setting found, users complain the floor is too tight and ask for fit-all. Source: community reports only (not official docs). Read.
- React Flow: `fitView` takes `padding`, `minZoom`, `maxZoom`, `nodes`, `duration`. The docs page gives types only, no behaviour text. Read. The Performance page advises showing few nodes and letting people expand, by toggling `hidden`. It does not mention zoom-based detail. Read.
- React Flow source (installed 12.10.2): fit zoom = min(usable width / box width, usable height / box height), then clamped to minZoom and maxZoom. A numeric padding of 0.2 leaves 1/1.2 of each side usable. Read.
- tldraw: `zoomSteps` first value is the minimum zoom, `initialZoom` can be fit-x, fit-y, fit-min, and the "-100" variants cap at 100 percent. Zoom to fit pads 128 px. Read (search summary of its docs).
- Figma: Shift 1 fits all, Shift 2 fits the selection. Its low-zoom text behaviour I could not confirm. Read for the shortcuts only.
- yEd, Obsidian canvas: not looked up.
- Common practice, in my reading: a zoom floor on the fit, an explicit fit-to-selection, and detail that drops out when zoomed far out. A minimap and a window-shaped layout are rarer. The floor plus fit-to-selection is the least work (reasoned).
- The repo has a zoom hook with three tiers (overview below 0.6, mid below 1.5). Its result is only passed up through an optional prop; I found no component that reads it (read, `useZoomLevel.ts`, `GraphCanvas.tsx` lines 479 to 492).

## B. Window shape

Read (ELK 0.9.3 in the repo):
- `elk.aspectRatio` is "width divided by height", applies to parents. Rectpacking lists it with default 1.3. Layered accepts it too (run: it changed the result).
- `rectpacking` is for graphs without edges, keeps the given order, fills rows, then compacts.
- `layoutNested` passes only `algorithm layered`, direction RIGHT, nodeNode 64, betweenLayers 120, padding 30. No aspect ratio, so the arrangement ignores the window.
- The spec block has 16 edges, none between top-level boxes, so layered stacks the 11 top-level boxes in 6 columns whatever the window.

Run: the real nested layout on this repo's `/graph.json` (6 concepts, 12 intents, 4 constraints, folded proposals). Only the top-level options changed per variant. Zoom is the fit rule above (padding 0.2, min 0.05, max 1.2). Title text is 13 px (nodeChrome). Window sizes are used as the canvas size, no toolbar taken off.

| Variant | Window | Box (px) | Cols | Zoom | Title px |
|---|---|---|---|---|---|
| current layered | 1440x900 | 2126x1540 | 6 | 0.487 | 6.3 |
| current layered | 700x800 | 2126x1540 | 6 | 0.275 | 3.6 |
| current layered | 480x800 | 2126x1540 | 6 | 0.188 | 2.4 |
| layered + aspectRatio | 700x800 | 1068x2430 | 3 | 0.275 | 3.6 |
| layered + aspectRatio | 480x800 | 1068x2430 | 3 | 0.275 | 3.6 |
| box + aspectRatio | 1440x900 | 1902x1360 | 6 | 0.551 | 7.2 |
| box + aspectRatio | 700x800 | 1418x2284 | 4 | 0.292 | 3.8 |
| box + aspectRatio | 480x800 | 1090x2052 | 3 | 0.326 | 4.2 |
| rectpacking + aspectRatio | 1440x900 | 1902x1378 | 6 | 0.544 | 7.1 |
| rectpacking + aspectRatio | 700x800 | 1652x1590 | 5 | 0.354 | 4.6 |
| rectpacking + aspectRatio | 480x800 | 1090x2088 | 3 | 0.320 | 4.2 |

Reading it: the walk's zoom 0.48 at 1440 is reproduced (0.487). Window-shaped layout helps most in the narrow window (2.4 to 4.2 px) but nobody reaches 9 px. Even three columns are 1090 px wide, so at 480 px the fit shows 1090 / 400 usable = zoom 0.33 at best. Reasoned: for 9 px text at 480 px wide you can show about 530 graph px across, one column of one box.

The spike did the whole spec block (nested), not the code block. The code block is not in the first fit if the fit nodes are the spec nodes (not checked).

## C. Keeping other boxes still

Run: unfold the concept with the most proposals (16) and compare the top-level boxes before and after.
- layered, relayout: 7 of 10 other boxes moved, up to 1619 px.
- layered with `elk.interactive`, INTERACTIVE layering and cycle breaking, `semiInteractive`, previous x and y passed in: identical to the line above. No effect (run). Likely because top-level boxes have no edges (reasoned).
- rectpacking, relayout: 8 of 10 moved, up to 2762 px. With `elk.interactive` passed: identical, no effect (run).
- push apart after the layout (keep old positions, push down only boxes the grown box now overlaps): 5 of 10 moved, up to 2266 px. The toggled box keeps its own place.

Why it still moves: the box grew 880 px wider and 1260 px taller, and it now overlaps whatever was beside and below it. Something must give way (reasoned).

Smallest that works with children-then-parents (reasoned):
1. After a toggle, lay out only the toggled box's inside (its children), take its new size.
2. Keep all other top-level positions from the store.
3. Push apart: sweep boxes by y, if one overlaps a placed box (gap 64), move it down to clear.
What breaks: a later fold does not pull boxes back, so gaps stay (acceptable, or "tidy" on F). Growth in two directions pushes diagonally. Capping the unfolded proposals to one column keeps the push to the boxes below, in the same column.
Read: the React Flow expand and collapse page only says it recalculates layout, it does not keep others still. ELK's `interactive` is described as "modify the current layout as little as possible", with each algorithm free to interpret it. Rectpacking lists `desiredPosition` and `currentPosition` with no description; I did not test them.

## D. Recommendation

Problem 1, first view:
1. Fit floor: `minZoom` 0.7 on the fit call only (13 px title becomes 9.1 px). Keep the person's own zoom floor at 0.05.
2. If the fit would go under 0.7, fit instead to the top-left bounds of size (width / 0.7, height / 0.7), taken from the first top-level box. At 480x800 that is about 686x1143 graph px, enough for one box.
3. Show a "fit all" key (F already exists) and keep the 0.05 floor for it.
4. Next: top-level `rectpacking` with `elk.aspectRatio` = canvas width / height, relaid when the canvas changes by 8 px or more (existing refit rule). Expect +13 to +30 percent zoom.
5. Later: below zoom 0.6 show titles only, using the existing hook; a minimap; text floor in px as a setting.

Problem 2, steady boxes:
1. Build the push-apart pass, gap 64, applied to top-level boxes only.
2. Cap an unfolded concept's proposals to one column of 420 px so growth is down only.
3. Leave ELK interactive options out. No effect measured.
Later: pull boxes back on fold, the same pass for opening an intent's code rows.

## Sources

- https://reactflow.dev/api-reference/types/fit-view-options
- https://reactflow.dev/examples/layout/expand-collapse
- https://reactflow.dev/learn/advanced-use/performance
- https://reactflow.dev/learn/layouting/sub-flows
- https://eclipse.dev/elk/reference/options/org-eclipse-elk-aspectRatio.html
- https://eclipse.dev/elk/reference/options/org-eclipse-elk-interactive.html
- https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-rectpacking.html
- https://tldraw.dev/sdk-features/camera (via search summary)
- https://forums.unrealengine.com/t/zoom-out-further-than-12-in-blueprint-editor/52293
- https://help.figma.com/hc/en-us/articles/360041065034
- Repo: view-tuning, nested layout, fit rule, node chrome, and the earlier note "2026-11-27 Blueprint Style Graph".

## Not verified

- Epic's own docs on zoom behaviour, Figma, yEd and Obsidian canvas text at low zoom.
- Whether `rectpacking` or `box` as top-level algorithm keeps the band and fold-row logic right (the spike ran, nobody looked at a frame).
- The code block layout and the fit with it; real canvas sizes inside the page and panel.
- ELK interactive options on a top level that has edges; `desiredPosition` and `currentPosition`.
- That 9 px is readable on a real screen (eyes check needed).
