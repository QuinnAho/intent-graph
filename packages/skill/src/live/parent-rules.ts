// which spec node may hang under which, read from the spec kind readmes and the files
// that exist. the page asks the same table to light up valid drop targets, and the
// server asks it again before it writes, so a hand-made request cannot get around it.

/** spec kind -> kinds its parent may be. a kind missing here (code) has no spec file. */
export const PARENT_KINDS: Readonly<Record<string, ReadonlyArray<string>>> = {
  intent: ['concept'],
  constraint: ['intent', 'concept'],
  decision: ['intent', 'concept'],
  concept: ['concept'],
};

export interface ParentNode {
  readonly id: string;
  readonly kind: string;
  readonly parent_id: string | null;
}

export interface ParentRefusal {
  readonly status: number;
  readonly error: 'not-found' | 'invalid';
  readonly message: string;
}

const no = (status: number, error: ParentRefusal['error'], message: string): ParentRefusal => ({ status, error, message });

/** null when child may get this parent (null takes the parent away), otherwise why not */
export function checkParentChange(nodes: ReadonlyArray<ParentNode>, childId: string, parentId: string | null): ParentRefusal | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const child = byId.get(childId);
  if (!child) return no(404, 'not-found', `${childId} is not in this graph`);
  const allowed = PARENT_KINDS[child.kind];
  if (!allowed) return no(422, 'invalid', `${childId} is code, its place comes from the source, not a spec file`);
  if (parentId === null) return null;
  const parent = byId.get(parentId);
  if (!parent) return no(422, 'invalid', `${parentId} is not in this graph`);
  if (parent.id === child.id) return no(422, 'invalid', 'a node cannot be its own parent');
  if (!PARENT_KINDS[parent.kind]) return no(422, 'invalid', `${parentId} is code, a spec node cannot hang under it`);
  if (!allowed.includes(parent.kind)) {
    return no(422, 'invalid', `a ${child.kind} can only hang under ${allowed.map((k) => `a ${k}`).join(' or ')}, not a ${parent.kind}`);
  }
  // walk up from the new parent, reaching the child again would close a loop
  const seen = new Set<string>();
  for (let at: ParentNode | undefined = parent; at && !seen.has(at.id); at = at.parent_id ? byId.get(at.parent_id) : undefined) {
    if (at.id === child.id) return no(422, 'invalid', `${parentId} already sits inside ${childId}, that would make a loop`);
    seen.add(at.id);
  }
  return null;
}

/** each loop in the parent chains once, as the ids in the order they point at each other */
export function findParentLoops(nodes: ReadonlyArray<{ readonly id: string; readonly parent_id: string | null }>): string[][] {
  const parentOf = new Map(nodes.map((n) => [n.id, n.parent_id]));
  const done = new Set<string>();
  const loops: string[][] = [];
  for (const n of nodes) {
    const path: string[] = [];
    const at = new Map<string, number>();
    let id: string | null | undefined = n.id;
    while (id && parentOf.has(id) && !done.has(id)) {
      const hit = at.get(id);
      if (hit !== undefined) {
        const ring = path.slice(hit);
        const first = ring.indexOf([...ring].sort()[0]!);
        loops.push([...ring.slice(first), ...ring.slice(0, first)]);
        break;
      }
      at.set(id, path.length);
      path.push(id);
      id = parentOf.get(id);
    }
    for (const p of path) done.add(p);
  }
  return loops;
}
