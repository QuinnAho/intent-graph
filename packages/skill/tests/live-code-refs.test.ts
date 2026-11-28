// lane 13: every declared spec node lists the code it is bound to, in the file's order, and code
// nodes carry a path from the root instead of an absolute file uri.
import { describe, expect, it } from 'vitest';

import { LiveCodeRefSchema } from '@intentgraph/shared/schemas';

import { codePlace, codeRefs } from '../src/live/code-refs.js';
import { composeLiveGraph } from '../src/live/compose.js';
import type { BuildGraphResult } from '../src/build-graph.js';

const SYM = 'code_symbol:src/a.ts#add#0123456789ab';
const n = (id: string, kind: string, title: string, body: unknown = {}) => ({
  id, kind, title, body: JSON.stringify(body), confidence: 'asserted', parentId: null, version: 0, createdAt: 0, updatedAt: 0,
});
const result = {
  nodes: [
    n('intent-a', 'intent', 'a'),
    n('intent-b', 'intent', 'b'),
    n('intent-c', 'intent', 'c'),
    n('code_module:src/a.ts', 'code_module', 'src/a.ts', { uri: 'file:///ws/src/a.ts', language: 'typescript', file_hash: 'h' }),
    n(SYM, 'code_symbol', 'add', { uri: 'file:///ws/src/a.ts', range: { start: { line: 4, column: 0 }, end: { line: 6, column: 1 } }, qualified_name: 'add' }),
  ],
  edges: [],
  summary: { nodes: 5, edges: 0, specNodes: 3, codeModules: 1, codeSymbols: 1, skeletonSymbols: 0, warnings: [], errors: [] },
} as unknown as BuildGraphResult;

const anchors = new Map([
  [
    'intent-a',
    {
      file: 'x',
      realizedBy: [
        { raw: 'src/a.ts#add', path: 'src/a.ts', name: 'add' },
        { raw: 'src/a.ts', path: 'src/a.ts' },
        { raw: 'src/a.ts#gone', path: 'src/a.ts', name: 'gone' },
        { raw: 'src/none.ts#x', path: 'src/none.ts', name: 'x' },
      ],
      verifiedBy: [],
      warnings: [],
    },
  ],
  ['intent-b', { file: 'y', realizedBy: [], verifiedBy: [], warnings: [] }],
]);

describe('codeRefs', () => {
  const ids = new Set(result.nodes.map((x) => x.id));
  const lines = new Map([[SYM, 5]]);
  const refs = codeRefs(anchors.get('intent-a')!.realizedBy, ids, [SYM], lines);

  it('keeps one entry per anchor in the order of the file', () => {
    expect(refs.map((r) => r.raw)).toEqual(['src/a.ts#add', 'src/a.ts', 'src/a.ts#gone', 'src/none.ts#x']);
  });

  it('names the symbol, the code node and the line from 1 when the symbol resolved', () => {
    expect(refs[0]).toEqual({ raw: 'src/a.ts#add', path: 'src/a.ts', name: 'add', target: SYM, line: 5, symbol_missing: false });
  });

  it('gives a bare file anchor its module and no name or line', () => {
    expect(refs[1]).toEqual({ raw: 'src/a.ts', path: 'src/a.ts', target: 'code_module:src/a.ts', symbol_missing: false });
  });

  it('says when the symbol was missing and the file was linked instead', () => {
    expect(refs[2]).toEqual({ raw: 'src/a.ts#gone', path: 'src/a.ts', name: 'gone', target: 'code_module:src/a.ts', symbol_missing: true });
  });

  it('keeps an anchor that is not in the graph, with no target', () => {
    expect(refs[3]).toEqual({ raw: 'src/none.ts#x', path: 'src/none.ts', name: 'x', target: null, symbol_missing: false });
  });

  it('matches the shared schema', () => {
    for (const r of refs) expect(LiveCodeRefSchema.parse(r)).toEqual(r);
  });
});

describe('codePlace', () => {
  it('reads the path from the root out of the id and the line from 1 out of the range', () => {
    expect(codePlace('code_module:src/a.ts', {})).toEqual({ path: 'src/a.ts' });
    expect(codePlace(SYM, { range: { start: { line: 4 } } })).toEqual({ path: 'src/a.ts', line: 5 });
  });

  it('keeps a hash inside a file name', () => {
    expect(codePlace('code_module:src/c#.ts', {})).toEqual({ path: 'src/c#.ts' });
  });

  it('returns null for a node that is not code', () => {
    expect(codePlace('intent-a', {})).toBe(null);
  });
});

describe('composeLiveGraph with code refs', () => {
  const g = composeLiveGraph(result, anchors, null, '/ws');
  const byId = new Map(g.nodes.map((x) => [x.id, x]));

  it('puts the list on a node with realized_by and none on a node without', () => {
    expect(byId.get('intent-a')!.code!.length).toBe(4);
    expect(byId.get('intent-b')!.code).toBe(undefined);
    expect(byId.get('intent-c')!.code).toBe(undefined);
  });

  it('drops the absolute uri and sends the path from the root and the line', () => {
    const mod = byId.get('code_module:src/a.ts')!;
    const sym = byId.get(SYM)!;
    expect(mod.path).toBe('src/a.ts');
    expect(sym.path).toBe('src/a.ts');
    expect(sym.line).toBe(5);
    expect(mod.line).toBe(undefined);
    expect((mod.body as Record<string, unknown>)['uri']).toBe(undefined);
    expect((sym.body as Record<string, unknown>)['uri']).toBe(undefined);
    expect((mod.body as Record<string, unknown>)['language']).toBe('typescript');
    expect(JSON.stringify(g)).not.toContain('file://');
  });

  it('keeps the realizes edges and the warnings as they were', () => {
    expect(g.edges.filter((e) => e.dst === 'intent-a').map((e) => e.id)).toEqual([`anchor:${SYM}->intent-a`, 'anchor:code_module:src/a.ts->intent-a', 'anchor:code_module:src/a.ts->intent-a']);
    expect(byId.get('intent-a')!.warnings).toEqual(['realized_by: src/a.ts#gone symbol not found, linked to the file', 'realized_by: src/none.ts#x is not in the graph']);
  });
});
