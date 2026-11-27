// reading the newest inference report, the dismissed and accepted list, and putting
// open proposals on the live graph as inferred nodes.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InferProposalRow } from '@intentgraph/shared/schemas';

import type { BuildGraphResult } from '../src/build-graph.js';
import { composeLiveGraph } from '../src/live/compose.js';
import { addAccepted, addDismissed, inferredNodeId, openProposals, parseInferReport, parseSettled, settledText } from '../src/live/infer-marks.js';
import { inferSignature, readInferSnapshot } from '../src/live/infer-reader.js';

const proposal = (id: string, over: Partial<InferProposalRow> = {}): InferProposalRow => ({
  id, folder: 'packages/a/src', title: `Title ${id}`, body: `Body of ${id}.`, anchors: ['packages/a/src/run.ts#runAll', 'packages/a/src/cli.ts'],
  belongs_under: 'concept-c', restates: null, confidence: 'inferred', planned: false, code_hash: 'h1', ...over,
});
const reportText = (proposals: unknown[]): string => JSON.stringify({ result: 'PASS', report: { incomplete: false, proposals } });

let root: string;
const dir = () => join(root, '.runs', 'infer');
const write = (report: string, latest?: string) => {
  mkdirSync(join(dir(), 'r1'), { recursive: true });
  writeFileSync(join(dir(), 'r1', 'report.json'), report);
  writeFileSync(join(dir(), 'latest.json'), latest ?? JSON.stringify({ result: 'PASS', report: '.runs/infer/r1/report.json' }));
};
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'ig-infer-reader-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('readInferSnapshot', () => {
  it('is empty and quiet when no inference ever ran', () => {
    expect(readInferSnapshot(root)).toEqual({ proposals: null, settled: { dismissed: [], accepted: [] }, problem: null });
  });

  it('reads the proposals of the report latest.json names', () => {
    write(reportText([proposal('inf-1'), proposal('inf-2')]));
    const s = readInferSnapshot(root);
    expect(s.problem).toBeNull();
    expect(s.proposals?.map((p) => p.id)).toEqual(['inf-1', 'inf-2']);
  });

  it('turns a broken report into one problem and no proposal', () => {
    write('{ not json');
    const a = readInferSnapshot(root);
    expect(a.proposals).toBeNull();
    expect(a.problem).toMatchObject({ severity: 'error', file: '.runs/infer/r1/report.json' });
    write(reportText([proposal('inf-1'), { ...proposal('inf-2'), confidence: 'certain' }]));
    const b = readInferSnapshot(root);
    expect(b.proposals).toBeNull();
    expect(b.problem?.message).toMatch(/schema at proposal 2/);
    write(JSON.stringify({ report: {} }));
    expect(readInferSnapshot(root).problem?.message).toMatch(/no proposals list/);
  });

  it('refuses a report outside .runs/infer as one problem', () => {
    mkdirSync(join(root, '.runs', 'drift'), { recursive: true });
    writeFileSync(join(root, '.runs', 'drift', 'report.json'), reportText([proposal('inf-1')]));
    for (const named of ['.runs/drift/report.json', '../elsewhere/report.json', join(root, '.runs', 'drift', 'report.json')]) {
      write(reportText([proposal('inf-9')]), JSON.stringify({ report: named }));
      const s = readInferSnapshot(root);
      expect(s.proposals).toBeNull();
      expect(s.problem).toEqual({ severity: 'error', file: '.runs/infer/latest.json', message: 'inference report is outside .runs/infer' });
    }
  });

  it('changes its signature when the report or the settled list changes', () => {
    const a = inferSignature(root);
    write(reportText([proposal('inf-1')]));
    const b = inferSignature(root);
    expect(b).not.toBe(a);
    writeFileSync(join(dir(), 'settled.json'), settledText(addDismissed(parseSettled(null), proposal('inf-1'))));
    expect(inferSignature(root)).not.toBe(b);
  });
});

