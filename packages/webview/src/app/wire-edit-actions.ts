// glue for editing by wire: read the stores, ask the rules in graph/wire-edit-model.ts,
// call the server, and show the notice. the page never moves a node itself, the live
// update after the write redraws the graph.

import { useGraphStore } from '../store/graph-slice.js';
import { useUiStore } from '../store/ui-slice.js';
import { setNodeParent, undoLastWrite } from '../transport/edit-api.js';
import { NOT_A_PARENT_WIRE, changeNotice, deletableWire, endsOf, whyNotParent, type Ends } from '../graph/wire-edit-model.js';

export function currentEnds(): Ends {
  const g = useGraphStore.getState();
  return endsOf(g.nodes, g.edges);
}

export function refuseEdit(reason: string): void {
  useUiStore.getState().showNotice(`${reason} Nothing was changed.`, 'refused', false);
}

/** set or remove a parent, after the same rules the server uses */
export async function changeParent(child: string, parent: string | null): Promise<void> {
  const ui = useUiStore.getState();
  if (!ui.editConfig.write) {
    refuseEdit(ui.editConfig.readOnlyReason ?? 'Read only.');
    return;
  }
  const ends = currentEnds();
  const why = parent === null ? null : whyNotParent(ends, child, parent);
  if (why) {
    refuseEdit(why);
    return;
  }
  const was = ends.parentOf(child);
  const r = await setNodeParent(ui.editConfig, child, parent, was);
  if (!r.ok) ui.showNotice(r.message, 'refused', false);
  else if (r.value.changed) ui.showNotice(changeNotice(ends, child, parent, was), 'done', true);
}

/** delete a wire: the child's parent line becomes null */
export function deleteWire(edgeId: string): void {
  const edge = useGraphStore.getState().edges.find((e) => e.id === edgeId);
  const wire = edge ? deletableWire(edge, currentEnds()) : null;
  useUiStore.getState().setSelectedWire(null);
  if (!wire) {
    refuseEdit(NOT_A_PARENT_WIRE);
    return;
  }
  void changeParent(wire.child, null);
}

export async function undoLast(): Promise<void> {
  const ui = useUiStore.getState();
  if (!ui.editConfig.write) {
    refuseEdit(ui.editConfig.readOnlyReason ?? 'Read only.');
    return;
  }
  const r = await undoLastWrite(ui.editConfig);
  if (!r.ok) ui.showNotice(r.message.replace(/ Nothing was saved\.$/, ''), 'refused', false);
  else ui.showNotice(`Undone. ${r.value.file} is back as it was.`, 'done', false);
}
