// glue for the project state bar: read the graph, ask glance-model.ts which node is next, select it.
// the selection opens the panel, and the canvas's KeepInView brings the node clear of it.

import type { Node } from '@xyflow/react';

import { useGraphStore } from '../store/graph-slice.js';
import { useUiStore } from '../store/ui-slice.js';
import { focusNode } from './direct-edit-actions.js';
import { selectOnly } from './edit-model.js';
import { nextInState, type GlanceState } from './glance-model.js';

/** a click on a count: select the next node in that state. a second click goes to the one after. */
export function selectNextIn(state: GlanceState): void {
  const g = useGraphStore.getState();
  const selected = g.nodes.find((n) => n.selected === true)?.id ?? null;
  const id = nextInState(g.nodes as Node[], state, selected);
  if (!id) return;
  const next = selectOnly(g.nodes as Node[], id);
  if (next) g.setGraph(next, g.edges);
  useUiStore.getState().closeMenu();
  window.setTimeout(() => focusNode(id), 0);
}
