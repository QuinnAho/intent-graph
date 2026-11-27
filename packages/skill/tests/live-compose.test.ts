// the live graph is the static build plus anchors, check status and warnings.
import { describe, expect, it } from 'vitest';

import { composeLiveGraph } from '../src/live/compose.js';
import type { BuildGraphResult } from '../src/build-graph.js';

const n = (id: string, kind: string, title = id) => ({
  id, kind, title, body: '{}', confidence: 'asserted', parentId: null, version: 0, createdAt: 0, updatedAt: 0,
});
const result = {
  nodes: [
    n('intent-a', 'intent'),
    n('intent-b', 'intent'),
    n('intent-c', 'intent'),
    n('code_module:src/a.ts', 'code_module', 'src/a.ts'),
    n('code_symbol:src/a.ts#add#0123456789ab', 'code_symbol', 'add'),
  ],
  edges: [],
  summary: { nodes: 5, edges: 0, specNodes: 3, codeModules: 1, codeSymbols: 1, skeletonSymbols: 0, warnings: [], errors: [] },
} as unknown as BuildGraphResult;

const anchors = new Map([
  ['intent-a', { file: 'x', realizedBy: [{ raw: 'src/a.ts#add', path: 'src/a.ts', name: 'add' }], verifiedBy: [{ raw: 't.test.ts', path: 't.test.ts' }], warnings: [] }],
  ['intent-b', { file: 'y', realizedBy: [{ raw: 'src/gone.ts', path: 'src/gone.ts' }], verifiedBy: [], warnings: ['verified_by entry 42 is not a string'] }],
]);
const report = { testResults: [{ name: '/ws/t.test.ts', status: 'passed', assertionResults: [{ title: 't', fullName: 't', status: 'passed' }] }] };

describe('composeLiveGraph', () => {
  const g = composeLiveGraph(result, anchors, report, '/ws');
  const byId = new Map(g.nodes.map((x) => [x.id, x]));

  it('puts a check status on every spec node and none on code', () => {
    expect(byId.get('intent-a')!.status).toBe('verified');
    expect(byId.get('intent-b')!.status).toBe('pending');
    expect(byId.get('intent-c')!.status).toBe('pending');
    expect(byId.get('code_module:src/a.ts')!.status).toBe(undefined);
  });

  it('links realized_by to the named symbol with a stable edge id', () => {
    const e = g.edges.find((x) => x.dst === 'intent-a');
    expect(e).toMatchObject({ src: 'code_symbol:src/a.ts#add#0123456789ab', kind: 'realizes' });
    expect(composeLiveGraph(result, anchors, report, '/ws').edges.find((x) => x.dst === 'intent-a')!.id).toBe(e!.id);
  });

  it('turns a missing target and a bad anchor into node warnings', () => {
    const w = byId.get('intent-b')!.warnings!;
    expect(w.some((x) => /42/.test(x))).toBe(true);
    expect(w.some((x) => /src\/gone\.ts/.test(x))).toBe(true);
  });

  it('keeps the export envelope readable by the webview loader', () => {
    expect(g._format).toBe('intentgraph-l0-export');
    expect(g._version).toBe(1);
  });
});
