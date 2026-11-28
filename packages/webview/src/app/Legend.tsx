// the legend (lane 11): what each node kind, mark, pin and key means. it draws the real marks
// and icons from the node chrome, so it cannot drift from what the canvas shows. it takes its
// layer at the right, under the bar, so the canvas never changes size and nothing refits. it opens
// by itself on the first visit in a wide window. only its X, Esc and the "?" close it, and focus
// goes back to the "?" in the bar.

import { ChevronRight, X } from 'lucide-react';
import type { Node } from '@xyflow/react';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { getNodeIcon, type NodeKind } from '../graph/nodes/nodeIcons.js';
import { DriftMark, EMPTY_SIDE, InferredPill, PinCount, RobotIcon, StatusMark, WarningMark, pinStyle, type DriftInfo } from '../graph/nodes/shared/nodeChrome.js';
import { useUiStore } from '../store/ui-slice.js';
import { useGraphStore } from '../store/graph-slice.js';
import { ROBOT_DRIFT_TITLE, ROBOT_TITLE, legendKinds } from './glance-model.js';
import { GLANCE_TUNING } from './glance-tuning.js';

const KINDS: ReadonlyArray<{ kind: NodeKind; name: string; line: string }> = [
  { kind: 'concept', name: 'Concept', line: 'A part of the project. Holds its intents.' },
  { kind: 'intent', name: 'Intent', line: 'What the code should do, checked by tests.' },
  { kind: 'constraint', name: 'Constraint', line: 'A rule the code must keep.' },
  { kind: 'decision', name: 'Decision', line: 'A choice that was made, and why.' },
  { kind: 'rationale', name: 'Rationale', line: 'The reason behind an intent.' },
  { kind: 'counterexample', name: 'Counterexample', line: 'A case the code must not allow.' },
  { kind: 'task', name: 'Task', line: 'Work still to do.' },
  { kind: 'code_module', name: 'Code file', line: 'A source file the spec points at.' },
  { kind: 'code_symbol', name: 'Code symbol', line: 'A function or class in a file.' },
];

const KEYS: ReadonlyArray<{ keys: string; what: string }> = [
  { keys: 'Enter', what: 'Open the details of the selected node. On a proposal: accept it.' },
  { keys: 'F2 or double-click', what: 'Rename the selected node. On a proposal: edit the title, then accept.' },
  { keys: 'Delete', what: 'Remove the picked wire. On a proposal: dismiss it.' },
  { keys: 'Ctrl+Z', what: 'Undo the last change.' },
  { keys: 'Right-click', what: 'The menu for a node, a wire or the canvas.' },
  { keys: 'Drag from a pin', what: 'Drag from the right pin onto another node to hang this one under it.' },
  { keys: 'Esc', what: 'Close the menu, the panel or this legend.' },
  { keys: 'F', what: 'Fit the whole graph to the window. F again goes back to the start, where the text can be read. A resize fits again until you pan or zoom.' },
  { keys: 'O', what: 'Show or hide the code of the selected intent.' },
];

const sample = (verdict: DriftInfo['verdict'], over: Partial<DriftInfo> = {}): DriftInfo => ({
  verdict, evidence: '', suggested_action: '', commit: '', decided_by: 'hash', reported_at: '', entries: 1, stale: false, ...over,
});

const ASIDE: CSSProperties = {
  // a layer over the canvas, right side, under the bar. never taller than its row, so it scrolls inside itself
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  zIndex: 20,
  width: `min(${GLANCE_TUNING.legendWidth}px, 100%)`,
  maxWidth: '100%',
  minHeight: 0,
  boxSizing: 'border-box',
  overflowY: 'auto',
  padding: '12px 14px 16px',
  borderLeft: '1px solid var(--ig-edge)',
  background: 'var(--ig-node)',
  color: 'var(--ig-text)',
  fontSize: '12px',
  lineHeight: 1.45,
  outline: 'none',
};
const H2: CSSProperties = { fontSize: '13px', fontWeight: 700, margin: 0 };
const H3: CSSProperties = { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.7, margin: '14px 0 6px' };
const ROW: CSSProperties = { display: 'grid', gridTemplateColumns: '112px 1fr', alignItems: 'center', gap: '8px', padding: '3px 0' };
// narrow: the words go under the label, so nothing breaks to one word a line
const ROW_NARROW: CSSProperties = { ...ROW, gridTemplateColumns: 'minmax(0, 1fr)', gap: '2px', padding: '5px 0' };
const NarrowContext = createContext(false);

