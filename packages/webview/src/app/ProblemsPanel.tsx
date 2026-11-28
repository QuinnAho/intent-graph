// the list of spec file problems (lane 12): one place, opened from the bar's count. it sits in its own
// room under the bar, so it covers no node and no canvas control, and it is never wider than the window. each row says what is wrong, in which file, and what to do next.
// a row that belongs to a node selects it and brings it into view. Esc or a second click on the
// count closes it, and the focus goes back to the count.

import type { Node } from '@xyflow/react';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, type CSSProperties } from 'react';

import { useGraphStore } from '../store/graph-slice.js';
import { problemHint, problemNodeId, useProblemsStore, type GraphProblem } from '../store/problems.js';
import { useUiStore } from '../store/ui-slice.js';
import { focusNode } from './direct-edit-actions.js';
import { selectOnly } from './edit-model.js';

const ROOM: CSSProperties = { flex: '0 0 auto', padding: '4px 8px', borderBottom: '1px solid var(--ig-edge)', background: 'var(--ig-canvas)', minWidth: 0 };

const LIST: CSSProperties = {
  boxSizing: 'border-box',
  maxWidth: '100%',
  maxHeight: '30vh',
  overflowY: 'auto',
  margin: 0,
  padding: '6px 10px',
  listStyle: 'none',
  borderRadius: '8px',
  border: '1px solid var(--ig-edge)',
  background: 'var(--ig-node)',
  color: 'var(--ig-text)',
  fontFamily: 'var(--ig-font-mono, monospace)',
  fontSize: '12px',
};

const ROW_BUTTON: CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '4px 2px',
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};

const countButton = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-bar-count="problems"]');

function close(): void {
  useProblemsStore.getState().setOpen(false);
  countButton()?.focus();
}

function goTo(id: string): void {
  const g = useGraphStore.getState();
  const next = selectOnly(g.nodes as Node[], id);
  if (next) g.setGraph(next, g.edges);
  useUiStore.getState().closeMenu();
  close();
  window.setTimeout(() => focusNode(id), 0);
}

function Row(props: { p: GraphProblem; nodeId: string | null }): JSX.Element {
  const { p, nodeId } = props;
  const hint = problemHint(p.message);
  const body = (
    <>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <TriangleAlert size={13} color={p.severity === 'error' ? '#f85149' : '#d29922'} aria-hidden />
        <strong>{p.severity}</strong>
        <span data-problem-path="" style={{ textDecoration: 'underline', overflowWrap: 'anywhere' }}>{p.file}</span>
      </span>
      <div data-problem-message="" style={{ opacity: 0.9, marginTop: '2px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.message}</div>
      {hint ? <div data-problem-hint="" style={{ marginTop: '2px', color: 'var(--ig-text-muted, #8b949e)', overflowWrap: 'anywhere' }}>{hint}</div> : null}
    </>
  );
  return (
    <li data-problem-file={p.file} {...(nodeId ? { 'data-problem-node': nodeId } : {})} style={{ padding: '4px 0', borderBottom: '1px solid var(--ig-edge)' }}>
      {nodeId ? (
        <button type="button" className="ig-problem-row" style={ROW_BUTTON} title="Select its node and bring it into view" onClick={() => goTo(nodeId)}>
          {body}
        </button>
      ) : (
        body
      )}
    </li>
  );
}

export function ProblemsPanel(): JSX.Element | null {
  const problems = useProblemsStore((s) => s.problems);
  const open = useProblemsStore((s) => s.open);
  const nodes = useGraphStore((s) => s.nodes);
  const ids = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const shown = open && problems.length > 0;
  useEffect(() => {
    if (!shown) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown]);
  if (!shown) return null;
  return (
    <div style={ROOM} data-problems-room="">
      <ul style={LIST} aria-label="spec problems" data-problems-list="">
        {problems.map((p) => (
          <Row key={`${p.severity}|${p.file}|${p.message}`} p={p} nodeId={problemNodeId(p, ids)} />
        ))}
      </ul>
    </div>
  );
}
