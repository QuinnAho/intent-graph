// the project state bar (lane 11): one row at the top, always there, never over a node or the panel.
// what the spec declares, check status, drift, open proposals and problems, each a mark and a word.
// every count is a button that selects the next node in that state. a zero is dim, never hidden,
// so the bar does not jump. it reads the live graph from the store, so it follows every update.

import type { Node } from '@xyflow/react';
import { CircleHelp, Clock, Lock, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Children, useMemo, type CSSProperties, type ReactNode } from 'react';

import { getNodeIcon } from '../graph/nodes/nodeIcons.js';
import { CHECK_MARK, DRIFT_MARK } from '../graph/nodes/shared/nodeChrome.js';
import { useGraphStore } from '../store/graph-slice.js';
import { problemsLabel, useProblemsStore } from '../store/problems.js';
import { useUiStore } from '../store/ui-slice.js';
import { BAR, COUNT_BUTTON, GROUP, GROUP_HEAD, GROUP_LABEL } from './bar-styles.js';
import { selectNextIn } from './glance-actions.js';
import { CHECK_STATES, DRIFT_STATES, GROUP_TITLES, SPEC_STATES, countLabel, countTitle, glanceCounts, type GlanceState } from './glance-model.js';
import { GLANCE_TUNING } from './glance-tuning.js';
import { InferredCount } from './InferredCount.js';

const MUTED = 'var(--ig-text-muted, #8b949e)';

function markOf(state: GlanceState): { Icon: LucideIcon; color: string } {
  if (state === 'verified' || state === 'failed' || state === 'pending') return CHECK_MARK[state];
  if (state === 'drift' || state === 'unclear' || state === 'aligned') {
    // the bar sits on the panel colour, so the loud drift mark keeps its red as the icon colour
    const m = DRIFT_MARK[state];
    return { Icon: m.Icon, color: state === 'drift' ? m.border : m.color };
  }
  if (state === 'stale') return { Icon: Clock, color: MUTED };
  return { Icon: getNodeIcon(state === 'inferred' ? 'intent' : state), color: 'currentColor' };
}

const zeroStyle = (n: number): CSSProperties => (n === 0 ? { opacity: GLANCE_TUNING.zeroOpacity, cursor: 'default' } : {});

function Count(props: { state: GlanceState; n: number }): JSX.Element {
  const { state, n } = props;
  const { Icon, color } = markOf(state);
  return (
    <button
      type="button"
      className="ig-bar-count"
      data-bar-count={state}
      data-count={n}
      aria-disabled={n === 0}
      title={countTitle(state, n)}
      style={{ ...COUNT_BUTTON, ...zeroStyle(n) }}
      onClick={n === 0 ? undefined : () => selectNextIn(state)}
    >
      <Icon size={14} color={color} aria-hidden />
      {countLabel(state, n)}
    </button>
  );
}

function Group(props: { label: string; title: string; name: string; children: ReactNode }): JSX.Element {
  const items = Children.toArray(props.children);
  return (
    <div role="group" aria-label={props.title} title={props.title} data-bar-group={props.name} style={GROUP}>
      <span style={GROUP_HEAD}>
        <span className="ig-group-label" style={GROUP_LABEL}>{props.label}</span>
        {items[0]}
      </span>
      {items.slice(1)}
    </div>
  );
}

function ProblemsCount(): JSX.Element {
  const problems = useProblemsStore((s) => s.problems);
  const open = useProblemsStore((s) => s.open);
  const n = problems.length;
  return (
    <button
      type="button"
      className="ig-bar-count"
      data-bar-count="problems"
      data-count={n}
      aria-disabled={n === 0}
      aria-expanded={n > 0 && open}
      title={n === 0 ? 'No spec file problems.' : `${problemsLabel(problems)} in spec files. Click to ${open ? 'close' : 'open'} the list.`}
      style={{ ...COUNT_BUTTON, ...zeroStyle(n) }}
      onClick={n === 0 ? undefined : () => useProblemsStore.getState().setOpen(!open)}
    >
      <TriangleAlert size={14} color="#d29922" aria-hidden />
      {n === 0 ? '0 problems' : problemsLabel(problems)}
    </button>
  );
}

function ReadOnly(): JSX.Element | null {
  const reason = useUiStore((s) => s.editConfig.readOnlyReason);
  if (!reason) return null;
  return (
    <span data-bar-read-only="" title={reason} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: '88px', flex: '0 1 auto', overflow: 'hidden', color: MUTED, marginLeft: '6px' }}>
      <Lock size={13} aria-hidden style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{reason}</span>
    </span>
  );
}

export function LegendButton(): JSX.Element {
  const open = useUiStore((s) => s.legendOpen);
  return (
    <button
      type="button"
      data-legend-button=""
      aria-expanded={open}
      aria-controls="ig-legend"
      aria-label="Legend: what the marks and keys mean"
      title="Legend: what the marks and keys mean"
      className="ig-bar-count"
      style={{ ...COUNT_BUTTON, padding: '0 5px', marginLeft: 'auto', border: '1px solid var(--ig-edge)' }}
      onClick={() => useUiStore.getState().setLegendOpen(!open)}
    >
      <CircleHelp size={15} aria-hidden />
    </button>
  );
}

export function StateBar(): JSX.Element {
  const nodes = useGraphStore((s) => s.nodes);
  const { counts, driftReport } = useMemo(() => glanceCounts(nodes as Node[]), [nodes]);
  return (
    <header style={BAR} data-state-bar="" aria-label="Project state">
      <Group label="Spec" title={GROUP_TITLES.spec} name="spec">
        {SPEC_STATES.map((s) => <Count key={s} state={s} n={counts[s]} />)}
      </Group>
      <Group label="Checks" title={GROUP_TITLES.checks} name="checks">
        {CHECK_STATES.map((s) => <Count key={s} state={s} n={counts[s]} />)}
      </Group>
      {driftReport ? (
        <Group label="Drift" title={GROUP_TITLES.drift} name="drift">
          {DRIFT_STATES.map((s) => <Count key={s} state={s} n={counts[s]} />)}
        </Group>
      ) : (
        <Group label="Drift" title={GROUP_TITLES.noDrift} name="drift">
          <span data-bar-no-drift="" style={{ color: MUTED, padding: '0 6px' }}>no drift report</span>
        </Group>
      )}
      <InferredCount />
      <ProblemsCount />
      <ReadOnly />
      <LegendButton />
    </header>
  );
}
