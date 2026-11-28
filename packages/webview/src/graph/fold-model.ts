// folding the inferred proposals (lane 12). pure rules, no store.
// a proposal belongs to the concept it is nested in, or to one box at the root. a fold that is not
// open hides its proposals: they are not laid out and not drawn. a concept carries the count of its
// proposals in data.fold, which draws the dashed row at its foot. the root box is a node of its own
// with no pins, so no wire ends on it.

import type { Node } from '@xyflow/react';

import { inferredOf } from '../app/inferred-model.js';

export const FOLD_BOX_ID = 'inferred-fold:root';
export const FOLD_BOX_KIND = 'inferred_fold';

export interface FoldInfo {
  /** the concept id, or FOLD_BOX_ID */
  readonly key: string;
  readonly count: number;
  readonly open: boolean;
}

export const isFoldBox = (n: Pick<Node, 'id'>): boolean => n.id === FOLD_BOX_ID;

export function foldOf(n: Pick<Node, 'data'> | null | undefined): FoldInfo | null {
  const v = (n?.data as { fold?: unknown } | undefined)?.fold;
  return v && typeof v === 'object' ? (v as FoldInfo) : null;
}

/** the fold a proposal belongs to, or null for a node that is not a proposal */
export function foldKeyOf(n: Node, ids: ReadonlySet<string>): string | null {
  if (inferredOf(n) === null) return null;
  return n.parentId !== undefined && ids.has(n.parentId) ? n.parentId : FOLD_BOX_ID;
}

/** the graph as the server sent it, without the root box */
export function withoutFoldBox(nodes: ReadonlyArray<Node>): Node[] {
  return nodes.filter((n) => !isFoldBox(n));
}

/** how many proposals each fold holds. the numbers add up to every open proposal. */
export function foldCounts(nodes: ReadonlyArray<Node>): Map<string, number> {
  const real = withoutFoldBox(nodes);
  const ids = new Set(real.map((n) => n.id));
  const out = new Map<string, number>();
  for (const n of real) {
    const key = foldKeyOf(n, ids);
    if (key !== null) out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

export function foldRowLabel(count: number, open: boolean, root: boolean): string {
  return `${open ? 'fold ' : ''}${count} inferred${root ? ', no concept yet' : ''}`;
}

export function foldRowTitle(count: number, open: boolean): string {
  const what = count === 1 ? 'the proposal' : `the ${count} proposals`;
  return open ? `Fold ${what} a model inferred from the code.` : `Show ${what} a model inferred from the code. Enter or Space opens it.`;
}

/**
 * hide the proposals of every fold that is not open, put the count on each concept and add the
 * root box when a proposal has no concept. safe to run again on its own output.
 */
export function applyFold(nodes: ReadonlyArray<Node>, unfolded: ReadonlySet<string>): Node[] {
  const real = withoutFoldBox(nodes);
  const oldBox = nodes.find(isFoldBox);
  const ids = new Set(real.map((n) => n.id));
  const counts = foldCounts(real);
  const out = real.map((n) => {
    const key = foldKeyOf(n, ids);
    if (key !== null) {
      const hide = !unfolded.has(key);
      if (hide) return { ...n, hidden: true, selected: false };
      if (n.hidden === undefined) return n;
      const shown = { ...n };
      delete shown.hidden;
      return shown;
    }
    const count = counts.get(n.id) ?? 0;
    const had = foldOf(n);
    if (count === 0 && had === null) return n;
    const data = { ...(n.data as Record<string, unknown>) };
    if (count === 0) delete data['fold'];
    else data['fold'] = { key: n.id, count, open: unfolded.has(n.id) } satisfies FoldInfo;
    return { ...n, data };
  });
  const rootCount = counts.get(FOLD_BOX_ID) ?? 0;
  if (rootCount > 0) {
    const fold: FoldInfo = { key: FOLD_BOX_ID, count: rootCount, open: unfolded.has(FOLD_BOX_ID) };
    out.push({
      ...(oldBox ?? { position: { x: 0, y: 0 } }),
      id: FOLD_BOX_ID,
      type: FOLD_BOX_KIND,
      data: { label: foldRowLabel(rootCount, fold.open, true), kind: FOLD_BOX_KIND, fold },
      selectable: false,
      draggable: false,
      connectable: false,
    });
  }
  return out;
}

/** the fold to open so this node is shown, or null when it is shown already or is not a proposal */
export function foldToOpen(nodes: ReadonlyArray<Node>, id: string): string | null {
  const n = nodes.find((x) => x.id === id);
  if (!n || n.hidden !== true) return null;
  return foldKeyOf(n, new Set(withoutFoldBox(nodes).map((x) => x.id)));
}

/** where a node sits on the canvas, its parents' positions added */
export function absolutePosition(nodes: ReadonlyArray<Node>, id: string): { x: number; y: number } | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = byId.get(id);
  if (!cur) return null;
  let x = 0;
  let y = 0;
  for (let i = 0; cur && i <= nodes.length; i++) {
    x += cur.position.x;
    y += cur.position.y;
    cur = cur.parentId !== undefined ? byId.get(cur.parentId) : undefined;
  }
  return { x, y };
}
