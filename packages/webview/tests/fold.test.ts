// lane 12: proposals fold into a row at the foot of their concept, or into one box at the root.
import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { FOLD_BOX_ID, applyFold, foldCounts, foldKeyOf, foldRowLabel, foldToOpen, withoutFoldBox } from '../src/graph/fold-model.js';
import { layoutNested } from '../src/graph/layout/nested.js';
import { shouldRefit } from '../src/graph/fit-model.js';

const n = (id: string, over: Partial<Node> = {}): Node => ({ id, type: 'intent', position: { x: 0, y: 0 }, data: { label: id }, ...over });
const prop = (id: string, parentId?: string): Node => n(`inferred:${id}`, { data: { label: id, inferred: { id, confidence: 'inferred' } }, ...(parentId ? { parentId } : {}) });
const concept = (id: string): Node => n(id, { type: 'concept' });

const graph = (): Node[] => [concept('c1'), concept('c2'), n('i1', { parentId: 'c1' }), prop('a', 'c1'), prop('b', 'c1'), prop('c', 'c2'), prop('d'), prop('e', 'gone')];

describe('foldKeyOf', () => {
  it('is the concept a proposal sits in, or the root box', () => {
    const nodes = graph();
    const ids = new Set(nodes.map((x) => x.id));
    expect(foldKeyOf(nodes[3]!, ids)).toBe('c1');
    expect(foldKeyOf(nodes[6]!, ids)).toBe(FOLD_BOX_ID);
    // a parent that is not in the graph counts as no concept
    expect(foldKeyOf(nodes[7]!, ids)).toBe(FOLD_BOX_ID);
    expect(foldKeyOf(nodes[2]!, ids)).toBeNull();
  });
});

describe('applyFold', () => {
  it('hides every proposal by default and puts a count on each concept and one root box', () => {
    const out = applyFold(graph(), new Set());
    const by = new Map(out.map((x) => [x.id, x]));
    expect(out.filter((x) => x.hidden === true).map((x) => x.id).sort()).toEqual(['inferred:a', 'inferred:b', 'inferred:c', 'inferred:d', 'inferred:e']);
    expect(by.get('i1')!.hidden).toBeUndefined();
    expect((by.get('c1')!.data as { fold?: unknown }).fold).toEqual({ key: 'c1', count: 2, open: false });
    expect((by.get('c2')!.data as { fold?: unknown }).fold).toEqual({ key: 'c2', count: 1, open: false });
    const box = by.get(FOLD_BOX_ID)!;
    expect(box.type).toBe('inferred_fold');
    expect((box.data as { fold?: unknown }).fold).toEqual({ key: FOLD_BOX_ID, count: 2, open: false });
  });

  it('shows the proposals of an unfolded concept and marks its row open', () => {
    const out = applyFold(graph(), new Set(['c1']));
    const by = new Map(out.map((x) => [x.id, x]));
    expect(by.get('inferred:a')!.hidden).toBeUndefined();
    expect(by.get('inferred:c')!.hidden).toBe(true);
    expect((by.get('c1')!.data as { fold?: { open: boolean } }).fold!.open).toBe(true);
  });

  it('deselects a proposal it hides, so no key can settle what is not shown', () => {
    const nodes = graph().map((x) => (x.id === 'inferred:a' ? { ...x, selected: true } : x));
    expect(applyFold(nodes, new Set()).find((x) => x.id === 'inferred:a')!.selected).toBe(false);
  });

  it('drops the row when a concept has no proposal left, and the box when none sits at the root', () => {
    const out = applyFold([concept('c1'), n('i1', { parentId: 'c1' })], new Set());
    expect((out[0]!.data as { fold?: unknown }).fold).toBeUndefined();
    expect(out.some((x) => x.id === FOLD_BOX_ID)).toBe(false);
  });

  it('runs again on its own output with the same answer and one box', () => {
    const once = applyFold(graph(), new Set(['c2']));
    const twice = applyFold(once, new Set(['c2']));
    expect(twice.filter((x) => x.id === FOLD_BOX_ID)).toHaveLength(1);
    expect(twice.map((x) => [x.id, x.hidden ?? false])).toEqual(once.map((x) => [x.id, x.hidden ?? false]));
    expect(withoutFoldBox(twice).some((x) => x.id === FOLD_BOX_ID)).toBe(false);
  });

  it('keeps the numbers adding up to every open proposal', () => {
    const counts = foldCounts(graph());
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(5);
    expect(counts.get(FOLD_BOX_ID)).toBe(2);
  });
});

