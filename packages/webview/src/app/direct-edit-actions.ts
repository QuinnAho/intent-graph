// glue for direct editing: each action reads the stores, asks the pure rules, and applies the result.

import type { Node } from '@xyflow/react';

import { useGraphStore } from '../store/graph-slice.js';
import { useUiStore } from '../store/ui-slice.js';
import { renameTarget } from './direct-edit-model.js';
import { selectOnly } from './edit-model.js';

/** the node element, so focus can go back to it */
export function focusNode(id: string | null): void {
  if (!id) return;
  const el = Array.from(document.querySelectorAll<HTMLElement>('.react-flow__node')).find((e) => e.getAttribute('data-id') === id);
  el?.focus({ preventScroll: true });
}

function selectNode(id: string): void {
  const g = useGraphStore.getState();
  const next = selectOnly(g.nodes as Node[], id);
  if (next) g.setGraph(next, g.edges);
}

/** a title edit: on the node, or in the panel when the panel holds unsaved text for it */
export function renameNode(id: string): void {
  const ui = useUiStore.getState();
  if (!ui.editConfig.write) return;
  ui.closeMenu();
  selectNode(id);
  if (renameTarget(ui.panelDirtyId, id) === 'panel') ui.setPanelFocusId(id);
  else ui.setRenameId(id);
}

/** the panel of a node, with the cursor in its title */
export function openDetails(id: string): void {
  const ui = useUiStore.getState();
  ui.closeMenu();
  selectNode(id);
  if (ui.editConfig.write) ui.setPanelFocusId(id);
}

export function addIntentTo(id: string): void {
  const ui = useUiStore.getState();
  if (!ui.editConfig.write) return;
  ui.closeMenu();
  selectNode(id);
  ui.openCreate(id);
}

/** the right-click menu for a node. it opens the menu and nothing else, so the view never shifts under it. */
export function openNodeMenu(id: string, kind: string, at: { x: number; y: number }): void {
  useUiStore.getState().openMenu({ ...at, nodeId: id, kind });
}

export function openPaneMenu(at: { x: number; y: number }): void {
  useUiStore.getState().openMenu({ ...at, nodeId: null, kind: null });
}

export function openWireMenu(wireId: string, at: { x: number; y: number }): void {
  useUiStore.getState().setSelectedWire(wireId);
  useUiStore.getState().openMenu({ ...at, nodeId: null, kind: 'wire', wireId });
}
