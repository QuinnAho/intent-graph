// a parent loop made by hand has no top, and a sub-flow that is its own ancestor makes
// the renderer recurse for ever. the ids returned here sit in a loop, so the loader draws
// them at top level. the server reports the loop as a problem naming the files.

export function idsInParentLoop(nodes: ReadonlyArray<{ readonly id: string; readonly parent_id: string | null }>): Set<string> {
  const parentOf = new Map(nodes.map((n) => [n.id, n.parent_id]));
  const inLoop = new Set<string>();
  for (const n of nodes) {
    let at = parentOf.get(n.id) ?? null;
    for (let i = 0; at !== null && i <= nodes.length; i++) {
      if (at === n.id) {
        inLoop.add(n.id);
        break;
      }
      at = parentOf.get(at) ?? null;
    }
  }
  return inLoop;
}
