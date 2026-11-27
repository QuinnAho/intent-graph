// lays out a graph whose nodes may sit inside a parent (react flow sub-flows).
// each parent's children are laid out first, the parent is sized to hold them,
// and children get positions relative to their parent. without this a child
// with extent 'parent' is clamped into a parent sized for one node, and every
// intent of a concept lands on the same spot.

import type { Edge, Node } from '@xyflow/react';

import type { LayoutEdgeInput, LayoutNodeInput, LayoutPosition } from './layout-protocol.js';

export type RunLayout = (nodes: LayoutNodeInput[], edges: LayoutEdgeInput[]) => Promise<LayoutPosition[]>;

export interface NestedTuning {
  /** space between a parent's border and its children */
  readonly groupPad: number;
  /** room for the parent's own header above its children */
  readonly groupHeader: number;
}

export interface Placement {
  readonly position: { x: number; y: number };
  /** set on parents only, the size that holds their children */
  readonly size?: { width: number; height: number };
}

export async function layoutNested(
  nodes: ReadonlyArray<Node>,
  edges: ReadonlyArray<Edge>,
  sizeOf: (n: Node) => { width: number; height: number },
  run: RunLayout,
  t: NestedTuning,
): Promise<Map<string, Placement>> {
  const ids = new Set(nodes.map((n) => n.id));
  const childrenOf = new Map<string, Node[]>();
  const top: Node[] = [];
  for (const n of nodes) {
    const parent = n.parentId;
    if (parent !== undefined && ids.has(parent)) {
      const list = childrenOf.get(parent) ?? [];
      list.push(n);
      childrenOf.set(parent, list);
    } else top.push(n);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parentOf = (id: string): string | undefined => {
    const p = byId.get(id)?.parentId;
    return p !== undefined && ids.has(p) ? p : undefined;
  };
  const out = new Map<string, Placement>();
  const sizes = new Map<string, { width: number; height: number }>();

  // returns the bounding size of this level
  const level = async (members: ReadonlyArray<Node>, depth: number): Promise<{ width: number; height: number }> => {
    for (const m of members) {
      const kids = childrenOf.get(m.id);
      if (!kids || depth > nodes.length) continue;
      const inner = await level(kids, depth + 1);
      const own = sizeOf(m);
      sizes.set(m.id, { width: Math.max(own.width, inner.width + 2 * t.groupPad), height: inner.height + t.groupHeader + t.groupPad });
    }
    const memberIds = new Set(members.map((m) => m.id));
    const layoutNodes = members.map((m) => ({ id: m.id, ...(sizes.get(m.id) ?? sizeOf(m)) }));
    const layoutEdges = hoistEdges(memberIds, edges, parentOf);
    const placed = await run(layoutNodes, layoutEdges);
    const nested = depth > 0;
    let width = 0;
    let height = 0;
    for (const p of placed) {
      const box = layoutNodes.find((l) => l.id === p.id);
      const pos = nested ? { x: p.x + t.groupPad, y: p.y + t.groupHeader } : { x: p.x, y: p.y };
      const size = sizes.get(p.id);
      out.set(p.id, size ? { position: pos, size } : { position: pos });
      width = Math.max(width, p.x + (box?.width ?? 0));
      height = Math.max(height, p.y + (box?.height ?? 0));
    }
    return { width, height };
  };

  await level(top, 0);
  return out;
}

/**
 * the edges one level lays out. an end inside a box is replaced by the box that is a
 * member of this level, so a wire that leaves a box still places the boxes in columns.
 * edges whose ends meet in one member, or that leave the level, are dropped. one per pair.
 */
export function hoistEdges(
  members: ReadonlySet<string>,
  edges: ReadonlyArray<Edge>,
  parentOf: (id: string) => string | undefined,
): LayoutEdgeInput[] {
  const lift = (id: string): string | undefined => {
    let cur: string | undefined = id;
    for (let i = 0; cur !== undefined && i <= members.size + edges.length; i++) {
      if (members.has(cur)) return cur;
      cur = parentOf(cur);
    }
    return undefined;
  };
  const seen = new Set<string>();
  const out: LayoutEdgeInput[] = [];
  for (const e of edges) {
    const source = lift(e.source);
    const target = lift(e.target);
    if (source === undefined || target === undefined || source === target) continue;
    const key = `${source}\u0000${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: e.id, source, target });
  }
  return out;
}

/** react flow wants a parent before its children in the array */
export function parentsFirst(nodes: ReadonlyArray<Node>): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = (n: Node): number => {
    let d = 0;
    let cur = n;
    while (cur.parentId !== undefined && byId.has(cur.parentId) && d <= nodes.length) {
      cur = byId.get(cur.parentId)!;
      d += 1;
    }
    return d;
  };
  return nodes
    .map((n, i) => ({ n, i, d: depth(n) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.n);
}
