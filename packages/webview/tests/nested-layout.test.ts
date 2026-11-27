// children of a concept get their own layout inside a parent sized to hold them.
import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { layoutNested, parentsFirst } from '../src/graph/layout/nested.js';

const n = (id: string, parentId?: string): Node => ({ id, position: { x: 0, y: 0 }, data: {}, ...(parentId ? { parentId } : {}) });
// fake layout: a row, 100 wide per node with a 20 gap
const row = async (nodes: Array<{ id: string; width: number }>) => {
  let x = 0;
  return nodes.map((m) => {
    const p = { id: m.id, x, y: 0 };
    x += m.width + 20;
    return p;
  });
};
const t = { groupPad: 10, groupHeader: 50 };
const size = () => ({ width: 100, height: 40 });

describe('layoutNested', () => {
  it('spreads children inside their parent instead of stacking them', async () => {
    const out = await layoutNested([n('a', 'c'), n('b', 'c'), n('c'), n('d')], [], size, row, t);
    expect(out.get('a')!.position).toEqual({ x: 10, y: 50 });
    expect(out.get('b')!.position).toEqual({ x: 130, y: 50 });
    // two children 100 wide with a 20 gap, plus padding on both sides
    expect(out.get('c')!.size).toEqual({ width: 240, height: 100 });
    expect(out.get('d')!.position.x).toBe(260);
  });

  it('treats a missing parent as top level', async () => {
    const out = await layoutNested([n('a', 'gone')], [], size, row, t);
    expect(out.get('a')!.position).toEqual({ x: 0, y: 0 });
  });
});

describe('parentsFirst', () => {
  it('puts parents before children and keeps order otherwise', () => {
    expect(parentsFirst([n('a', 'c'), n('x'), n('c')]).map((x) => x.id)).toEqual(['x', 'c', 'a']);
  });
});
