// merge a live update into what is on screen. when no node or edge was added
// or removed, keep every position so nothing jumps, and skip the layout.
// edge ids from the builder change on every build, so edges compare by ends and kind.

import type { Edge, Node } from '@xyflow/react';

function edgeKey(e: Edge): string {
  const kind = (e.data as { kind?: string } | undefined)?.kind ?? '';
  return `${e.source}>${e.target}:${kind}`;
}

function sameShape(prev: ReadonlyArray<Node>, prevEdges: ReadonlyArray<Edge>, next: ReadonlyArray<Node>, nextEdges: ReadonlyArray<Edge>): boolean {
  if (prev.length !== next.length || prevEdges.length !== nextEdges.length) return false;
  const ids = new Set(prev.map((n) => n.id));
  if (!next.every((n) => ids.has(n.id))) return false;
  const keys = new Set(prevEdges.map(edgeKey));
  return nextEdges.every((e) => keys.has(edgeKey(e)));
}

export function mergeGraphUpdate(
  prev: ReadonlyArray<Node>,
  prevEdges: ReadonlyArray<Edge>,
  next: ReadonlyArray<Node>,
  nextEdges: ReadonlyArray<Edge>,
): { nodes: Node[]; needsLayout: boolean } {
  const before = new Map(prev.map((n) => [n.id, n]));
  const keep = sameShape(prev, prevEdges, next, nextEdges);
  const nodes = next.map((n) => {
    const old = before.get(n.id);
    if (!old) return n;
    const merged: Node = { ...n };
    if (old.selected !== undefined) merged.selected = old.selected;
    if (keep) {
      merged.position = old.position;
      if (old.measured !== undefined) merged.measured = old.measured;
      // a parent's size comes from the layout, not the server
      if (old.width !== undefined) merged.width = old.width;
      if (old.height !== undefined) merged.height = old.height;
    }
    return merged;
  });
  return { nodes, needsLayout: !keep };
}
