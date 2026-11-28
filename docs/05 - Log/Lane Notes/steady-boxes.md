---
lane: steady-boxes
branch: steady-boxes
worktree: .wt/steady-boxes
status: ready, starts after lane 17 is merged
go: owner, 2026-11-28 (polish and UX passes)
---
# Lane 18: opening one thing moves only what it must

## The ask

The owner, paraphrased: keep doing polish and UX passes after lane 13. Earlier: editing and reading the graph has to be easy and intuitive.

The first-time walk of 2026-11-28 ranked it twelfth: opening one fold lays the whole graph out again, the other concepts jump, and the clicked one ends up far to the right. It has been under Known on the [[Board]] since lane 12, and lane 13 added a second thing that opens. The research pass measured it and tried the fixes: [[2026-11-28 Readable First View]], sections C and D. Read that first.

## What exists (read these, not the whole tree)

Paths under `W/` are `packages/webview/src/`. Names are given, not line numbers. Read the builder notes of [[fold]], [[nested-code]] and [[readable]] first.

- **Every toggle lays out everything.** `refold()` in `W/transport/graph-json-loader.ts` calls `applyLayout()`, which runs `layoutNested()` (`W/graph/layout/nested.ts`) on the spec block and on the code block. Lane 13 added a cache per block (`W/graph/layout/layout-cache.ts`), so an unchanged block is not laid out again.
- **After a toggle the view is shifted** so the toggled node's header stays where it was on screen. The other boxes are not kept.
- **Measured on this repo** (research note, run): unfolding the concept with 16 proposals grows it from 498 by 470 to 1378 by 1730, and a full layout then moves 7 of the 10 other top-level boxes, by up to 1619 px. ELK's interactive options changed nothing. A push-apart pass after the fact moved 5 of 10.
- **Unfolded proposals** are a second band below the declared children (`bandOf` in `applyLayout`), laid out by ELK in as many columns as it likes.
- **An open intent** grows downward only, by 26 px a row (`NEST_TUNING` in `W/graph/view-tuning.ts`).
- **Promises that must keep holding**: closing everything puts every node back within 1 px (`tools/e2e-nested.mjs`), no two boxes overlap, every child is inside its parent, no wire runs through a box in the folded first view (`tools/e2e-wires.mjs`), and what is open survives a live update.

## Scope

1. **Home.** The layout with everything folded and closed is the home of every box. It is computed as today and kept. Nothing in this lane changes what the first view looks like.
2. **A toggle lays out only the inside of what changed.** Opening or closing an intent, or folding or unfolding a concept, gives that box a new size. Inside its concept the children are placed again. No other concept's inside is laid out.
3. **Every other box stays at its home**, to the pixel, unless it would now overlap a box that grew.
4. **Push apart.** A box that would overlap moves the least it must, away from the grown box, in one direction: down when it lies below, right when it lies beside. The gap between boxes stays 64 px or more. A box pushed into a third box pushes that one on.
5. **Always from home.** Positions are worked out from home and the current sizes, never from the last positions. So the order of opening does not matter, the same set of open things always gives the same picture, and closing everything gives home back within 1 px.
6. **Unfolded proposals grow downward.** They go in one column when there are 8 or fewer, else in two columns of even length, and never wider than the concept already is unless it holds two columns. Say in the builder notes what the largest concept of this repo measures unfolded, before and after.
7. **The code block** stays below the spec block and moves down by what the spec block grew. Its inside is not laid out again.
8. **The view.** The toggled box's header stays within 40 px of where it was on screen, as today. Nothing else scrolls or zooms by itself.
9. **Wires** follow the boxes. After a push no wire end hangs loose.
10. **A live update** that changes the graph's shape (a node added, removed or moved to another concept) computes a new home, then applies what is open on top. A live update that changes no shape moves nothing.
11. **Speed.** On a copy of this repo: unfolding the largest concept, click to settled, median of 5 under 1.0 s. Opening an intent under 0.8 s. Write the old and new numbers in the builder notes.
12. **Measure and print, in the scripts**: for the unfold of the largest concept and for one open intent on the repo copy, how many other top-level boxes moved and by how far at most. Assert: no box above or to the left of the toggled one moves at all, and no box moves in two directions.
13. `tools/e2e-fold.mjs` and `tools/e2e-nested.mjs` gain the steps of 12, the order test of 5 (open A then B equals open B then A, within 1 px), and close-all-gives-home. `tools/e2e-wires.mjs`: its unfolded count is still printed. No assertion goes away.
14. Frames under `.runs/frames-lane18/`: this repo before and after unfolding the largest concept, at the same zoom and the same view, as a pair, and the example with two intents open.

## Files the builder may touch

- `packages/webview/src/graph/layout/**`, `src/graph/fold-model.ts`, `src/graph/nest-model.ts`, `src/graph/view-tuning.ts`
- `packages/webview/src/transport/graph-json-loader.ts`: `applyLayout()`, `refold()` and what they call, nothing else in the file
- `packages/webview/tests/**`
- `tools/e2e-fold.mjs`, `tools/e2e-nested.mjs`, `tools/e2e-wires.mjs`
- this note: the reuse record and the builder notes

If the work needs a file outside this list, change it and name the file and the reason in the report. Another lane draws agents on the page at the same time: do not touch `packages/webview/src/app/**`, `src/store/**`, `src/graph/nodes/**`, `src/styles/**`, or the loading and merging code in `graph-json-loader.ts`.

## Acceptance checks

1. `node tools/verify.mjs all` ends with a `PASS all` line, and the test count is not lower than on the lane's base.
2. `node tools/e2e-fold.mjs` and `node tools/e2e-nested.mjs` pass five times in a row each.
3. Every other end-to-end script still passes.
4. No new dependency. No existing assertion removed or loosened.
5. The frames of step 14 exist.

## Not in this lane

- A layout that follows the window's shape, and levels of detail when zoomed out.
- A "tidy" action that lays everything out fresh. F only fits.
- Animation of the move.
- Any change to the first view, the fit, or what the page draws on a node.

## Stop clause

Stop and report after 90 minutes, or if the gate cannot be made green in two tries. Stop and say so if home cannot be given back within 1 px, if a push would have to move a box above or to the left, or if a check can only pass by loosening an older assertion.

## Reuse record

Looked at before the start, the builder adds what it finds:

- ELK `interactive`, `semiInteractive` and fixed positions: measured in the research pass, no effect on a top level without edges. Skip.
- React Flow's expand and collapse example: it lays everything out again. Skip.
- A push-apart sweep after the layout: build it, about the size of a page. The research spike has one in the scratch folder of that pass (not in git), as a starting point only.
- The layout cache of lane 13: adopt, home is its natural content.

## Builder notes

## Results

## Orchestrator's check
