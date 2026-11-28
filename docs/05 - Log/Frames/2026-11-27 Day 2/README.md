# Frames from 2026-11-27, day 2

Every frame was taken by a script on committed code, on the small calculator example. Each has a verdict: what works, and what is not there yet.

## Lane 7: direct editing

| | |
|---|---|
| ![7a](7a-rename-in-place.jpg) | ![7b](7b-right-click-menu.jpg) |
| ![7c](7c-menu-read-only.jpg) | ![7d](7d-plus-in-header.jpg) |

- **7a, rename in place.** Works: a double-click on a title opens a field right on the node with the text selected. Enter saves, Esc cancels. The node keeps its size and its marks. This frame is a first double-click on a node that was not selected, the case the verifier found broken and a second agent fixed.
- **7b, the right-click menu.** Works: on a concept it offers "Add intent here", "Rename" and "Edit details", and the plus in the header does the first of these. Retaken after lane 8, where a right-click stopped opening the side panel, so the view no longer shifts under the menu.
- **7c, the menu in read only.** Works: the edit entries are disabled and say why. Seen by the verifier, not looked at again after the fix.
- **7d, the plus in the concept header.** Works: it replaces the floating button that could be cut off at the top edge.

## Lane 8: editing by wire

| | |
|---|---|
| ![8a](8a-dragging-a-wire.jpg) | ![8b](8b-connected-with-undo.jpg) |
| ![8c](8c-moving-into-a-concept.jpg) | ![8d](8d-moved-with-undo.jpg) |

- **8a, dragging a wire.** Works: a wire is pulled from a constraint's pin. The nodes that can take it are outlined in green, the rest are dimmed.
- **8b, connected.** Works: the constraint now hangs under the intent it was dropped on, and a notice says what happened, with an Undo button. Taken before the notices moved into their own strip, see `8d` for where they sit now.
- **8c, moving a node.** Works: an intent is dragged over another concept, and that box lights up because it would take it.
- **8d, moved.** Works: the intent sits in its new concept. The notice is in a strip under the canvas and covers no node.
- **8e, a refused drop** (`8e-refused-drop.jpg`). Works: "An intent can only hang under a concept, not a constraint. Nothing was changed."

Not yet, for both lanes: these frames are zoomed out, so the text is small. A code node's title was never tested. Nobody has tried any of it with a real mouse in a real browser window.

## Lane 10: inferred intents on the graph

Frames 10a to 10f were taken by the lane's end-to-end script on committed code, on the calculator example with a canned report. Frames 10g and 10h are this repo with its real report of 66 proposals, served from a temp copy. That report lives on the dev machine and is not in git.

| | |
|---|---|
| ![10a](10a-inferred-beside-declared.jpg) | ![10b](10b-panel.jpg) |
| ![10c](10c-accepted.jpg) | ![10f](10f-missing-anchors.jpg) |
| ![10e](10e-count-brings-into-view.jpg) | ![10d](10d-read-only.jpg) |
| ![10g](10g-real-repo-first-view.jpg) | ![10h](10h-real-repo-count-click.jpg) |

- **10a, inferred beside declared.** Works: a proposal has a dashed outline, the word "inferred" and a confidence word. A planned one is fainter and says "planned". One that restates a declared intent says "same as" and its title. The strip under the canvas counts them.
- **10b, the panel.** Works: what the code is for, the folder it was read from, the evidence, and three buttons with their keys spelled out.
- **10c, accepted.** Works: Enter wrote a real intent file, the node turned solid, and the notice has Undo.
- **10f, anchors that point at nothing.** Works: the file is still written, the notice says how many anchors point at code that is not there, and the node carries the warning mark. Found by the verifier and fixed by a second agent.
- **10e, the count brings a proposal into view.** Works: a click on the count selects the next proposal and moves the view to it, clear of the panel. Found by the verifier and fixed by a second agent.
- **10d, read only.** Works: proposals show, the buttons are off and the panel says why.
- **10g, this repo, first view.** Not yet: 66 proposals swamp the 12 declared intents. The view no longer fits the graph, and the wire from the lower constraint runs through two proposal boxes.
- **10h, this repo after one click on the count.** Works, with small text: the proposal is selected and in view, and its panel names the declared intent it restates.

Not yet for lane 10: frame 10g. A node shows no key hint until it is selected. Nobody has tried it with a real mouse in a real browser window.

## Lane 11: read the graph at a glance

Taken by `node tools/e2e-glance.mjs --lane-frames <dir> --repo-from <dir>` on the committed lane head `1a1a223`. Frames 11a to 11f are the small calculator example. 11g and 11h are this repo with its real inference report and a canned drift report on three real intents.

| | |
|---|---|
| ![11a](11a-first-visit.jpg) | ![11b](11b-daily-view.jpg) |
| ![11c](11c-count-click.jpg) | ![11f](11f-read-only.jpg) |
| ![11d](11d-900-wide.jpg) | ![11e](11e-480-wide.jpg) |
| ![11g](11g-real-repo.jpg) | ![11h](11h-real-repo-480.jpg) |

- **11a, a first visit.** Works: the legend opens by itself and says what each node kind, a dashed outline, the robot and each mark mean, drawn with the real pieces. It lists only kinds this graph holds. In a window 800 px tall the last drift row, the pins and the keys are below the fold, and the legend scrolls inside itself.
- **11b, the daily view.** Works: one bar across the top with a word beside every number. The spec, the checks, the drift verdicts, what a model inferred and the problems. A count of zero is dim. The robot sits on the two drift marks a model decided and on both inferred intents.
- **11c, a click on "1 drift".** Works: the count lights up, the node with that drift is selected and in view, and the panel says who decided it.
- **11f, read only.** Works: the bar says so and why, on a line of its own, and the plus in the concept header is gone.
- **11d, a window 900 px wide.** Works: the bar wraps onto two lines and nothing is cut off. This is the fault the verifier found, fixed by a second agent. An end-to-end case now checks 900, 700 and 480 px.
- **11e, a window 480 px wide.** The bar works: four lines, one group a line. Not yet: the graph is not fitted again after the window narrows, so it is cut off on the right. Not tried: a first load at this width.
- **11g, this repo.** The bar works: 6 concepts, 12 intents, 22 pending, the three drift verdicts and "66 inferred" at one look. The graph under it is not right yet, and that is lane 12: 66 proposals crowd the view and a wire runs through boxes.
- **11h, this repo at 480 px.** The bar works. The graph does not fit, as in 11e and 11g.

Not yet for lane 11: the problem count shows twice when there is a problem, in the bar and in the chip under the canvas. The chip stays because three end-to-end scripts use it. There is no single "needs attention" total. Group names ("Spec", "Checks", "Drift") show only in a wide window. Nobody has tried it with a real mouse in a real browser window.
