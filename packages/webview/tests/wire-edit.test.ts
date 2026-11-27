// editing by wire: which drops the page lights up, what a drop over a box means, and
// the notice text. the server checks the parent table again before it writes.
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { boxUnder, changeNotice, deletableWire, dropOutcome, endsOf, isUndoKey, lightedBox, whyNotParent } from '../src/graph/wire-edit-model.js';

const n = (id: string, type: string, parentId?: string): Node => ({ id, type, position: { x: 0, y: 0 }, data: { label: id.toUpperCase() }, ...(parentId ? { parentId } : {}) });
const e = (source: string, target: string, kind = 'realizes'): Edge => ({ id: `${source}>${target}`, source, target, data: { kind } });

const NODES = [n('concept-a', 'concept'), n('concept-b', 'concept'), n('concept-inner', 'concept', 'concept-a'), n('intent-x', 'intent', 'concept-a'), n('constraint-k', 'constraint'), n('fn', 'function')];
const EDGES = [e('intent-x', 'concept-a'), e('concept-inner', 'concept-a'), e('fn', 'intent-x', 'implements')];
const ends = endsOf(NODES, EDGES);

describe('wire edit rules', () => {
  it('lights up only the parents the table allows', () => {
    expect(whyNotParent(ends, 'constraint-k', 'intent-x')).toBeNull();
    expect(whyNotParent(ends, 'constraint-k', 'concept-b')).toBeNull();
    expect(whyNotParent(ends, 'intent-x', 'concept-b')).toBeNull();
    expect(whyNotParent(ends, 'intent-x', 'constraint-k')).toMatch(/only hang under a concept/);
    expect(whyNotParent(ends, 'intent-x', 'intent-x')).toMatch(/itself/);
    expect(whyNotParent(ends, 'fn', 'concept-a')).toMatch(/Code/);
    expect(whyNotParent(ends, 'constraint-k', 'fn')).toMatch(/code/);
    expect(whyNotParent(ends, 'intent-x', 'concept-a')).toMatch(/already/);
    expect(whyNotParent(ends, 'concept-a', 'concept-inner')).toMatch(/loop/);
  });

  it('deletes only parent wires from spec nodes', () => {
    expect(deletableWire(e('intent-x', 'concept-a'), ends)).toEqual({ child: 'intent-x', parent: 'concept-a' });
    expect(deletableWire(e('fn', 'intent-x', 'implements'), ends)).toBeNull();
  });

  it('finds the innermost box under the pointer and never the dragged node or its insides', () => {
    const boxes = [
      { id: 'concept-a', x: 0, y: 0, width: 500, height: 500 },
      { id: 'concept-inner', x: 50, y: 50, width: 100, height: 100 },
      { id: 'concept-b', x: 600, y: 0, width: 300, height: 300 },
      { id: 'intent-x', x: 60, y: 60, width: 50, height: 50 },
    ];
    expect(boxUnder({ x: 70, y: 70 }, boxes, 'intent-x', ends)).toBe('concept-inner');
    expect(boxUnder({ x: 300, y: 300 }, boxes, 'intent-x', ends)).toBe('concept-a');
    expect(boxUnder({ x: 700, y: 100 }, boxes, 'intent-x', ends)).toBe('concept-b');
    expect(boxUnder({ x: 550, y: 100 }, boxes, 'intent-x', ends)).toBeNull();
    expect(boxUnder({ x: 70, y: 70 }, boxes, 'concept-a', ends)).toBeNull();
  });

  it('writes nothing for a drop outside every box or inside its own', () => {
    expect(dropOutcome(ends, 'intent-x', null)).toEqual({ kind: 'none' });
    expect(dropOutcome(ends, 'intent-x', 'concept-a')).toEqual({ kind: 'none' });
    expect(dropOutcome(ends, 'intent-x', 'concept-b')).toEqual({ kind: 'move', parent: 'concept-b' });
    expect(dropOutcome(ends, 'concept-a', 'concept-inner').kind).toBe('refuse');
  });

  it('says what happened', () => {
    expect(changeNotice(ends, 'intent-x', 'concept-b', 'concept-a')).toBe('Moved INTENT-X into CONCEPT-B.');
    expect(changeNotice(ends, 'constraint-k', 'intent-x', null)).toBe('Connected CONSTRAINT-K to INTENT-X.');
    expect(changeNotice(ends, 'constraint-k', null, 'intent-x')).toBe('Disconnected CONSTRAINT-K from INTENT-X.');
  });

  it('takes ctrl+z and cmd+z only outside text fields', () => {
    const k = { key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    expect(isUndoKey(k, false)).toBe(true);
    expect(isUndoKey({ ...k, ctrlKey: false, metaKey: true }, false)).toBe(true);
    expect(isUndoKey(k, true)).toBe(false);
    expect(isUndoKey({ ...k, shiftKey: true }, false)).toBe(false);
    expect(isUndoKey({ ...k, key: 'y' }, false)).toBe(false);
  });
});

describe('the box that lights up under a held node', () => {
  it('lights a concept box that would take the node, and nothing else', () => {
    expect(lightedBox(ends, 'constraint-k', 'concept-b', true)).toBe('concept-b');
    expect(lightedBox(ends, 'intent-x', 'concept-b', true)).toBe('concept-b');
    // its own box, a refused pair and no box light nothing
    expect(lightedBox(ends, 'intent-x', 'concept-a', true)).toBeNull();
    expect(lightedBox(ends, 'concept-a', 'concept-inner', true)).toBeNull();
    expect(lightedBox(ends, 'intent-x', null, true)).toBeNull();
  });

  it('lights nothing in read only mode', () => {
    expect(lightedBox(ends, 'intent-x', 'concept-b', false)).toBeNull();
  });
});
