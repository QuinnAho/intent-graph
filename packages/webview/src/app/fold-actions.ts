// glue for folding the proposals (lane 12): change the open folds in the ui store, lay the graph
// out again, and move the view so the concept that folded stays where it was on screen.

import { absolutePosition, foldToOpen } from '../graph/fold-model.js';
import { useGraphStore } from '../store/graph-slice.js';
import { useUiStore } from '../store/ui-slice.js';
import { refold } from '../transport/graph-json-loader.js';

/** open or close one fold. the row's own concept is the anchor that stays put. */
export async function toggleFold(key: string): Promise<void> {
  const ui = useUiStore.getState();
  const before = absolutePosition(useGraphStore.getState().nodes, key);
  if (ui.unfolded.has(key)) ui.closeFold(key);
  else ui.openFold(key);
  await refold();
  const after = absolutePosition(useGraphStore.getState().nodes, key);
  if (before && after && (before.x !== after.x || before.y !== after.y)) ui.shiftView(after.x - before.x, after.y - before.y);
}

/** open the fold that hides this node, if one does. resolves true when it had to. */
export async function revealNode(id: string): Promise<boolean> {
  const key = foldToOpen(useGraphStore.getState().nodes, id);
  if (key === null) return false;
  useUiStore.getState().openFold(key);
  await refold();
  return true;
}
