// the count of open proposals in the strip under the canvas. a click selects the next one,
// so a person can go through them with Enter and Delete alone. hidden when none is open.

import type { Node } from '@xyflow/react';
import { Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';

import { useGraphStore } from '../store/graph-slice.js';
import { selectNextProposal } from './inferred-actions.js';
import { inferredCountLabel, openInferred } from './inferred-model.js';

const BOX: CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 12px',
  borderTop: '1px solid var(--ig-edge)',
  background: 'var(--ig-canvas)',
  zIndex: 20,
  fontSize: '12px',
  color: 'var(--ig-text)',
};

const BUTTON: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '5px 10px',
  borderRadius: '999px',
  border: '1px dashed rgba(167, 139, 250, 0.8)',
  background: 'var(--ig-node)',
  color: 'var(--ig-text)',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
};

export function InferredCount(): JSX.Element | null {
  const count = useGraphStore((s) => openInferred(s.nodes as Node[]).length);
  if (count === 0) return null;
  return (
    <div style={BOX} data-inferred-count={count}>
      <button type="button" style={BUTTON} onClick={selectNextProposal} title="Select the next inferred intent. Enter accepts, Delete dismisses.">
        <Sparkles size={14} aria-hidden />
        {inferredCountLabel(count)}
      </button>
      <span style={{ opacity: 0.7 }}>proposals read from the code, not declared yet</span>
    </div>
  );
}
