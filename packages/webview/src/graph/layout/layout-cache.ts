// a block whose nodes, sizes and wires did not change gets the same layout, so it is not run again.
// opening an intent changes the spec block only, the code block below keeps its layout (lane 13).

import type { Edge, Node } from '@xyflow/react';

import type { NestedOptions, Placement } from './nested.js';

/** everything the nested layout reads, as one string. wires compare by their ends, the builder's ids change on every build. */
export function layoutKey(nodes: ReadonlyArray<Node>, edges: ReadonlyArray<Edge>, sizeOf: (n: Node) => { width: number; height: number }, opts: NestedOptions = {}): string {
  const parts: string[] = [];
  for (const n of nodes) {
    const s = sizeOf(n);
    parts.push(`${n.id}|${n.parentId ?? ''}|${s.width}x${s.height}|${opts.footOf?.(n) ?? 0}|${opts.bandOf?.(n) ?? 0}`);
  }
  parts.push('--');
  for (const e of edges) parts.push(`${e.source}>${e.target}`);
  return parts.join('\n');
}

/** the newest layout of each block, by its key */
export class LayoutCache {
  private readonly slots = new Map<string, { key: string; placed: Map<string, Placement> }>();

  get(slot: string, key: string): Map<string, Placement> | null {
    const hit = this.slots.get(slot);
    return hit && hit.key === key ? hit.placed : null;
  }

  set(slot: string, key: string, placed: Map<string, Placement>): void {
    this.slots.set(slot, { key, placed });
  }
}
