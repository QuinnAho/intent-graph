---
updated: 2026-11-28
---
# First use walk, 2026-11-28

A first-time walk through the page (1440 by 900, 900, 480 wide) and the VS Code panel (about 700 px wide), on this repo and on the small example (`tests/fixtures/live-workspace`). Branch `day-2`. Editing was tried only on temp copies. Frames are in `docs/05 - Log/Frames/2026-11-28 Walk/`.

## Verdict

- The state bar, the fold and the Accept, Edit title, Dismiss buttons read well without help, and dragging a wire feels close to Blueprint.
- The first view fails the "clear at first sight" ask: text is 3 to 6 px on this repo, the legend covers the graph, and nothing says where to start.
- The graph never gets you from an intent to code: the "code" chips are dead, the code block lies far below the first view, and anchors are plain text.

## Ranked moments

Severity: blocks (cannot do the thing), slows (does it with doubt or extra steps), cosmetic.

| # | Moment | What a first-time user sees or expects | Severity | Known? | Frame | Smallest fix to try |
|---|---|---|---|---|---|---|
| 1 | From an intent to its code | Selects an intent and sees `realized_by: src/math.ts#add` as plain text. The "1 code" chip on the node does nothing (a hover says "not drawn, in the other block"). Expects a click to show or open the code. | blocks | partly known (no code open yet) | w11, w12 | Make the chip and each anchor line a link: select and pan to the code node, and in the panel send an open message. |
| 2 | Where is the code? | On the example the first view (and F) shows only the spec block. The code files and test files sit about 500 px below, so the wires between the blocks are never seen. Zoomed out, they show (w12). F fits to 5 nodes, not 11. | blocks | partly known (480 px note) | w10, w12, w13 | Fit to both blocks on first load, or draw a ribbon of "1 code" that jumps there. |
| 3 | Text size at first view | This repo at 1440 wide: node text about 5 to 6 px (scale 0.48). In the panel at 696 px wide: 3.1 to 3.6 px. At 480 px: about 2.5 px. Nothing can be read without zooming. | blocks (panel, narrow), slows (wide) | known (480 px only) | w01, w24, w23 | Fit to the spec block only, with a floor of 8 px text, and let the code block sit off view. |
| 4 | Legend covers the graph | On a first visit in a wide window the legend fills the right 300 px and hides a whole concept. The graph does not move over. A first-timer must find the close button first. | slows | known | w01 | Dock the legend (shrink the canvas) or start it closed with a visible "?" pulse. |
| 5 | No hint in the panel | In the VS Code panel the legend did not open at all, so a first view has no explanation of the marks, the keys or the robot. Only a small "?" at the right edge. | slows | new | w24 | Open the legend once per workspace in the panel too, or show a one-line "Click ? for what the marks mean". |
| 6 | Pending everywhere | 22 pending, 0 verified, 0 failing, "no drift report". A first-timer cannot tell whether the project is fine or the tool has nothing to say. "Pending" has no tooltip on the node. | slows | known (nothing bound to code) | w01, w04 | Under the bar, one line: "No intent is linked to a test yet. Link one in verified_by to see a verdict." |
| 7 | Click selects and edits at once (write mode) | A single click on a node puts the title into an edit field and opens the form with Save and Cancel. Expects a click to only select. Right-click also leaves the title in edit mode behind the menu. | slows | new | w11, w14 | Select on click, edit on double-click or F2 (as the legend says). |
| 8 | Right-click menu is thin | Only "Rename" and "Edit details". No delete, no "move under", no "add intent", no "copy id". Blueprint users expect a node menu that carries the actions. | slows | new | w14 | Add Delete, Move under..., Add intent here, Reveal code. |
| 9 | Add intent | The plus in the concept header has no label until hovered. The form lists nine raw kind names, one of them preselected (`code_module`), and "Pick at least one". | slows | known (nine kinds) | w17 | Label the plus "Add intent". Default to the two words the spec README uses, hide the rest under "more". |
| 10 | Accept lands in an edit form | After Accept (about 6 s from click until the node left the fold and the counts changed) the new intent opens with an empty-looking edit form with Save and Cancel. A first-timer wonders whether Accept worked or needs a Save too. | slows | new | w08 | Show a toast "Accepted as intent, file written to spec/intents/..." and leave the panel in read view. |
| 11 | Proposals look disabled | Nodes marked "planned" are dimmed to near-invisible. The tags "confidence semantic" and "planned" mean nothing to a newcomer. | slows | new | w05, w06 | Do not dim; label "planned" in words ("code not written yet") and drop "confidence semantic". |
| 12 | Unfolding moves everything | Opening one fold (about 1.6 s here) lays out again. The other concepts jump, and the clicked fold ends up far to the right. | slows | known | w05 | Keep the other concepts where they are; grow the unfolded one downward. |
| 13 | Moving an intent | Drag from the 4 px right pin onto another concept: green targets show, the wire is dashed, a toast says "Moved ... Undo". Hesitation was the pin size (4 px) and the fact that the right pin means "hang me under". 2.5 s after the drop the view still looked unchanged (not confirmed that it is wrong). | slows | new | w18, w19 | Make the pin hit area 12 px, add a "drag to a concept to move" tooltip on the pin. |
| 14 | Problems list takes the whole width | Clicking "1 problem" pushes the graph down under a banner. The text is clear ("Run node tools/drift.mjs again"), though the fix is a command line. (The problem itself came from the temp copy.) | cosmetic | new | w07 | Dock it as a drawer, with a "copy command" button. |
| 15 | Side panel covers the graph | In the panel at 696 px, the detail pane is about half the width and covers the graph. Dragged narrower, the pane fills almost all of it and the bar wraps to 6 lines. | slows | new (narrow is known) | w25, w26 | Under 600 px, open the detail pane as a bottom sheet, and wrap the bar into one scrolling line. |
| 16 | Leaving and coming back | After a page reload: the fold, the selection and the zoom are gone (legend stays closed on the same address). After closing and reopening the panel (2.0 s): selection gone, the graph is fitted again and shows tiny at narrow width. | cosmetic | known (legend per address) | w21, w28 | Keep open folds and the selected id in the page state, per workspace. |
| 17 | Header says nothing about the project | The bar names no folder and does not say it is live. In the panel a "Read only" line is repeated again inside the detail pane. | cosmetic | known | w04, w24 | Show the folder name left of the bar, drop the repeat in the pane. |
| 18 | Light editor | Page stays dark in a light editor. Not walked on a light theme, taken from the Board. | cosmetic | known | w02 | Pass the theme in. |

