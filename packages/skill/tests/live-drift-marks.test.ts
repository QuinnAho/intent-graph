// the drift mark rules: worst verdict per node, the stale rule, and a broken report.
import { describe, expect, it } from 'vitest';

import type { DriftPairReport } from '@intentgraph/shared/schemas';

import { buildDriftMarks, parseDriftReport, pickWorst } from '../src/live/drift-marks.js';

const pair = (node_id: string, verdict: DriftPairReport['verdict'], commit = 'c1', extra: Partial<DriftPairReport> = {}): DriftPairReport => ({
  commit, node_id, targets: [], decided_by: 'judge', verdict, confidence: 'inferred', certainty: 'high',
  evidence: `ev ${verdict} ${commit}`, evidence_in_diff: true, suggested_action: `act ${verdict}`, truncated: false,
  diff_chars: 10, cost_usd: 0, seconds: 0, judge_model: null, error: null, ...extra,
});

describe('pickWorst', () => {
  it('ranks drift over unclear over aligned and counts the entries', () => {
    const w = pickWorst([pair('a', 'aligned', 'c1'), pair('a', 'drift', 'c2'), pair('a', 'unclear', 'c3'), pair('b', 'aligned')]);
    expect(w.get('a')!.entry.verdict).toBe('drift');
    expect(w.get('a')!.entry.commit).toBe('c2');
    expect(w.get('a')!.count).toBe(3);
    expect(w.get('b')!.count).toBe(1);
  });

  it('takes the newest entry among equal verdicts', () => {
    const w = pickWorst([pair('a', 'drift', 'old'), pair('a', 'drift', 'new')]);
    expect(w.get('a')!.entry.commit).toBe('new');
  });

  it('keeps unclear over aligned', () => {
    expect(pickWorst([pair('a', 'unclear'), pair('a', 'aligned')]).get('a')!.entry.verdict).toBe('unclear');
  });
});

describe('buildDriftMarks stale rule', () => {
  const pairs = [pair('a', 'drift'), pair('b', 'aligned'), pair('c', 'unclear')];
  const realized = new Map([['a', ['src/a.ts']], ['b', ['src/b.ts', 'src/b2.ts']]]);
  const at = 1000;
  const marks = (m: Record<string, number | null>) => buildDriftMarks(pairs, at, realized, (p) => m[p] ?? null);

  it('is current when every bound file is not newer than the report', () => {
    const r = marks({ 'src/a.ts': 900, 'src/b.ts': 1000, 'src/b2.ts': 500 });
    expect(r.get('a')!.stale).toBe(false);
    expect(r.get('b')!.stale).toBe(false);
  });

  it('is stale when one bound file changed after the report', () => {
    const r = marks({ 'src/a.ts': 900, 'src/b.ts': 100, 'src/b2.ts': 1001 });
    expect(r.get('a')!.stale).toBe(false);
    expect(r.get('b')!.stale).toBe(true);
  });

  it('ignores a missing file and a node with no bound files', () => {
    const r = marks({});
    expect(r.get('a')!.stale).toBe(false);
    expect(r.get('c')!.stale).toBe(false);
  });

  it('carries the evidence, commit, how it was decided and the report time', () => {
    const m = marks({}).get('a')!;
    expect(m).toMatchObject({ verdict: 'drift', evidence: 'ev drift c1', suggested_action: 'act drift', commit: 'c1', decided_by: 'judge', entries: 1 });
    expect(m.reported_at).toBe(new Date(at).toISOString());
  });
});

describe('parseDriftReport', () => {
  const wrap = (report: unknown) => JSON.stringify({ result: 'PASS', report });

  it('reads range pairs', () => {
    const r = parseDriftReport(wrap({ mode: 'range', pairs: [pair('a', 'drift')] }));
    expect(r).toEqual({ ok: true, pairs: [pair('a', 'drift')] });
  });

  it('reads the pairs of every case run', () => {
    const r = parseDriftReport(wrap({ mode: 'cases', reports: { x: { pairs: [pair('a', 'drift')] }, y: { pairs: [pair('b', 'aligned')] } } }));
    expect(r.ok && r.pairs.map((p) => p.node_id)).toEqual(['a', 'b']);
  });

  it('refuses text that is not json', () => {
    expect(parseDriftReport('{ nope').ok).toBe(false);
  });

  it('refuses a pair that does not match the schema, with no partial marks', () => {
    const r = parseDriftReport(wrap({ pairs: [pair('a', 'drift'), { node_id: 'b', verdict: 'maybe' }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/pair 2/);
  });

  it('refuses a report with no pairs list and a non-object', () => {
    expect(parseDriftReport(wrap({ mode: 'range' })).ok).toBe(false);
    expect(parseDriftReport('[]').ok).toBe(false);
  });

  it('an empty pairs list is valid and marks nothing', () => {
    expect(parseDriftReport(wrap({ pairs: [] }))).toEqual({ ok: true, pairs: [] });
  });
});
