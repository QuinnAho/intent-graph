// lane 13: an intent opens in place into a box that lists the code it is bound to.
import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { LayoutCache, layoutKey } from '../src/graph/layout/layout-cache.js';
import { layoutNested } from '../src/graph/layout/nested.js';
import { applyNest, chipHidden, codeOf, codeRowText, codeRowTitle, nestCountLabel, nestFootPx, nestKey, nestMenuItem, nestOf, nestShape, nestToggleTitle, type CodeRef } from '../src/graph/nest-model.js';
import { NEST_TUNING } from '../src/graph/view-tuning.js';
import { menuItems } from '../src/app/direct-edit-model.js';

const SYM = 'code_symbol:src/math.ts#add#0123456789ab';
const refs: CodeRef[] = [
  { raw: 'src/math.ts#add', path: 'src/math.ts', name: 'add', target: SYM, line: 3, symbol_missing: false },
  { raw: 'src/math.ts', path: 'src/math.ts', target: 'code_module:src/math.ts', symbol_missing: false },
  { raw: 'src/math.ts#gone', path: 'src/math.ts', name: 'gone', target: 'code_module:src/math.ts', symbol_missing: true },
  { raw: 'src/none.ts', path: 'src/none.ts', target: null, symbol_missing: false },
];
const n = (id: string, over: Partial<Node> = {}): Node => ({ id, type: 'intent', position: { x: 0, y: 0 }, data: { label: id }, ...over });
const withCode = (id: string, code: CodeRef[] = refs): Node => n(id, { data: { label: id, code } });
const graph = (): Node[] => [
  withCode('i1'),
  withCode('i2', refs.slice(0, 1)),
  n('i3'),
  n('inferred:p', { data: { label: 'p', inferred: { id: 'p' }, code: refs } }),
  n(SYM, { type: 'code_symbol' }),
];

describe('codeOf and applyNest', () => {
  it('reads the list the server sent, in its order', () => {
    expect(codeOf(withCode('i1')).map((r) => r.raw)).toEqual(refs.map((r) => r.raw));
    expect(codeOf(n('i3'))).toEqual([]);
  });

  it('puts the count on an intent with code, open only when its id is in the set', () => {
    const out = applyNest(graph(), new Set(['i2']));
    const by = new Map(out.map((x) => [x.id, x]));
    expect(nestOf(by.get('i1'))).toEqual({ count: 4, open: false });
    expect(nestOf(by.get('i2'))).toEqual({ count: 1, open: true });
    expect(nestOf(by.get('i3'))).toBe(null);
    // a proposal never opens in this lane, and code nodes are left alone
    expect(nestOf(by.get('inferred:p'))).toBe(null);
    expect(nestOf(by.get(SYM))).toBe(null);
  });

  it('is safe to run again on its own output and drops the mark when the code goes', () => {
    const once = applyNest(graph(), new Set(['i1']));
    expect(applyNest(once, new Set(['i1']))).toEqual(once);
    const gone = applyNest(once.map((x) => (x.id === 'i1' ? n('i1') : x)), new Set(['i1']));
    expect(nestOf(gone.find((x) => x.id === 'i1'))).toBe(null);
  });

  it('never changes a node that has no code and no mark', () => {
    const g = graph();
    const out = applyNest(g, new Set());
    expect(out[2]).toBe(g[2]);
    expect(out[4]).toBe(g[4]);
  });

  it('gives a shape string that changes when a node opens or its count changes', () => {
    const a = nestShape(applyNest(graph(), new Set()));
    expect(nestShape(applyNest(graph(), new Set()))).toBe(a);
    expect(nestShape(applyNest(graph(), new Set(['i1'])))).not.toBe(a);
    const fewer = graph().map((x) => (x.id === 'i1' ? withCode('i1', refs.slice(0, 2)) : x));
    expect(nestShape(applyNest(fewer, new Set()))).not.toBe(a);
  });
});

describe('rows', () => {
  it('shows the symbol name then the path, a bare file shows the path alone', () => {
    expect(codeRowText(refs[0]!)).toEqual({ name: 'add', path: 'src/math.ts', note: null });
    expect(codeRowText(refs[1]!)).toEqual({ name: null, path: 'src/math.ts', note: null });
  });

  it('says when the symbol is missing or the code is not found', () => {
    expect(codeRowText(refs[2]!).note).toBe('symbol not found, file linked');
    expect(codeRowText(refs[3]!).note).toBe('code not found');
  });

  it('says in the title which of the two a click will do', () => {
    expect(codeRowTitle(refs[0]!, true)).toBe('add in src/math.ts. Click to open it in the editor at line 3.');
    expect(codeRowTitle(refs[1]!, false)).toBe('src/math.ts. Click to select it in the graph.');
    expect(codeRowTitle(refs[3]!, true)).toBe('src/none.ts. Code not found: nothing in the graph matches src/none.ts.');
  });

  it('labels the count', () => {
    expect(nestCountLabel(2)).toBe('2 code');
  });

  it('keeps one count per node: the pin chip drops its code part, the wires go into the count title', () => {
    expect(chipHidden({ code: 2, spec: 1 }, true)).toEqual({ spec: 1 });
    expect(chipHidden({ code: 2 }, true)).toEqual({});
    expect(chipHidden({ code: 2 }, false)).toEqual({ code: 2 });
    expect(nestToggleTitle(2, false, 1)).toBe('Show the 2 pieces of code this intent is bound to. O opens it. 1 wire from the code block is not drawn.');
    expect(nestToggleTitle(1, true, 0)).toBe('Hide the code this intent is bound to. O closes it.');
  });
});

