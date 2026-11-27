// inferred proposals on the page: keys, menu, how the rename ends, going through them, the words,
// and the loader carrying the proposal onto the node.
import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  acceptedNotice,
  dismissedNotice,
  inferredCountLabel,
  inferredKey,
  inferredMenuItems,
  inferredOf,
  inferredRenameOutcome,
  inferredWords,
  nextInferred,
  sameAsLabel,
  type InferredInfo,
  type InferredKeyState,
} from '../src/app/inferred-model.js';
import { getLayoutSize } from '../src/graph/layout/sizing.js';
import '../src/graph/nodes/IntentNode.js';
import { envelopeToReactFlow } from '../src/transport/graph-json-loader.js';

const info = (over: Partial<InferredInfo> = {}): InferredInfo => ({
  proposal_id: 'inf-1', folder: 'packages/a/src', anchors: ['packages/a/src/run.ts#runAll', 'packages/a/src/cli.ts'], confidence: 'semantic',
  planned: false, restates: null, restates_title: null, belongs_under: 'concept-c', code_hash: 'h1', ...over,
});
const node = (id: string, label: string, inferred: InferredInfo | null, selected = false): Node => ({
  id, type: 'intent', position: { x: 0, y: 0 }, selected, data: { label, kind: 'intent', ...(inferred ? { inferred } : {}) },
});
const base: InferredKeyState = { typing: false, menuOpen: false, renameOpen: false, inferredSelected: true };

describe('inferredKey', () => {
  it('accepts on Enter, dismisses on Delete or Backspace, renames on F2', () => {
    expect(inferredKey(base, { key: 'Enter' })).toBe('accept');
    expect(inferredKey(base, { key: 'Delete' })).toBe('dismiss');
    expect(inferredKey(base, { key: 'Backspace' })).toBe('dismiss');
    expect(inferredKey(base, { key: 'F2' })).toBe('rename');
  });
  it('does nothing while typing, with a menu or rename open, with a modifier, or with no inferred node selected', () => {
    expect(inferredKey({ ...base, typing: true }, { key: 'Enter' })).toBeNull();
    expect(inferredKey({ ...base, menuOpen: true }, { key: 'Enter' })).toBeNull();
    expect(inferredKey({ ...base, renameOpen: true }, { key: 'Delete' })).toBeNull();
    expect(inferredKey({ ...base, inferredSelected: false }, { key: 'Enter' })).toBeNull();
    expect(inferredKey(base, { key: 'Enter', ctrlKey: true })).toBeNull();
    expect(inferredKey(base, { key: 'Delete', shiftKey: true })).toBeNull();
    expect(inferredKey(base, { key: 'a' })).toBeNull();
  });
});

describe('inferredMenuItems', () => {
  it('offers accept, edit title then accept, and dismiss', () => {
    expect(inferredMenuItems({ write: true, reason: null }).map((i) => [i.id, i.disabled])).toEqual([['accept', false], ['rename', false], ['dismiss', false]]);
  });
  it('disables every entry with the reason when read only', () => {
    const items = inferredMenuItems({ write: false, reason: 'Read only. The server was started without --write.' });
    expect(items.every((i) => i.disabled && i.reason === 'Read only. The server was started without --write.')).toBe(true);
  });
});

describe('inferredRenameOutcome', () => {
  it('accepts on Enter under the typed title, also when unchanged', () => {
    expect(inferredRenameOutcome('  New title ', 'enter')).toEqual({ kind: 'accept', title: 'New title' });
  });
  it('writes nothing on Esc or a click away, and keeps a bad title open', () => {
    expect(inferredRenameOutcome('New', 'escape')).toEqual({ kind: 'cancel' });
    expect(inferredRenameOutcome('New', 'blur')).toEqual({ kind: 'cancel' });
    expect(inferredRenameOutcome('   ', 'enter').kind).toBe('problem');
  });
});

describe('nextInferred', () => {
  const nodes = [
    node('intent-d', 'Declared', null),
    node('inferred:b', 'B title', info({ folder: 'z' })),
    node('inferred:a', 'A title', info({ folder: 'a' })),
    node('inferred:c', 'C title', info({ folder: 'a' })),
  ];
  it('goes through the open proposals by folder then title, wrapping', () => {
    expect(nextInferred(nodes, null)).toBe('inferred:a');
    expect(nextInferred(nodes, 'inferred:a')).toBe('inferred:c');
    expect(nextInferred(nodes, 'inferred:c')).toBe('inferred:b');
    expect(nextInferred(nodes, 'inferred:b')).toBe('inferred:a');
    expect(nextInferred(nodes, 'intent-d')).toBe('inferred:a');
  });
  it('is null when nothing is open', () => {
    expect(nextInferred([node('intent-d', 'D', null)], null)).toBeNull();
  });
});

describe('words and notices', () => {
  it('says inferred and the confidence word, and planned when it is', () => {
    expect(inferredWords(info())).toEqual(['inferred', 'confidence semantic']);
    expect(inferredWords(info({ planned: true, confidence: 'inferred' }))).toEqual(['inferred', 'confidence inferred', 'planned']);
  });
  it('names the intent it restates by title, or by id when the title is not known', () => {
    expect(sameAsLabel(info())).toBeNull();
    expect(sameAsLabel(info({ restates: 'intent-x', restates_title: 'Rounds to cents' }))).toBe('same as Rounds to cents');
    expect(sameAsLabel(info({ restates: 'intent-x' }))).toBe('same as intent-x');
  });
  it('counts and announces', () => {
    expect(inferredCountLabel(14)).toBe('14 inferred');
    expect(acceptedNotice('T', 'spec/intents/t.md')).toBe('Accepted "T" as spec/intents/t.md.');
    expect(dismissedNotice('T')).toMatch(/^Dismissed "T"\./);
  });
});

describe('loader and size', () => {
  it('carries the proposal onto the node and gives it room for its marks', () => {
    const env = {
      _format: 'intentgraph-l0-export', _version: 1, edges: [],
      nodes: [
        { id: 'intent-d', kind: 'intent', title: 'Declared', body: {}, confidence: 'asserted', parent_id: null },
        { id: 'inferred:inf-1', kind: 'intent', title: 'Inferred', body: 'b', confidence: 'semantic', parent_id: null, inferred: info({ restates: 'intent-d', restates_title: 'Declared' }) },
      ],
    };
    const { nodes } = envelopeToReactFlow(env as unknown as Parameters<typeof envelopeToReactFlow>[0]);
    const inferred = nodes.find((n) => n.id === 'inferred:inf-1')!;
    expect(inferredOf(inferred)?.proposal_id).toBe('inf-1');
    expect(inferredOf(nodes.find((n) => n.id === 'intent-d'))).toBeNull();
    expect(getLayoutSize(inferred).height).toBeGreaterThan(getLayoutSize(nodes.find((n) => n.id === 'intent-d')!).height);
  });
});
