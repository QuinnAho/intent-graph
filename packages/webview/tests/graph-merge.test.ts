// a live update keeps positions and selection when the shape of the graph holds.
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { mergeGraphUpdate } from '../src/transport/graph-merge.js';

const node = (id: string, label: string, extra: Partial<Node> = {}): Node => ({ id, type: 'intent', position: { x: 0, y: 0 }, data: { label }, ...extra });
const edge = (id: string, source: string, target: string): Edge => ({ id, source, target, data: { kind: 'realizes' } });

describe('mergeGraphUpdate', () => {
  const prev = [node('a', 'A', { position: { x: 10, y: 20 }, selected: true }), node('b', 'B', { position: { x: 30, y: 40 } })];
  const prevEdges = [edge('e1', 'a', 'b')];

  it('keeps positions and selection and takes the new data when only labels change', () => {
    const r = mergeGraphUpdate(prev, prevEdges, [node('a', 'A2'), node('b', 'B')], [edge('e-new-id', 'a', 'b')]);
    expect(r.needsLayout).toBe(false);
    expect(r.nodes[0]).toMatchObject({ id: 'a', position: { x: 10, y: 20 }, selected: true, data: { label: 'A2' } });
    expect(r.nodes[1]!.position).toEqual({ x: 30, y: 40 });
  });

  it('asks for a layout when a node or an edge is added or removed', () => {
    expect(mergeGraphUpdate(prev, prevEdges, [...prev, node('c', 'C')], prevEdges).needsLayout).toBe(true);
    expect(mergeGraphUpdate(prev, prevEdges, prev, []).needsLayout).toBe(true);
  });

  it('keeps selection even when it needs a layout', () => {
    const r = mergeGraphUpdate(prev, prevEdges, [node('a', 'A'), node('c', 'C')], []);
    expect(r.nodes.find((n) => n.id === 'a')!.selected).toBe(true);
  });
});