describe('foldToOpen', () => {
  it('names the fold that hides a proposal, and nothing for a shown one or a declared node', () => {
    const out = applyFold(graph(), new Set(['c2']));
    expect(foldToOpen(out, 'inferred:a')).toBe('c1');
    expect(foldToOpen(out, 'inferred:d')).toBe(FOLD_BOX_ID);
    expect(foldToOpen(out, 'inferred:c')).toBeNull();
    expect(foldToOpen(out, 'i1')).toBeNull();
    expect(foldToOpen(out, 'nope')).toBeNull();
  });
});

describe('foldRowLabel', () => {
  it('says the count, and fold when it is open, and no concept yet at the root', () => {
    expect(foldRowLabel(9, false, false)).toBe('9 inferred');
    expect(foldRowLabel(9, true, false)).toBe('fold 9 inferred');
    expect(foldRowLabel(3, false, true)).toBe('3 inferred, no concept yet');
    expect(foldRowLabel(3, true, true)).toBe('fold 3 inferred, no concept yet');
  });
});

describe('layoutNested with a foot and bands', () => {
  const row = async (nodes: Array<{ id: string; width: number }>) => {
    let x = 0;
    return nodes.map((m) => {
      const p = { id: m.id, x, y: 0 };
      x += m.width + 20;
      return p;
    });
  };
  const size = () => ({ width: 100, height: 40 });
  const t = { groupPad: 10, groupHeader: 50 };

  it('adds the foot below the children, and to a concept with no child shown', async () => {
    const foot = (x: Node) => (x.id === 'c' || x.id === 'e' ? 36 : 0);
    const out = await layoutNested([n('a', { parentId: 'c' }), n('c'), n('e')], [], size, row, t, { footOf: foot });
    expect(out.get('c')!.size).toEqual({ width: 120, height: 40 + 50 + 10 + 36 });
    expect(out.get('e')!.size).toEqual({ width: 100, height: 76 });
  });

  it('lays a later band out below the first, inside the same concept', async () => {
    const band = (x: Node) => (x.id.startsWith('p') ? 1 : 0);
    const out = await layoutNested([n('a', { parentId: 'c' }), n('p1', { parentId: 'c' }), n('p2', { parentId: 'c' }), n('c')], [], size, row, t, { bandOf: band, bandGap: 30 });
    expect(out.get('a')!.position).toEqual({ x: 10, y: 50 });
    expect(out.get('p1')!.position).toEqual({ x: 10, y: 50 + 40 + 30 });
    expect(out.get('p2')!.position).toEqual({ x: 130, y: 120 });
    expect(out.get('c')!.size).toEqual({ width: 240, height: 40 + 30 + 40 + 50 + 10 });
  });

  it('is the same as before with no options', async () => {
    const out = await layoutNested([n('a', { parentId: 'c' }), n('b', { parentId: 'c' }), n('c')], [], size, row, t);
    expect(out.get('c')!.size).toEqual({ width: 240, height: 100 });
  });
});

describe('shouldRefit', () => {
  const base = { last: { width: 1280, height: 800 }, now: { width: 480, height: 800 }, moved: false, thresholdPx: 8 };
  it('fits again when the canvas changed by more than the threshold and the view was not moved', () => {
    expect(shouldRefit(base)).toBe(true);
  });
  it('leaves the view alone once the person moved it', () => {
    expect(shouldRefit({ ...base, moved: true })).toBe(false);
  });
  it('ignores a change of 8 px or less, and an empty canvas', () => {
    expect(shouldRefit({ ...base, now: { width: 1288, height: 792 } })).toBe(false);
    expect(shouldRefit({ ...base, now: { width: 0, height: 0 } })).toBe(false);
  });
  it('fits when there was no fit yet', () => {
    expect(shouldRefit({ ...base, last: null })).toBe(true);
  });
});
