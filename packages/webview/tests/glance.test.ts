// the project state bar: its numbers, which node a click on a count goes to, and the words it uses.
import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  GLANCE_STATES,
  countLabel,
  countTitle,
  glanceCounts,
  inferredKeyHint,
  legendKinds,
  modelDecided,
  nextInState,
  nodesInState,
  statesOf,
} from '../src/app/glance-model.js';

const node = (id: string, type: string, data: Record<string, unknown> = {}, selected = false): Node => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: { label: id, kind: type, ...data },
  selected,
});
const drift = (verdict: string, stale = false, decided_by = 'judge'): Record<string, unknown> => ({
  drift: { verdict, evidence: '', suggested_action: '', commit: 'c', decided_by, reported_at: '', entries: 1, stale },
});
const inferred = (folder: string): Record<string, unknown> => ({
  inferred: { proposal_id: folder, folder, anchors: [], confidence: 'inferred', planned: false, restates: null, restates_title: null, belongs_under: null, code_hash: 'h' },
});

const graph: Node[] = [
  node('c1', 'concept', { checkStatus: 'pending' }),
  node('i-b', 'intent', { checkStatus: 'verified', ...drift('aligned') }),
  node('i-a', 'intent', { checkStatus: 'failed', ...drift('drift') }),
  node('i-c', 'intent', { checkStatus: 'verified', ...drift('unclear', true) }),
  node('k1', 'constraint', { checkStatus: 'pending', ...drift('unclear') }),
  node('d1', 'decision'),
  node('r1', 'rationale', { checkStatus: 'pending' }),
  node('m1', 'code_module'),
  node('s1', 'code_symbol'),
  // a proposal is an intent on the graph, but no person declared it
  node('inferred:p2', 'intent', { checkStatus: 'pending', ...inferred('src/b') }),
  node('inferred:p1', 'intent', { ...inferred('src/a') }),
];

describe('glanceCounts', () => {
  it('counts the declared spec by kind and leaves proposals and code out', () => {
    const c = glanceCounts(graph).counts;
    expect([c.concept, c.intent, c.constraint, c.decision]).toEqual([1, 3, 1, 1]);
  });

  it('counts checks on declared nodes only', () => {
    const c = glanceCounts(graph).counts;
    expect([c.verified, c.failed, c.pending]).toEqual([2, 1, 3]);
  });

  it('counts a stale verdict as stale and not under its verdict', () => {
    const c = glanceCounts(graph).counts;
    expect([c.drift, c.unclear, c.aligned, c.stale]).toEqual([1, 1, 1, 1]);
  });

  it('counts open proposals', () => {
    expect(glanceCounts(graph).counts.inferred).toBe(2);
  });

  it('says whether a drift report reached the graph', () => {
    expect(glanceCounts(graph).driftReport).toBe(true);
    expect(glanceCounts(graph.map((n) => ({ ...n, data: { ...n.data, drift: undefined } }))).driftReport).toBe(false);
  });

  it('gives every state a number, zero included, so the bar never jumps', () => {
    const c = glanceCounts([]).counts;
    expect(GLANCE_STATES.every((s) => c[s] === 0)).toBe(true);
    expect(glanceCounts([]).driftReport).toBe(false);
  });

  it('agrees with statesOf for every node', () => {
    const c = glanceCounts(graph).counts;
    for (const s of GLANCE_STATES) expect(graph.filter((n) => statesOf(n).includes(s)).length).toBe(c[s]);
  });
});

describe('nextInState', () => {
  it('goes to the first one in reading order when none of that state is selected', () => {
    expect(nextInState(graph, 'intent', null)).toBe('i-a');
    expect(nextInState(graph, 'verified', 'c1')).toBe('i-b');
  });

  it('goes to the one after on a second click, and wraps', () => {
    expect(nextInState(graph, 'intent', 'i-a')).toBe('i-b');
    expect(nextInState(graph, 'intent', 'i-b')).toBe('i-c');
    expect(nextInState(graph, 'intent', 'i-c')).toBe('i-a');
  });

  it('walks proposals in the same order as the inferred count always did', () => {
    expect(nextInState(graph, 'inferred', null)).toBe('inferred:p1');
    expect(nextInState(graph, 'inferred', 'inferred:p1')).toBe('inferred:p2');
  });

  it('is null when no node is in that state', () => {
    expect(nextInState(graph, 'decision', 'd1')).toBe('d1');
    expect(nextInState([], 'failed', null)).toBeNull();
  });

  it('only ever lands on a node in that state', () => {
    for (const s of GLANCE_STATES) {
      const ids = new Set(nodesInState(graph, s).map((n) => n.id));
      let at: string | null = null;
      for (let i = 0; i < 4; i++) {
        at = nextInState(graph, s, at);
        if (ids.size === 0) expect(at).toBeNull();
        else expect(ids.has(at ?? '')).toBe(true);
      }
    }
  });
});

describe('words', () => {
  it('puts a word on every count, singular and plural', () => {
    expect(countLabel('concept', 1)).toBe('1 concept');
    expect(countLabel('intent', 3)).toBe('3 intents');
    expect(countLabel('failed', 2)).toBe('2 failing');
    expect(countLabel('stale', 0)).toBe('0 stale');
    // the inferred count keeps the words the strip always had
    expect(countLabel('inferred', 3)).toBe('3 inferred');
  });

  it('titles a zero count with what it would hold, and a count with what a click does', () => {
    expect(countTitle('failed', 0)).toMatch(/^No /);
    expect(countTitle('failed', 2)).toMatch(/select the next one/);
    for (const s of GLANCE_STATES) expect(countTitle(s, 1).length).toBeGreaterThan(10);
  });

  it('marks a drift verdict with the robot only when a model decided it', () => {
    expect(modelDecided({ decided_by: 'judge' })).toBe(true);
    expect(modelDecided({ decided_by: 'hash' })).toBe(false);
    expect(modelDecided({ decided_by: 'missing' })).toBe(false);
  });

  it('names the keys of a proposal, and says when they are off', () => {
    expect(inferredKeyHint(true)).toMatch(/Enter/);
    expect(inferredKeyHint(true)).toMatch(/Delete/);
    expect(inferredKeyHint(false)).toMatch(/read only/i);
  });
});

describe('legendKinds', () => {
  const all = ['concept', 'intent', 'constraint', 'decision', 'rationale', 'counterexample', 'task', 'code_module', 'code_symbol'];

  it('always lists the kinds the bar counts, even on an empty graph', () => {
    expect(legendKinds(all, [])).toEqual(['concept', 'intent', 'constraint', 'decision']);
  });

  it('adds a kind only when the graph holds a node of it, in the legend order', () => {
    expect(legendKinds(all, graph)).toEqual(['concept', 'intent', 'constraint', 'decision', 'rationale', 'code_module', 'code_symbol']);
    expect(legendKinds(all, [node('t1', 'task')])).toEqual(['concept', 'intent', 'constraint', 'decision', 'task']);
  });

  it('leaves out kinds that no node holds', () => {
    const k = legendKinds(all, graph);
    expect(k).not.toContain('counterexample');
    expect(k).not.toContain('task');
  });
});
