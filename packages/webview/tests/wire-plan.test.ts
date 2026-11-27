// which wires are drawn, which are counted on a pin, and how cross-box wires reach the layout.
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { hoistEdges } from '../src/graph/layout/nested.js';
import { pinLabel, planWires } from '../src/graph/edges/wire-plan.js';

const n = (id: string, type: string, parentId?: string): Node => ({ id, type, position: { x: 0, y: 0 }, data: {}, ...(parentId ? { parentId } : {}) });
const e = (id: string, source: string, target: string, kind = 'realizes'): Edge => ({ id, source, target, data: { kind } });
const groupOf = (x: Node): string => (x.type?.startsWith('code') ? 'code' : 'spec');

describe('hoistEdges', () => {
  const parents = new Map([['i1', 'c1'], ['i2', 'c2'], ['deep', 'i1']]);
  const parentOf = (id: string): string | undefined => parents.get(id);

  it('keeps an edge between two members as it is', () => {
    expect(hoistEdges(new Set(['a', 'b']), [e('x', 'a', 'b')], parentOf)).toEqual([{ id: 'x', source: 'a', target: 'b' }]);
  });

  it('replaces an end inside a box with the box at this level', () => {
    const out = hoistEdges(new Set(['k', 'c1', 'c2']), [e('x', 'k', 'i2'), e('y', 'deep', 'k')], parentOf);
    expect(out).toEqual([
      { id: 'x', source: 'k', target: 'c2' },
      { id: 'y', source: 'c1', target: 'k' },
    ]);
  });

  it('drops an edge whose ends meet in one box, or that leaves the level', () => {
    const out = hoistEdges(new Set(['c1', 'c2']), [e('x', 'i1', 'c1'), e('y', 'i1', 'gone'), e('z', 'i1', 'deep')], parentOf);
    expect(out).toEqual([]);
  });

  it('keeps one edge per pair of boxes', () => {
    const out = hoistEdges(new Set(['c1', 'c2']), [e('x', 'i1', 'i2'), e('y', 'deep', 'i2')], parentOf);
    expect(out).toEqual([{ id: 'x', source: 'c1', target: 'c2' }]);
  });
});

describe('planWires', () => {
  const nodes = [n('c', 'concept'), n('i', 'intent', 'c'), n('k', 'constraint'), n('s1', 'code_symbol'), n('s2', 'code_symbol'), n('m', 'code_module')];

  it('draws a wire between two shown nodes from the out pin to the in pin', () => {
    const plan = planWires(nodes, [e('x', 'k', 'i', 'constrains')], groupOf);
    expect(plan.wires).toHaveLength(1);
    expect(plan.wires[0]).toMatchObject({ id: 'x', source: 'k', target: 'i', sourceHandle: 'out', targetHandle: 'in', type: 'wire' });
  });

  it('does not draw a wire from a node to the box that holds it', () => {
    const plan = planWires(nodes, [e('x', 'i', 'c')], groupOf);
    expect(plan.wires).toEqual([]);
    expect(plan.pins.size).toBe(0);
  });

  it('counts wires to the hidden block on the pin they would use', () => {
    const plan = planWires(nodes, [e('a', 's1', 'i'), e('b', 's2', 'i'), e('c', 's1', 'm', 'produced_by')], groupOf);
    expect(plan.wires.map((w) => w.id)).toEqual(['c']);
    expect(plan.pins.get('i')?.in.hidden).toEqual({ code: 2 });
    expect(plan.pins.get('s1')?.out.hidden).toEqual({ spec: 1 });
    expect(plan.pins.get('s1')?.out.kinds).toEqual(['realizes', 'produced_by']);
    expect(plan.pins.get('m')?.in.drawn).toBe(1);
  });

  it('skips an edge with a missing end', () => {
    expect(planWires(nodes, [e('x', 'k', 'gone')], groupOf).wires).toEqual([]);
  });
});

describe('pinLabel', () => {
  it('reads like "3 code", largest group first', () => {
    expect(pinLabel({ code: 3 })).toBe('3 code');
    expect(pinLabel({ spec: 1, code: 2 })).toBe('2 code, 1 spec');
    expect(pinLabel({})).toBe('');
  });
});
