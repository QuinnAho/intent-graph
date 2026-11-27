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
