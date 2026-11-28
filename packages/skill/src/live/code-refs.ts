// lane 13: the ordered list of code a spec node is bound to, and where a code node sits as a path
// from the root. the page draws rows from the list, so it can tell "not found" from "not there".

import type { LiveCodeRef } from '@intentgraph/shared/schemas';

import type { Anchor } from '../parser/spec-md/anchors.js';

const MODULE = 'code_module:';
const SYMBOL = 'code_symbol:';

/** the code node an anchor stands for: the named symbol, else its file, else null */
export function findTarget(path: string, name: string | undefined, ids: ReadonlySet<string>, symbolIds: ReadonlyArray<string>): string | null {
  if (name !== undefined) {
    const prefix = `${SYMBOL}${path}#${name}#`;
    const hit = symbolIds.find((id) => id.startsWith(prefix));
    if (hit) return hit;
  }
  const mod = `${MODULE}${path}`;
  return ids.has(mod) ? mod : null;
}

/** one entry per anchor, in the order given. lines maps a symbol id to its first line from 1. */
export function codeRefs(anchors: ReadonlyArray<Anchor>, ids: ReadonlySet<string>, symbolIds: ReadonlyArray<string>, lines: ReadonlyMap<string, number>): LiveCodeRef[] {
  return anchors.map((a) => {
    const target = findTarget(a.path, a.name, ids, symbolIds);
    const line = target !== null ? lines.get(target) : undefined;
    return {
      raw: a.raw,
      path: a.path,
      ...(a.name !== undefined ? { name: a.name } : {}),
      target,
      ...(line !== undefined ? { line } : {}),
      symbol_missing: a.name !== undefined && target !== null && !target.startsWith(SYMBOL),
    };
  });
}

/** a code node's path from the root, read from its id, and a symbol's first line from 1. null for other nodes. */
export function codePlace(id: string, body: unknown): { path: string; line?: number } | null {
  if (id.startsWith(MODULE)) return { path: id.slice(MODULE.length) };
  if (!id.startsWith(SYMBOL)) return null;
  // code_symbol:<path>#<name>#<hash>, the name may hold a dot but the hash never holds a #
  const rest = id.slice(SYMBOL.length, id.lastIndexOf('#'));
  const cut = rest.lastIndexOf('#');
  const path = cut >= 0 ? rest.slice(0, cut) : rest;
  const start = (body as { range?: { start?: { line?: unknown } } } | null)?.range?.start?.line;
  return typeof start === 'number' ? { path, line: start + 1 } : { path };
}