describe('settled list', () => {
  it('hides a dismissed proposal until its code changes', () => {
    const s = addDismissed(parseSettled(null), proposal('inf-1'));
    expect(openProposals([proposal('inf-1'), proposal('inf-2')], s, new Set()).map((p) => p.id)).toEqual(['inf-2']);
    expect(openProposals([proposal('inf-1', { code_hash: 'h2' })], s, new Set()).map((p) => p.id)).toEqual(['inf-1']);
  });

  it('hides an accepted proposal only while its intent exists', () => {
    const s = addAccepted(parseSettled(null), proposal('inf-1'), 'intent-x');
    expect(openProposals([proposal('inf-1')], s, new Set(['intent-x']))).toEqual([]);
    expect(openProposals([proposal('inf-1')], s, new Set())).toHaveLength(1);
  });

  it('reads a broken or foreign settled file as empty, and adds an id once', () => {
    expect(parseSettled('nope')).toEqual({ dismissed: [], accepted: [] });
    expect(parseSettled(JSON.stringify({ dismissed: [{ id: 1 }], accepted: 'x' }))).toEqual({ dismissed: [], accepted: [] });
    const twice = addDismissed(addDismissed(parseSettled(null), proposal('inf-1')), proposal('inf-1'));
    expect(twice.dismissed).toHaveLength(1);
    expect(parseSettled(settledText(twice))).toEqual(twice);
  });

  it('parses a report and refuses a non object', () => {
    expect(parseInferReport('[]')).toMatchObject({ ok: false });
    expect(parseInferReport(reportText([proposal('inf-1')]))).toMatchObject({ ok: true });
  });
});

const graphResult = (): BuildGraphResult => {
  const n = (id: string, kind: string, title: string, parentId: string | null = null) => ({ id, kind, title, body: '{}', confidence: 'asserted', parentId, version: 0, createdAt: 0, updatedAt: 0 });
  const nodes = [
    n('concept-c', 'concept', 'C'),
    n('intent-d', 'intent', 'Declared one', 'concept-c'),
    n('code_module:packages/a/src/cli.ts', 'code_module', 'cli.ts'),
    n('code_module:packages/a/src/run.ts', 'code_module', 'run.ts'),
    n('code_symbol:packages/a/src/run.ts#runAll#1', 'code_symbol', 'runAll'),
  ];
  return { nodes, edges: [], summary: { nodes: nodes.length, edges: 0, specNodes: 2, codeModules: 2, codeSymbols: 1, skeletonSymbols: 0, warnings: [], errors: [] } } as unknown as BuildGraphResult;
};

describe('inferred nodes in the live graph', () => {
  it('adds each open proposal as an inferred intent under its concept, with realizes edges from its code', () => {
    const g = composeLiveGraph(graphResult(), new Map(), null, root, null, {
      proposals: [proposal('inf-1'), proposal('inf-2', { belongs_under: null, restates: 'intent-d', planned: true, confidence: 'semantic' }), proposal('inf-3', { belongs_under: 'concept-missing' })],
      problem: null,
    });
    const n1 = g.nodes.find((n) => n.id === inferredNodeId(proposal('inf-1')))!;
    expect(n1).toMatchObject({ kind: 'intent', title: 'Title inf-1', parent_id: 'concept-c', confidence: 'inferred' });
    expect(n1.inferred).toMatchObject({ proposal_id: 'inf-1', folder: 'packages/a/src', planned: false, restates: null, restates_title: null });
    const n2 = g.nodes.find((n) => n.id === 'inferred:inf-2')!;
    expect(n2.parent_id).toBeNull();
    expect(n2.inferred).toMatchObject({ planned: true, restates: 'intent-d', restates_title: 'Declared one', confidence: 'semantic' });
    expect(g.nodes.find((n) => n.id === 'inferred:inf-3')!.parent_id).toBeNull();
    const into1 = g.edges.filter((e) => e.dst === 'inferred:inf-1');
    expect(into1.map((e) => [e.src, e.kind]).sort()).toEqual([
      ['code_module:packages/a/src/cli.ts', 'realizes'],
      ['code_symbol:packages/a/src/run.ts#runAll#1', 'realizes'],
    ]);
    expect(n1.status).toBeUndefined();
  });

  it('adds the report problem and no inferred node when the report is unusable', () => {
    const problem = { severity: 'error' as const, file: '.runs/infer/latest.json', message: 'bad' };
    const g = composeLiveGraph(graphResult(), new Map(), null, root, null, { proposals: [], problem });
    expect(g.problems).toContainEqual(problem);
    expect(g.nodes.some((n) => n.inferred)).toBe(false);
  });
});
