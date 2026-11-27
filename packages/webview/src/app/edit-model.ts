// rules behind the edit panel, kept out of the component so they can be tested.

import type { Node } from '@xyflow/react';

import { SPEC_KINDS } from '../transport/live-source.js';

/** the spec node the panel edits: the one selected spec node, or null */
export function pickEditNode(nodes: ReadonlyArray<Node>): Node | null {
  const picked = nodes.filter((n) => n.selected === true && n.type !== undefined && SPEC_KINDS.has(n.type));
  return picked.length === 1 ? picked[0]! : null;
}

export interface Draft {
  readonly title: string;
  readonly body: string;
}

/** textareas hand back \n, so compare with plain newlines */
export function isDirty(loaded: Draft | null, draft: Draft): boolean {
  if (!loaded) return false;
  const plain = (s: string): string => s.replace(/\r\n/g, '\n');
  return draft.title !== loaded.title || plain(draft.body) !== plain(loaded.body);
}

/** a message for a title the server would refuse, checked before anything is sent */
export function titleProblem(title: string): string | null {
  const t = title.trim();
  if (t.length === 0) return 'The title is empty. Give it a title. Nothing was saved.';
  if (!/[\p{L}\p{N}]/u.test(t)) return 'The title needs at least one letter or number. Nothing was saved.';
  return null;
}

/** the same nodes with only one selected, for selecting a node the page just created */
export function selectOnly(nodes: ReadonlyArray<Node>, id: string): Node[] | null {
  if (!nodes.some((n) => n.id === id)) return null;
  return nodes.map((n) => (n.id === id ? { ...n, selected: true } : n.selected ? { ...n, selected: false } : n));
}