describe('nestKey', () => {
  const free = { typing: false, menuOpen: false, renameOpen: false };
  it('toggles on O for an intent with code', () => {
    expect(nestKey({ ...free, count: 2 }, { key: 'o' })).toBe('toggle');
    expect(nestKey({ ...free, count: 2 }, { key: 'O', shiftKey: true })).toBe('toggle');
  });

  it('does nothing with no code, in a field, with the menu or a rename open, or with a modifier', () => {
    expect(nestKey({ ...free, count: 0 }, { key: 'o' })).toBe(null);
    expect(nestKey({ ...free, count: null }, { key: 'o' })).toBe(null);
    expect(nestKey({ ...free, typing: true, count: 2 }, { key: 'o' })).toBe(null);
    expect(nestKey({ ...free, renameOpen: true, count: 2 }, { key: 'o' })).toBe(null);
    expect(nestKey({ ...free, menuOpen: true, count: 2 }, { key: 'o' })).toBe(null);
    expect(nestKey({ ...free, count: 2 }, { key: 'o', ctrlKey: true })).toBe(null);
    expect(nestKey({ ...free, count: 2 }, { key: 'p' })).toBe(null);
  });
});

describe('menu entry', () => {
  it('opens and closes, and is disabled with a reason when there is no code', () => {
    expect(nestMenuItem({ count: 2, open: false })).toEqual({ id: 'toggle-code', label: 'Show code', disabled: false, reason: null });
    expect(nestMenuItem({ count: 2, open: true }).label).toBe('Hide code');
    expect(nestMenuItem(null)).toEqual({ id: 'toggle-code', label: 'Show code', disabled: true, reason: 'No code bound to it' });
  });

  it('goes last on an intent menu and works on a read-only page', () => {
    const read = { write: false, reason: 'Start the server with --write' };
    expect(menuItems('intent', read, null, nestMenuItem({ count: 1, open: false })).map((i) => [i.id, i.disabled])).toEqual([
      ['rename', true],
      ['edit-details', true],
      ['toggle-code', false],
    ]);
    // other kinds and the old call are as they were
    expect(menuItems('intent', read).map((i) => i.id)).toEqual(['rename', 'edit-details']);
    expect(menuItems('concept', read, null, nestMenuItem(null)).map((i) => i.id)).toEqual(['add-intent', 'rename', 'edit-details']);
  });
});

describe('layout cache', () => {
  const size = (): { width: number; height: number } => ({ width: 240, height: 72 });
  const e = (id: string, source: string, target: string) => ({ id, source, target });

  it('gives the same key for the same block, even when the wire ids are new', () => {
    const a = layoutKey([n('c1', { type: 'code_module' })], [e('x1', 'c1', 'c2')], size);
    expect(layoutKey([n('c1', { type: 'code_module' })], [e('x2', 'c1', 'c2')], size)).toBe(a);
  });

  it('changes the key when a size, a foot, a parent or a wire changes', () => {
    const nodes = applyNest(graph(), new Set());
    const opts = { footOf: nestFootPx };
    const a = layoutKey(nodes, [], size, opts);
    expect(layoutKey(applyNest(graph(), new Set(['i1'])), [], size, opts)).not.toBe(a);
    expect(layoutKey(nodes, [], () => ({ width: 240, height: 80 }), opts)).not.toBe(a);
    expect(layoutKey(nodes.map((x) => (x.id === 'i1' ? { ...x, parentId: 'c' } : x)), [], size, opts)).not.toBe(a);
    expect(layoutKey(nodes, [e('w', 'i1', 'i2')], size, opts)).not.toBe(a);
  });

  it('hands back a layout only for the key it was stored with', () => {
    const cache = new LayoutCache();
    const placed = new Map([['c1', { position: { x: 1, y: 2 } }]]);
    cache.set('code', 'k1', placed);
    expect(cache.get('code', 'k1')).toBe(placed);
    expect(cache.get('code', 'k2')).toBe(null);
    expect(cache.get('spec', 'k1')).toBe(null);
  });
});

describe('layout sizes', () => {
  it('grows an open intent by a row per anchor and leaves a closed one alone', () => {
    const out = applyNest(graph(), new Set(['i1']));
    const by = new Map(out.map((x) => [x.id, x]));
    expect(nestFootPx(by.get('i1')!)).toBe(4 * NEST_TUNING.rowPx + NEST_TUNING.padPx);
    expect(nestFootPx(by.get('i2')!)).toBe(0);
    expect(nestFootPx(by.get('i3')!)).toBe(0);
    expect(NEST_TUNING.rowPx).toBeGreaterThanOrEqual(24);
    expect(NEST_TUNING.rowPx).toBeLessThanOrEqual(28);
  });

  it('gives the layout a taller box for an open intent, so nothing overlaps it', async () => {
    const out = applyNest(graph(), new Set(['i1'])).filter((x) => x.type === 'intent' && !x.id.startsWith('inferred'));
    // a fake layout that stacks the boxes it is given
    const stack = async (nodes: Array<{ id: string; width: number; height: number }>) => {
      let y = 0;
      return nodes.map((m) => {
        const p = { id: m.id, x: 0, y };
        y += m.height + 10;
        return p;
      });
    };
    const placed = await layoutNested(out, [], () => ({ width: 420, height: 76 }), stack, { groupPad: 24, groupHeader: 64 }, { footOf: nestFootPx });
    expect(placed.get('i1')!.size).toEqual({ width: 420, height: 76 + nestFootPx(out[0]!) });
    expect(placed.get('i2')!.position.y).toBe(76 + nestFootPx(out[0]!) + 10);
    expect(placed.get('i2')!.size).toBeUndefined();
  });
});
