// glue for inferred proposals: read the stores, ask the rules in inferred-model.ts, call the
// server, and show the notice with Undo. the page never draws the result itself, the live
// update after the write does.

import type { Node } from '@xyflow/react';

import { useGraphStore } from '../store/graph-slice.js';
import { useUiStore } from '../store/ui-slice.js';
import { acceptInferred, dismissInferred, type ApiResult } from '../transport/edit-api.js';
import { focusNode } from './direct-edit-actions.js';
import { selectOnly } from './edit-model.js';
import { acceptedNotice, dismissedNotice, nextInferred } from './inferred-model.js';
import { refuseEdit } from './wire-edit-actions.js';

const titleOf = (id: string): string => {
  const n = useGraphStore.getState().nodes.find((x) => x.id === id);
  return String((n?.data as { label?: unknown } | undefined)?.label ?? id);
};

function canWrite(): boolean {
  const ui = useUiStore.getState();
  if (ui.editConfig.write) return true;
  refuseEdit(ui.editConfig.readOnlyReason ?? 'Read only.');
  return false;
}

/** accept as a real intent file, under the typed title when there is one. resolves to the server's answer. */
export async function acceptProposal(id: string, title?: string): Promise<ApiResult<{ id: string; file: string; missing_anchors?: string[] }> | null> {
  if (!canWrite()) return null;
  const ui = useUiStore.getState();
  ui.closeMenu();
  const shown = title ?? titleOf(id);
  const r = await acceptInferred(ui.editConfig, id, title);
  if (!r.ok) ui.showNotice(r.message, 'refused', false);
  else {
    // the new intent is selected once the live update draws it, so Enter goes on from there
    ui.setPendingSelect(r.value.id);
    ui.showNotice(acceptedNotice(shown, r.value.file, r.value.missing_anchors?.length ?? 0), 'done', true);
  }
  return r;
}

export async function dismissProposal(id: string): Promise<void> {
  if (!canWrite()) return;
  const ui = useUiStore.getState();
  ui.closeMenu();
  const title = titleOf(id);
  const r = await dismissInferred(ui.editConfig, id);
  if (!r.ok) ui.showNotice(r.message, 'refused', false);
  else ui.showNotice(dismissedNotice(title), 'done', true);
}

/** the strip's count: select the next open proposal and bring it into view */
export function selectNextProposal(): void {
  const g = useGraphStore.getState();
  const selected = g.nodes.find((n) => n.selected === true)?.id ?? null;
  const id = nextInferred(g.nodes as Node[], selected);
  if (!id) return;
  const next = selectOnly(g.nodes as Node[], id);
  if (next) g.setGraph(next, g.edges);
  useUiStore.getState().closeMenu();
  window.setTimeout(() => focusNode(id), 0);
}
