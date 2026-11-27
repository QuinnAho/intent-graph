// reading the newest drift report from a workspace, and putting its marks on the live graph.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DriftPairReport } from '@intentgraph/shared/schemas';

import type { BuildGraphResult } from '../src/build-graph.js';
import { composeLiveGraph } from '../src/live/compose.js';
import { buildDriftMarks } from '../src/live/drift-marks.js';
import { driftSignature, readDriftSnapshot } from '../src/live/drift-reader.js';

const pair = (node_id: string, verdict: DriftPairReport['verdict']): DriftPairReport => ({
  commit: 'c1', node_id, targets: [], decided_by: 'judge', verdict, confidence: 'inferred', certainty: 'high',
  evidence: 'quote', evidence_in_diff: true, suggested_action: 'fix it', truncated: false, diff_chars: 1, cost_usd: 0, seconds: 0, judge_model: null, error: null,
});

let root: string;
const dir = () => join(root, '.runs', 'drift');
const write = (report: string, latest?: string) => {
  mkdirSync(join(dir(), 'r1'), { recursive: true });
  writeFileSync(join(dir(), 'r1', 'report.json'), report);
  writeFileSync(join(dir(), 'latest.json'), latest ?? JSON.stringify({ result: 'PASS', report: join(dir(), 'r1', 'report.json') }));
};
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'ig-drift-reader-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('readDriftSnapshot', () => {
  it('is empty and quiet when no check ever ran', () => {
    expect(readDriftSnapshot(root)).toEqual({ pairs: null, writtenAtMs: 0, problem: null });
  });

  it('reads the report that latest.json names', () => {
    write(JSON.stringify({ report: { pairs: [pair('a', 'drift')] } }));
    const s = readDriftSnapshot(root);
    expect(s.pairs?.map((p) => p.node_id)).toEqual(['a']);
    expect(s.writtenAtMs).toBeGreaterThan(0);
    expect(s.problem).toBeNull();
  });

  it('turns a report that is not json into one problem and no marks', () => {
    write('{ nope');
    const s = readDriftSnapshot(root);
    expect(s.pairs).toBeNull();
    expect(s.problem).toMatchObject({ severity: 'error', file: '.runs/drift/r1/report.json' });
  });

  it('turns a schema mismatch into one problem and no marks', () => {
    write(JSON.stringify({ report: { pairs: [{ node_id: 'a' }] } }));
    const s = readDriftSnapshot(root);
    expect(s.pairs).toBeNull();
    expect(s.problem?.message).toMatch(/schema/);
  });

  it('turns a broken latest.json, a missing report and an outside path into problems', () => {
    write('{}', '{ nope');
    expect(readDriftSnapshot(root).problem?.file).toBe('.runs/drift/latest.json');
    write('{}', JSON.stringify({ report: join(dir(), 'gone', 'report.json') }));
    expect(readDriftSnapshot(root).problem?.message).toMatch(/cannot be read/);
    write('{}', JSON.stringify({ report: join(root, 'elsewhere.json') }));
    expect(readDriftSnapshot(root).problem?.message).toMatch(/outside/);
  });

  it('changes its signature when the report is written, edited or removed', () => {
    const none = driftSignature(root);
    write(JSON.stringify({ report: { pairs: [] } }));
    const first = driftSignature(root);
    expect(first).not.toBe(none);
    write(JSON.stringify({ report: { pairs: [pair('a', 'drift')] } }));
    expect(driftSignature(root)).not.toBe(first);
    rmSync(join(dir(), 'latest.json'));
    expect(driftSignature(root)).toBe(none);
  });
});

describe('composeLiveGraph with drift', () => {
  const n = (id: string, kind: string) => ({ id, kind, title: id, body: '{}', confidence: 'asserted', parentId: null, version: 0, createdAt: 0, updatedAt: 0 });
  const result = {
    nodes: [n('intent-a', 'intent'), n('intent-b', 'intent'), n('code_module:src/a.ts', 'code_module')],
    edges: [],
    summary: { nodes: 3, edges: 0, specNodes: 2, codeModules: 1, codeSymbols: 0, skeletonSymbols: 0, warnings: [], errors: [] },
  } as unknown as BuildGraphResult;

  it('marks only the spec nodes the report names', () => {
    const marks = buildDriftMarks([pair('intent-a', 'drift'), pair('code_module:src/a.ts', 'drift')], 1, new Map(), () => null);
    const g = composeLiveGraph(result, new Map(), null, '/ws', { marks, problem: null });
    const by = new Map(g.nodes.map((x) => [x.id, x]));
    expect(by.get('intent-a')!.drift?.verdict).toBe('drift');
    expect(by.get('intent-b')!.drift).toBeUndefined();
    expect(by.get('code_module:src/a.ts')!.drift).toBeUndefined();
  });

  it('adds the report problem to the problems list and no marks', () => {
    const problem = { severity: 'error' as const, file: '.runs/drift/r1/report.json', message: 'bad' };
    const g = composeLiveGraph(result, new Map(), null, '/ws', { marks: new Map(), problem });
    expect(g.problems).toEqual([problem]);
    expect(g.nodes.every((x) => x.drift === undefined)).toBe(true);
  });
});
