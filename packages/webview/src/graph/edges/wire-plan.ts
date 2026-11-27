// decides which edges become wires. a wire is drawn only when both ends are in the
// same view block (spec or code). a wire to the other block, which sits off screen,
// is not drawn: the visible end counts it on the pin it would use. a node's edge to
// the box that holds it is shown by the nesting, so it is neither drawn nor counted.

import type { Edge, Node } from '@xyflow/react';

export interface PinSide {
  /** wires drawn on this pin */
  drawn: number;
  /** wires not drawn because the other end is in another block, by that block */
  hidden: Record<string, number>;
  /** edge kinds on this pin, first seen first, for the pin colour */
  kinds: string[];
}
export interface PinInfo {
  in: PinSide;
  out: PinSide;
}
export interface WirePlan {
  wires: Edge[];
  pins: Map<string, PinInfo>;
}

const side = (): PinSide => ({ drawn: 0, hidden: {}, kinds: [] });

function edgeKind(e: Edge): string {
  const k = (e.data as { kind?: unknown } | undefined)?.kind;
  return typeof k === 'string' ? k : 'references';
}

export function planWires(nodes: ReadonlyArray<Node>, edges: ReadonlyArray<Edge>, groupOf: (n: Node) => string): WirePlan {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const holds = (box: string, id: string): boolean => {
    let cur = byId.get(id)?.parentId;
    for (let i = 0; cur !== undefined && i <= nodes.length; i++) {
      if (cur === box) return true;
      cur = byId.get(cur)?.parentId;
    }
    return false;
  };
  const pins = new Map<string, PinInfo>();
  const pin = (id: string): PinInfo => {
    let p = pins.get(id);
    if (!p) {
      p = { in: side(), out: side() };
      pins.set(id, p);
    }
    return p;
  };
  const note = (s: PinSide, kind: string): void => {
    if (!s.kinds.includes(kind)) s.kinds.push(kind);
  };
  const wires: Edge[] = [];
  for (const e of edges) {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b || a.id === b.id) continue;
    if (holds(a.id, b.id) || holds(b.id, a.id)) continue;
    const kind = edgeKind(e);
    const out = pin(a.id).out;
    const inn = pin(b.id).in;
    note(out, kind);
    note(inn, kind);
    const ga = groupOf(a);
    const gb = groupOf(b);
    if (ga !== gb) {
      out.hidden[gb] = (out.hidden[gb] ?? 0) + 1;
      inn.hidden[ga] = (inn.hidden[ga] ?? 0) + 1;
      continue;
    }
    out.drawn += 1;
    inn.drawn += 1;
    wires.push({ ...e, type: 'wire', sourceHandle: 'out', targetHandle: 'in' });
  }
  return { wires, pins };
}

/** "3 code", or "2 code, 1 spec" with the largest group first */
export function pinLabel(hidden: Record<string, number>): string {
  return Object.entries(hidden)
    .filter(([, v]) => v > 0)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .map(([k, v]) => `${v} ${k}`)
    .join(', ');
}
