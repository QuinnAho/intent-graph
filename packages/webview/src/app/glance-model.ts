// rules for the project state bar (lane 11): which states a node is in, the bar's numbers,
// which node a click on a count goes to next, and the words every count and mark carries.
// pure, so each state can be tested. the glue is glance-actions.ts, the view StateBar.tsx.

import type { Node } from '@xyflow/react';

import { inferredOf, openInferred } from './inferred-model.js';

export const SPEC_STATES = ['concept', 'intent', 'constraint', 'decision'] as const;
export const CHECK_STATES = ['verified', 'failed', 'pending'] as const;
export const DRIFT_STATES = ['drift', 'unclear', 'aligned', 'stale'] as const;
export type SpecState = (typeof SPEC_STATES)[number];
export type CheckState = (typeof CHECK_STATES)[number];
export type DriftState = (typeof DRIFT_STATES)[number];
export type GlanceState = SpecState | CheckState | DriftState | 'inferred';
export const GLANCE_STATES: ReadonlyArray<GlanceState> = [...SPEC_STATES, ...CHECK_STATES, ...DRIFT_STATES, 'inferred'];

export interface GlanceCounts {
  readonly counts: Readonly<Record<GlanceState, number>>;
  /** at least one node carries a drift verdict */
  readonly driftReport: boolean;
}

const SPEC_SET: ReadonlySet<string> = new Set(SPEC_STATES);
const CHECK_SET: ReadonlySet<string> = new Set(CHECK_STATES);
const VERDICTS: ReadonlySet<string> = new Set(['drift', 'unclear', 'aligned']);

interface GlanceData {
  readonly checkStatus?: unknown;
  readonly drift?: { readonly verdict?: unknown; readonly stale?: unknown } | null;
}

/** every state a node counts under. a proposal counts only as inferred: no person declared it. */
export function statesOf(node: Pick<Node, 'type' | 'data'>): GlanceState[] {
  if (inferredOf(node) !== null) return ['inferred'];
  const out: GlanceState[] = [];
  if (node.type !== undefined && SPEC_SET.has(node.type)) out.push(node.type as SpecState);
  const d = (node.data ?? {}) as GlanceData;
  if (typeof d.checkStatus === 'string' && CHECK_SET.has(d.checkStatus)) out.push(d.checkStatus as CheckState);
  const verdict = d.drift?.verdict;
  if (d.drift && typeof verdict === 'string' && VERDICTS.has(verdict)) {
    // a stale verdict is older than the code, so it is counted as stale, not as what it said
    out.push(d.drift.stale === true ? 'stale' : (verdict as DriftState));
  }
  return out;
}

export function glanceCounts(nodes: ReadonlyArray<Node>): GlanceCounts {
  const counts = Object.fromEntries(GLANCE_STATES.map((s) => [s, 0])) as Record<GlanceState, number>;
  let driftReport = false;
  for (const n of nodes) {
    for (const s of statesOf(n)) counts[s] += 1;
    if ((n.data as GlanceData | undefined)?.drift) driftReport = true;
  }
  return { counts, driftReport };
}

const labelOf = (n: Node): string => String((n.data as { label?: unknown } | undefined)?.label ?? '');

/** the nodes in a state in reading order: by title, then id. proposals keep the order the inferred count used. */
export function nodesInState(nodes: ReadonlyArray<Node>, state: GlanceState): Node[] {
  if (state === 'inferred') return openInferred(nodes);
  return nodes
    .filter((n) => statesOf(n).includes(state))
    .sort((a, b) => {
      const ta = labelOf(a);
      const tb = labelOf(b);
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/** the one a click on a count selects: after the selected one, wrapping, or the first. null when none is in that state. */
export function nextInState(nodes: ReadonlyArray<Node>, state: GlanceState, selectedId: string | null): string | null {
  const list = nodesInState(nodes, state);
  if (list.length === 0) return null;
  const at = selectedId === null ? -1 : list.findIndex((n) => n.id === selectedId);
  return list[(at + 1) % list.length]!.id;
}

// [singular, plural] after the number, and what the count holds, for its title
const WORDS: Record<GlanceState, { one: string; many: string; what: string }> = {
  concept: { one: 'concept', many: 'concepts', what: 'concepts declared in the spec' },
  intent: { one: 'intent', many: 'intents', what: 'intents declared in the spec' },
  constraint: { one: 'constraint', many: 'constraints', what: 'constraints declared in the spec' },
  decision: { one: 'decision', many: 'decisions', what: 'decisions declared in the spec' },
  verified: { one: 'verified', many: 'verified', what: 'nodes whose tests in verified_by pass' },
  failed: { one: 'failing', many: 'failing', what: 'nodes with a failing test in verified_by' },
  pending: { one: 'pending', many: 'pending', what: 'nodes with no test result yet' },
  drift: { one: 'drift', many: 'drift', what: 'nodes whose code drifted from what the spec says' },
  unclear: { one: 'unclear', many: 'unclear', what: 'nodes the drift check could not decide' },
  aligned: { one: 'aligned', many: 'aligned', what: 'nodes whose code matches the spec' },
  stale: { one: 'stale', many: 'stale', what: 'drift verdicts older than a change to their code' },
  inferred: { one: 'inferred', many: 'inferred', what: 'proposals a model read from the code and no person confirmed' },
};

export const countLabel = (state: GlanceState, n: number): string => `${n} ${n === 1 ? WORDS[state].one : WORDS[state].many}`;

export function countTitle(state: GlanceState, n: number): string {
  if (n === 0) return `No ${WORDS[state].what}.`;
  return `${n} ${WORDS[state].what}. Click to select the next one.`;
}

export const GROUP_TITLES = {
  spec: 'What the spec declares',
  checks: 'Check status from the tests in verified_by',
  drift: 'Drift: does the code still do what the spec says',
  noDrift: 'No drift report. Run the drift check to see whether the code still matches the spec.',
} as const;

/** the robot's words, on everything a model said and no person confirmed */
export const ROBOT_TITLE = 'Read from the code by a model, not confirmed by a person';
export const ROBOT_DRIFT_TITLE = 'Verdict decided by a model reading the diff, not confirmed by a person';

/** drift verdicts the judge model gave. hash, missing, budget and error verdicts came from no model. */
export const modelDecided = (drift: { readonly decided_by: string }): boolean => drift.decided_by === 'judge';

/** the keys a proposal takes, shown on hover and on keyboard focus before it is selected */
export function inferredKeyHint(write: boolean): string {
  if (!write) return 'Read only: Enter and Delete do nothing here';
  return 'Enter accept, F2 edit title, Delete dismiss';
}
