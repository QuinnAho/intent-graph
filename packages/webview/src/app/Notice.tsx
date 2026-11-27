// the short line after a change, with Undo, or after a refused drop, with the reason.
// it sits at the bottom of the canvas, says itself to screen readers, and goes away on its own.

import { useEffect, type CSSProperties } from 'react';

import { WIRE_EDIT_TUNING } from '../graph/view-tuning.js';
import { useUiStore } from '../store/ui-slice.js';
import { undoLast } from './wire-edit-actions.js';

const BOX: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: '20px',
  transform: 'translateX(-50%)',
  zIndex: 40,
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  maxWidth: 'min(640px, calc(100% - 32px))',
  boxSizing: 'border-box',
  padding: '10px 10px 10px 16px',
  borderRadius: '10px',
  background: 'var(--ig-node)',
  color: 'var(--ig-text)',
  fontSize: '13px',
  lineHeight: 1.4,
  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.45)',
};

const BUTTON: CSSProperties = {
  flex: '0 0 auto',
  height: '30px',
  padding: '0 14px',
  borderRadius: '6px',
  border: '1px solid rgba(120, 169, 255, 0.8)',
  background: 'rgba(120, 169, 255, 0.16)',
  color: 'inherit',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
};

export function Notice(): JSX.Element | null {
  const notice = useUiStore((s) => s.notice);
  const clear = useUiStore((s) => s.clearNotice);
  useEffect(() => {
    if (!notice) return undefined;
    const t = window.setTimeout(clear, notice.undo ? WIRE_EDIT_TUNING.noticeMs : WIRE_EDIT_TUNING.refusedNoticeMs);
    return () => window.clearTimeout(t);
  }, [notice, clear]);
  if (!notice) return null;
  const refused = notice.tone === 'refused';
  return (
    <div
      role="status"
      aria-live="polite"
      data-notice={notice.tone}
      style={{ ...BOX, border: `1px solid ${refused ? 'rgba(255, 166, 87, 0.75)' : 'rgba(120, 169, 255, 0.55)'}` }}
    >
      <span>{notice.text}</span>
      {notice.undo ? (
        <button type="button" className="ig-notice-undo" data-notice-undo="" style={BUTTON} onClick={() => void undoLast()} title="Undo (Ctrl+Z)">
          Undo
        </button>
      ) : null}
    </div>
  );
}
