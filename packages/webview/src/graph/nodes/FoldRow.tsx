// the dashed row at the foot of a concept that holds folded proposals (lane 12), and the box at the
// root for proposals with no concept. a click, Enter or Space opens or closes the fold. the row is
// part of its concept node, not a node of its own, so no wire can end on it.

import type { NodeProps } from '@xyflow/react';
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';

import { toggleFold } from '../../app/fold-actions.js';
import { FOLD_BOX_ID, foldOf, foldRowLabel, foldRowTitle, type FoldInfo } from '../fold-model.js';
import { FOLD_TUNING, VIEW_TUNING } from '../view-tuning.js';
import { RobotIcon } from './shared/nodeChrome.js';

const ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  width: '100%',
  height: `${FOLD_TUNING.rowPx}px`,
  padding: '0 10px',
  boxSizing: 'border-box',
  borderRadius: '6px',
  border: '1px dashed rgba(167, 139, 250, 0.85)',
  background: 'rgba(167, 139, 250, 0.08)',
  color: 'var(--ig-text)',
  font: 'inherit',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

export function FoldButton(props: { fold: FoldInfo }): JSX.Element {
  const { fold } = props;
  const root = fold.key === FOLD_BOX_ID;
  const label = foldRowLabel(fold.count, fold.open, root);
  const title = foldRowTitle(fold.count, fold.open);
  // the node around the row must not take the click or the key as its own selection
  const onClick = (e: MouseEvent): void => {
    e.stopPropagation();
    void toggleFold(fold.key);
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  };
  return (
    <button
      type="button"
      className="ig-fold-row nodrag nopan"
      data-fold-row={fold.key}
      data-fold-count={fold.count}
      data-fold-open={fold.open ? 'true' : 'false'}
      aria-expanded={fold.open}
      aria-label={label}
      title={title}
      style={ROW}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <RobotIcon size={14} title={title} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </button>
  );
}

/** the row as the concept draws it, held at the concept's foot */
export function ConceptFoldRow(props: { fold: FoldInfo | null }): JSX.Element | null {
  if (!props.fold || props.fold.count === 0) return null;
  const inset = VIEW_TUNING.groupPad / 2;
  return (
    <div style={{ position: 'absolute', left: `${inset}px`, right: `${inset}px`, bottom: `${FOLD_TUNING.rowGapPx}px` }}>
      <FoldButton fold={props.fold} />
    </div>
  );
}

/** the box at the root for proposals with no concept yet */
export function InferredFoldNode(props: NodeProps): JSX.Element | null {
  const fold = foldOf(props);
  if (!fold) return null;
  return (
    <div data-fold-box="" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '6px', boxSizing: 'border-box', borderRadius: '8px', border: '1px dashed rgba(167, 139, 250, 0.6)', background: 'var(--ig-canvas)' }}>
      <FoldButton fold={fold} />
    </div>
  );
}