## What works well

- The bar counts each state in plain words, and the example reads at a glance: "verified" in green, "pending" dashed, a warning on the bad-anchor node (w10).
- The fold: one row per concept, "11 inferred", opens with one click and a clear title on hover (w05).
- Proposals: the detail pane says what the code is for, where it was read from and the evidence, and Accept, Edit title and Dismiss are right under it with the key hints (w06).
- In-place rename: a double-click, type, Enter. The file was written in under half a second, and Ctrl+Z restored the old title in about 1.5 s (w15).
- Drag a wire: valid targets turn green, the wire is dashed while dragging, and the toast has an Undo button (w18, w19).
- The panel opened by itself in about 9 s from start (this machine) and a reopen took 2.0 s.
- At 900 px wide the graph still reads in blocks (w22).

## Not walked, and why

- Dismiss and Edit title on a proposal: seen as buttons and read from the legend, not clicked, to stay inside the time box.
- Connect and disconnect by a wire, other than the move: the spec format holds one relation (`parent`), so there is only one wire kind to try. Disconnect (select a wire, Delete) was not clicked.
- The VS Code panel in edit mode: the browser edit walk stands in for it.
- A light theme.
- The "needs attention" walk through states by clicking a count: one count was clicked (problems), the others have nothing in them on this repo.
- Failing and drift marks: this repo has none, and the example has no drift report.

Harness note, not a product fault: my VS Code showed a notice "All installed extensions are temporarily disabled" because the launcher turns extensions off. A first-time user will not see it.
