// the drift mark reaches the node data, and a node with no entry has none.
import { describe, expect, it, vi } from 'vitest';

import { useGraphStore } from '../src/store/graph-slice.js';
import { loadGraphFromJson } from '../src/transport/graph-json-loader.js';

vi.mock('../src/graph/layout/index.js', () => ({
  runLayout: vi.fn(async (nodes: Array<{ id: string }>) => nodes.map((n, i) => ({ id: n.id, x: i * 100, y: 0 }))),
}));
vi.mock('../src/graph/layout/sizing.js', () => ({ getLayoutSize: () => ({ width: 200, height: 60 }) }));

const drift = { verdict: 'drift', evidence: 'quote', suggested_action: 'fix', commit: 'abc', decided_by: 'judge', reported_at: '2026-11-27T10:00:00.000Z', entries: 2, stale: true };
const node = (id: string, extra: object = {}) => ({ id, kind: 'intent', title: id, body: {}, confidence: 'asserted', parent_id: null, ...extra });

describe('drift on node data', () => {
  it('copies drift from the live json and leaves other nodes without it', async () => {
    await loadGraphFromJson({ payload: { _format: 'intentgraph-l0-export', _version: 1, nodes: [node('intent-a', { drift }), node('intent-b')], edges: [] } as never });
    const nodes = useGraphStore.getState().nodes;
    expect(nodes.find((n) => n.id === 'intent-a')?.data['drift']).toEqual(drift);
    expect(nodes.find((n) => n.id === 'intent-b')?.data['drift']).toBeUndefined();
  });
});
