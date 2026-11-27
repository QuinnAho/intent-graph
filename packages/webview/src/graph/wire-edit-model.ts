// the rules behind editing by wire: which node may take which as its parent, what a
// drop means, and the notice each change shows. pure, so the canvas glue only gathers
// inputs and applies the answer. the server checks the same table again before it writes
// (packages/skill/src/live/parent-rules.ts), so this copy only decides what lights up.

import type { Edge, Node } from '@xyflow/react';

/** spec kind -> kinds its parent may be. code kinds are missing, they have no spec file. */
export const PARENT_KINDS: Readonly<Record<string, ReadonlyArray<string>>> = {
  intent: ['concept'],
  constraint: ['intent', 'concept'],
  decision: ['intent', 'concept'],
  concept: ['concept'],
};

/** the edge kind a parent line in a spec file turns into */
export const PARENT_EDGE_KIND = 'realizes';

export interface Ends {
  readonly kindOf: (id: string) => string | undefined;
  readonly parentOf: (id: string) => string | null;
  readonly titleOf: (id: string) => string;
}

const edgeKind = (e: Edge): string | undefined => (e.data as { kind?: unknown } | undefined)?.kind as string | undefined;

/** lookups over the graph the page holds now */
export function endsOf(nodes: ReadonlyArray<Node>, edges: ReadonlyArray<Edge>): Ends {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parent = new Map<string, string>();
  for (const e of edges) if (edgeKind(e) === PARENT_EDGE_KIND && !parent.has(e.source)) parent.set(e.source, e.target);
  for (const n of nodes) if (n.parentId && !parent.has(n.id)) parent.set(n.id, n.parentId);
  return {
    kindOf: (id) => byId.get(id)?.type,
    parentOf: (id) => parent.get(id) ?? null,
    titleOf: (id) => String((byId.get(id)?.data as { label?: unknown } | undefined)?.label ?? id),
  };
}

const a = (kind: string): string => `${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind}`;

/** null when child may hang under parent, otherwise a short sentence why not */
export function whyNotParent(ends: Ends, child: string, parent: string): string | null {
  const ck = ends.kindOf(child);
  const pk = ends.kindOf(parent);
  if (!ck || !pk) return 'That node is not in the graph any more.';
  const allowed = PARENT_KINDS[ck];
  if (!allowed) return 'Code nodes take their place from the source, not from a wire.';
  if (child === parent) return 'A node cannot hang under itself.';
  if (!PARENT_KINDS[pk]) return `${cap(a(ck))} cannot hang under code.`;
  if (!allowed.includes(pk)) return `${cap(a(ck))} can only hang under ${allowed.map(a).join(' or ')}, not ${a(pk)}.`;
  if (ends.parentOf(child) === parent) return `It already hangs under ${ends.titleOf(parent)}.`;
  const seen = new Set<string>();
  for (let at: string | null = parent; at && !seen.has(at); at = ends.parentOf(at)) {
    if (at === child) return `${ends.titleOf(parent)} sits inside ${ends.titleOf(child)}, that would make a loop.`;
    seen.add(at);
  }
  return null;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** the wire the page may delete: a parent line from one spec node to another. null otherwise. */
export function deletableWire(edge: Pick<Edge, 'source' | 'target' | 'data'>, ends: Ends): { child: string; parent: string } | null {
  if (edgeKind(edge as Edge) !== PARENT_EDGE_KIND) return null;
  if (!PARENT_KINDS[ends.kindOf(edge.source) ?? '']) return null;
  return { child: edge.source, parent: edge.target };
}

export const NOT_A_PARENT_WIRE = 'Only a parent wire between spec nodes can be deleted here.';

export interface Box {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** the innermost concept box under a point, leaving out the dragged node and what sits inside it */
export function boxUnder(point: { x: number; y: number }, boxes: ReadonlyArray<Box>, dragged: string, ends: Ends): string | null {
  const inside = (id: string): boolean => {
    const seen = new Set<string>();
    for (let at: string | null = id; at && !seen.has(at); at = ends.parentOf(at)) {
      if (at === dragged) return true;
      seen.add(at);
    }
    return false;
  };
  let best: Box | null = null;
  for (const b of boxes) {
    if (ends.kindOf(b.id) !== 'concept' || inside(b.id)) continue;
    if (point.x < b.x || point.y < b.y || point.x > b.x + b.width || point.y > b.y + b.height) continue;
    if (!best || b.width * b.height < best.width * best.height) best = b;
  }
  return best?.id ?? null;
}

export type DropOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'refuse'; readonly reason: string }
  | { readonly kind: 'move'; readonly parent: string };

/** what a node dropped over a box means. no box, or its own box, writes nothing. */
export function dropOutcome(ends: Ends, dragged: string, box: string | null): DropOutcome {
  if (!box || ends.parentOf(dragged) === box) return { kind: 'none' };
  const why = whyNotParent(ends, dragged, box);
  return why ? { kind: 'refuse', reason: why } : { kind: 'move', parent: box };
}

/** the notice after a parent change */
export function changeNotice(ends: Ends, child: string, parent: string | null, was: string | null): string {
  const c = ends.titleOf(child);
  if (parent === null) return `Disconnected ${c} from ${was ? ends.titleOf(was) : 'its parent'}.`;
  if (ends.kindOf(parent) === 'concept' && was && ends.kindOf(was) === 'concept') return `Moved ${c} into ${ends.titleOf(parent)}.`;
  return `Connected ${c} to ${ends.titleOf(parent)}.`;
}

/** ctrl+z or cmd+z, without shift or alt, and not while a text field has the focus */
export function isUndoKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }, typing: boolean): boolean {
  return !typing && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z';
}

/** the box to light while a node is held over it: only a box that would take the node, and never in read only mode */
export function lightedBox(ends: Ends, dragged: string, box: string | null, write: boolean): string | null {
  if (!write || !box) return null;
  return dropOutcome(ends, dragged, box).kind === 'move' ? box : null;
}
