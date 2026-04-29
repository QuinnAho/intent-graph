// Tests for the L0 graph.json loader. Coverage:
//   - envelope schema mismatch (wrong _format / _version) → store goes to error.
//   - happy path: envelope payload converts to React Flow nodes/edges and
//     dispatches into the store.
//   - sub-flow parenting: when a node's parent_id refers to another node in
//     the same envelope, the React Flow node carries `parentId` AND
//     `extent: 'parent'` (p2-t09 contract).
//   - dangling parent_id (target node missing from envelope): no parentId set,
//     and the loader does not throw.
//   - duplicate edge ids in the envelope are de-duplicated.
//
// We bypass fetch via the loader's `payload` test seam; that keeps these
// tests pure and avoids jsdom fetch + Worker bootstrap noise. Layout is
// exercised by the loader implicitly — we accept whatever positions ELK
// emits since this test file is about transport, not layout.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGraphStore } from '../src/store/graph-slice.js';
import { loadGraphFromJson } from '../src/transport/graph-json-loader.js';

// Mock the layout module so tests don't need to spin up a Worker.
vi.mock('../src/graph/layout/index.js', () => ({
  runLayout: vi.fn(async (nodes: Array<{ id: string }>) =>
    nodes.map((n, i) => ({ id: n.id, x: i * 100, y: 0 })),
  ),
}));

// Mock sizing so we don't need to import the chrome registry.
vi.mock('../src/graph/layout/sizing.js', () => ({
  getLayoutSize: () => ({ width: 200, height: 60 }),
}));

const validEnvelope = {
  _format: 'intentgraph-l0-export',
  _version: 1,
  nodes: [
    { id: 'intent-foo', kind: 'intent', title: 'Foo', body: {}, confidence: 'asserted', parent_id: null },
    { id: 'concept-bar', kind: 'concept', title: 'Bar', body: {}, confidence: 'asserted', parent_id: null },
    { id: 'intent-baz', kind: 'intent', title: 'Baz', body: {}, confidence: 'asserted', parent_id: 'concept-bar' },
  ],
  edges: [
    { id: 'e1', src: 'intent-baz', dst: 'concept-bar', kind: 'realizes', weight: 1 },
  ],
};

beforeEach(() => {
  // Reset store to initial state before each test.
  useGraphStore.setState({
    nodes: [],
    edges: [],
    status: 'idle',
    errorMessage: null,
    layoutReady: false,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('loadGraphFromJson — envelope validation', () => {
  it('rejects an envelope with the wrong _format', async () => {
    await loadGraphFromJson({
      payload: { ...validEnvelope, _format: 'something-else' } as never,
    });
    const state = useGraphStore.getState();
    expect(state.status).toBe('error');
    expect(state.errorMessage).toMatch(/_format mismatch/);
  });

  it('rejects an envelope with the wrong _version', async () => {
    await loadGraphFromJson({
      payload: { ...validEnvelope, _version: 999 } as never,
    });
    const state = useGraphStore.getState();
    expect(state.status).toBe('error');
    expect(state.errorMessage).toMatch(/_version mismatch/);
  });
});

describe('loadGraphFromJson — happy path', () => {
  it('converts the envelope into React Flow nodes and edges, ready in the store', async () => {
    await loadGraphFromJson({ payload: validEnvelope });
    const state = useGraphStore.getState();
    expect(state.status).toBe('ready');
    expect(state.layoutReady).toBe(true);
    expect(state.nodes.length).toBe(3);
    expect(state.edges.length).toBe(1);

    const intentFoo = state.nodes.find((n) => n.id === 'intent-foo');
    expect(intentFoo?.type).toBe('intent');
    expect(intentFoo?.data['label']).toBe('Foo');
  });

  it('preserves edge endpoints from src/dst → source/target', async () => {
    await loadGraphFromJson({ payload: validEnvelope });
    const edge = useGraphStore.getState().edges[0];
    expect(edge?.source).toBe('intent-baz');
    expect(edge?.target).toBe('concept-bar');
  });
});

describe('loadGraphFromJson — sub-flow parenting (p2-t09)', () => {
  it('sets parentId AND extent="parent" when the parent exists in the envelope', async () => {
    await loadGraphFromJson({ payload: validEnvelope });
    const child = useGraphStore.getState().nodes.find((n) => n.id === 'intent-baz');
    // React Flow types parentId/extent as optional top-level Node fields.
    expect((child as { parentId?: string }).parentId).toBe('concept-bar');
    expect((child as { extent?: string }).extent).toBe('parent');
  });

  it('does NOT set parentId when the referenced parent is missing from the envelope', async () => {
    const danglingEnvelope = {
      ...validEnvelope,
      nodes: [
        { id: 'orphan-1', kind: 'intent', title: 'Orphan', body: {}, confidence: 'inferred', parent_id: 'does-not-exist' },
      ],
      edges: [],
    };
    await loadGraphFromJson({ payload: danglingEnvelope });
    const state = useGraphStore.getState();
    expect(state.status).toBe('ready');
    const orphan = state.nodes.find((n) => n.id === 'orphan-1');
    expect((orphan as { parentId?: string }).parentId).toBeUndefined();
  });

  it('does NOT set parentId when parent_id is null', async () => {
    await loadGraphFromJson({ payload: validEnvelope });
    const root = useGraphStore.getState().nodes.find((n) => n.id === 'intent-foo');
    expect((root as { parentId?: string }).parentId).toBeUndefined();
  });

  it('does NOT set parentId when the parent exists but is not a concept', async () => {
    // Per tech-spec §4.1 line 179, parent_id is concept-boundary-only.
    // A code_symbol pointing at a code_module (the legacy walker behavior
    // that produced overlapping cards in the L0 canvas) must not be turned
    // into a React Flow sub-flow child even if both nodes are in the
    // envelope. The renderer enforces the rule defensively against future
    // producers that re-overload parent_id.
    const moduleSymbolEnvelope = {
      ...validEnvelope,
      nodes: [
        { id: 'code_module:foo.ts', kind: 'code_module', title: 'foo.ts', body: {}, confidence: 'extracted', parent_id: null },
        { id: 'code_symbol:foo.ts#FOO', kind: 'code_symbol', title: 'FOO', body: {}, confidence: 'extracted', parent_id: 'code_module:foo.ts' },
      ],
      edges: [],
    };
    await loadGraphFromJson({ payload: moduleSymbolEnvelope });
    const symbol = useGraphStore.getState().nodes.find((n) => n.id === 'code_symbol:foo.ts#FOO');
    expect((symbol as { parentId?: string }).parentId).toBeUndefined();
    expect((symbol as { extent?: string }).extent).toBeUndefined();
  });
});

describe('loadGraphFromJson — edge deduplication', () => {
  it('de-duplicates edges with identical ids', async () => {
    const dupEnvelope = {
      ...validEnvelope,
      edges: [
        { id: 'e1', src: 'intent-baz', dst: 'concept-bar', kind: 'realizes', weight: 1 },
        { id: 'e1', src: 'intent-baz', dst: 'concept-bar', kind: 'realizes', weight: 1 },
        { id: 'e2', src: 'intent-foo', dst: 'concept-bar', kind: 'references', weight: 1 },
      ],
    };
    await loadGraphFromJson({ payload: dupEnvelope });
    const state = useGraphStore.getState();
    expect(state.edges.length).toBe(2);
    expect(new Set(state.edges.map((e) => e.id)).size).toBe(2);
  });
});