const isNarrow = (): boolean => window.innerWidth < GLANCE_TUNING.narrowPx;

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(isNarrow);
  useEffect(() => {
    const on = (): void => setNarrow(isNarrow());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return narrow;
}
const MUTED: CSSProperties = { opacity: 0.8 };
const KBD: CSSProperties = { fontFamily: 'var(--ig-font-mono, monospace)', fontSize: '11px', padding: '1px 5px', border: '1px solid var(--ig-edge)', borderRadius: '4px', whiteSpace: 'nowrap' };
const BOX: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 600 };

function Row(props: { mark: ReactNode; children: ReactNode }): JSX.Element {
  const narrow = useContext(NarrowContext);
  return (
    <div style={narrow ? ROW_NARROW : ROW}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, flexWrap: 'wrap' }}>{props.mark}</div>
      <div style={{ ...MUTED, minWidth: 0, overflowWrap: 'break-word' }}>{props.children}</div>
    </div>
  );
}

const legendButton = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-legend-button]');

/** close, and hand the focus back to the "?" when it was in the legend or nowhere */
export function closeLegend(): void {
  const active = document.activeElement;
  const inside = active === null || active === document.body || active.closest('[data-legend]') !== null;
  useUiStore.getState().setLegendOpen(false);
  if (inside) window.setTimeout(() => legendButton()?.focus(), 0);
}

// opens by itself once. storage can be missing or throw, then it opens every time, which is safe.
export function useLegendFirstVisit(): void {
  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(GLANCE_TUNING.legendSeenKey) !== null;
      if (!seen) window.localStorage.setItem(GLANCE_TUNING.legendSeenKey, '1');
    } catch {
      seen = false;
    }
    // a narrow window starts with the graph. the flag stays unset so a wide window still opens it once.
    if (!seen && isNarrow()) {
      try {
        window.localStorage.removeItem(GLANCE_TUNING.legendSeenKey);
      } catch {
        // storage missing, nothing to undo
      }
      return;
    }
    if (!seen) useUiStore.getState().setLegendOpen(true);
  }, []);
}

