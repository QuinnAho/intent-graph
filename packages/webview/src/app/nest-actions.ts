// glue for opening an intent in place (lane 13): change the open set in the ui store, lay the graph
// out again and move the view so the node's title stays where it was on screen. a click on a row
// opens the file in the editor, or in a browser tab selects the code node and brings it into view.

import type { Node } from '@xyflow/react';

import { absolutePosition } from '../graph/fold-model.js';
import type { CodeRef } from '../graph/nest-model.js';
import { useGraphStore } from '../store/graph-slice.js';
import { useUiStore } from '../store/ui-slice.js';
import { refold } from '../transport/graph-json-loader.js';
import { openInEditor } from '../transport/shell-bridge.js';
import { focusNode } from './direct-edit-actions.js';
import { selectOnly } from './edit-model.js';

/** the page sits in the editor panel, so a click on code can open the file */
export function inEditorPanel(win: Window = window): boolean {
  try {
    return win.parent !== null && win.parent !== win;
  } catch {
    return false;
  }
}

/** open or close one intent. the focus stays on the node when it was there. */
export async function toggleNest(id: string): Promise<void> {
  const ui = useUiStore.getState();
  const focused = document.activeElement?.closest('.react-flow__node')?.getAttribute('data-id') === id;
  const before = absolutePosition(useGraphStore.getState().nodes, id);
  if (ui.nested.has(id)) ui.closeNest(id);
  else ui.openNest(id);
  await refold();
  const after = absolutePosition(useGraphStore.getState().nodes, id);
  if (before && after && (before.x !== after.x || before.y !== after.y)) ui.shiftView(after.x - before.x, after.y - before.y);
  if (!focused) return;
  // the canvas draws the new layout on the next frames, the node can lose the focus while it does
  focusNode(id);
  await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  focusNode(id);
}

function selectAndShow(id: string): void {
  const g = useGraphStore.getState();
  const next = selectOnly(g.nodes as Node[], id);
  if (!next) return;
  g.setGraph(next, g.edges);
  useUiStore.getState().focusView(id);
}

/** a click on a row: the editor when there is one, else the code node in the graph. resolves what it did. */
export function openCodeRef(ref: CodeRef, win: Window = window): 'editor' | 'graph' | null {
  if (ref.target === null) return null;
  if (inEditorPanel(win) && openInEditor(ref.path, ref.line, win)) return 'editor';
  selectAndShow(ref.target);
  return 'graph';
}

/** a double-click or Enter on a code node opens it in the editor. in a browser tab nothing changes. */
export function openCodeNode(id: string, win: Window = window): boolean {
  const n = useGraphStore.getState().nodes.find((x) => x.id === id);
  const data = n?.data as { path?: unknown; line?: unknown } | undefined;
  if (typeof data?.path !== 'string') return false;
  return openInEditor(data.path, typeof data.line === 'number' ? data.line : undefined, win);
}