export function Legend(): JSX.Element | null {
  const open = useUiStore((s) => s.legendOpen);
  const ref = useRef<HTMLElement>(null);
  const narrow = useNarrow();
  const nodes = useGraphStore((s) => s.nodes);
  const kinds = useMemo(() => new Set(legendKinds(KINDS.map((k) => k.kind), nodes as Node[])), [nodes]);
  useEffect(() => {
    if (!open) return undefined;
    // opened from the "?": the focus moves in, so the keyboard can read it
    if (document.activeElement === legendButton()) ref.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const inside = document.activeElement?.closest('[data-legend], [data-legend-button]') != null;
      // inside the legend Esc is the legend's alone. elsewhere it also reaches the panel or the menu.
      if (inside) {
        e.preventDefault();
        e.stopPropagation();
      }
      closeLegend();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  if (!open) return null;
  return (
    <NarrowContext.Provider value={narrow}>
    <aside ref={ref} id="ig-legend" data-legend="" aria-label="Legend" tabIndex={-1} style={narrow ? { ...ASIDE, width: '100%', borderLeft: 'none' } : ASIDE} className="nowheel">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <h2 style={H2}>How to read the graph</h2>
        <button type="button" aria-label="Close legend" title="Close (Esc)" onClick={closeLegend} style={{ marginLeft: 'auto', display: 'inline-flex', padding: '3px', border: '1px solid transparent', borderRadius: '6px', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
          <X size={15} />
        </button>
      </div>
      <p style={{ ...MUTED, margin: '6px 0 0' }}>The bar at the top counts each state. Click a count to go to the next node in that state.</p>

      <h3 style={H3}>Nodes</h3>
      {KINDS.filter((k) => kinds.has(k.kind)).map(({ kind, name, line }) => {
        const Icon = getNodeIcon(kind);
        return (
          <Row key={kind} mark={<><Icon size={15} aria-hidden /><strong style={{ fontWeight: 600 }}>{name}</strong></>}>
            {line}
          </Row>
        );
      })}

      <h3 style={H3}>Declared or inferred</h3>
      <Row mark={<span style={{ ...BOX, border: '1px solid var(--ig-edge)' }}>declared</span>}>Solid: a file in spec/ that a person wrote or accepted.</Row>
      <Row mark={<span style={{ ...BOX, border: '1.5px dashed rgba(167, 139, 250, 0.8)' }}><InferredPill /></span>}>Dashed with the robot: a model read it from the code, no person confirmed it yet.</Row>
      <Row mark={<RobotIcon size={15} />}>{ROBOT_TITLE}.</Row>
      <Row mark={<span data-legend-fold='' style={{ ...BOX, border: '1px dashed rgba(167, 139, 250, 0.85)' }}><RobotIcon size={13} />9 inferred</span>}>Folded proposals at the foot of a concept. Click, Enter or Space shows them.</Row>
      <Row mark={<span data-legend-code='' style={{ ...BOX, padding: '2px 8px 2px 4px', borderRadius: '999px', border: '1px solid var(--ig-edge)' }}><ChevronRight size={13} aria-hidden />2 code</span>}>The code an intent is bound to. Click it or press O to list it, click a row to go to the code.</Row>

      <h3 style={H3}>Checks</h3>
      <Row mark={<StatusMark status="verified" />}>The tests in verified_by pass.</Row>
      <Row mark={<StatusMark status="failed" />}>A test in verified_by fails.</Row>
      <Row mark={<StatusMark status="pending" />}>No test result yet.</Row>

      <h3 style={H3}>Drift</h3>
      <Row mark={<DriftMark drift={sample('aligned')} />}>The code still does what the spec says.</Row>
      <Row mark={<DriftMark drift={sample('unclear')} />}>The drift check could not decide.</Row>
      <Row mark={<DriftMark drift={sample('drift')} />}>The code no longer does what the spec says.</Row>
      <Row mark={<DriftMark drift={sample('aligned', { stale: true })} />}>Faint and dashed: the code changed after the report. Run the check again.</Row>
      <Row mark={<DriftMark drift={sample('drift', { decided_by: 'judge' })} />}>{ROBOT_DRIFT_TITLE}.</Row>

      <h3 style={H3}>Warnings and pins</h3>
      <Row mark={<WarningMark warnings={['an anchor points at code that is not there']} />}>Anchor warnings. Hover for the text.</Row>
      <Row mark={<span style={{ ...pinStyle({ drawn: 1, hidden: {}, kinds: [] }), position: 'static', display: 'inline-block' }} />}>A filled pin has wires. Left pin in, right pin out.</Row>
      <Row mark={<span style={{ ...pinStyle(EMPTY_SIDE), position: 'static', display: 'inline-block' }} />}>A ring: nothing is wired to it.</Row>
      <Row mark={<span style={{ position: 'relative', display: 'inline-block', width: '64px', height: '18px' }}><span style={{ position: 'absolute', left: 0, top: '18px', width: '64px' }}><PinCount side="in" label="3 code" /></span></span>}>Wires to the other block are counted on the pin, not drawn.</Row>

      <h3 style={H3}>The view</h3>
      <Row mark={<span data-legend-minimap="" style={{ ...BOX, border: '1px solid var(--ig-edge)' }}>minimap</span>}>Bottom right: the whole graph, each box in its kind's colour. Click or drag it to move the view.</Row>
      <Row mark={<span style={{ ...BOX, borderRadius: '999px', border: '1px solid var(--ig-edge)' }}>Part of the graph</span>}>The view holds part of the graph, so the text can be read. Press F to see all of it.</Row>

      <h3 style={H3}>Keys</h3>
      {KEYS.map(({ keys, what }) => (
        <Row key={keys} mark={<kbd style={KBD}>{keys}</kbd>}>{what}</Row>
      ))}
    </aside>
    </NarrowContext.Provider>
  );
}
