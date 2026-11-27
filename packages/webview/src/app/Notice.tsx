// the short line after a change, with Undo, or after a refused drop, with the reason.
// it sits in a strip under the canvas, so it never covers a node. one at a time, a new one
// replaces the old. it says itself to screen readers and goes away after a few seconds or
// on the next click or key outside it.

import { useEffect, type CSSProperties } from 'react';

import { WIRE_EDIT_TUNING } from '../graph/view-tuning.js';
import { useUiStore } from '../store/ui-slice.js';
import { undoLast } from './wire-edit-actions.js';

const STRIP: CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  justifyContent: 'center',
  padding: '6px 12px',
  borderTop: '1px solid var(--ig-edge)',
  background: 'var(--ig-canvas)',
  zIndex: 20,
};

const BOX: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  maxWidth: 'min(640px, 100%)',
  boxSizing: 'border-box',
  padding: '6px 6px 6px 14px',
  borderRadius: '10px',
  background: 'var(--ig-node)',
  color: 'var(--ig-text)',
  fontSize: '13px',
  lineHeight: 1.4,
};

const BUTTON: CSSProperties = {
  flex: '0 0 auto',
  height: '28px',
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
    // the next action ends it, unless the action is on the notice itself (its Undo button)
    const onAction = (e: Event): void => {
      if (e.target instanceof Element && e.target.closest('[data-notice]')) return;
      if (e instanceof KeyboardEvent && ['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return;
      clear();
    };
    window.addEventListener('pointerdown', onAction, true);
    window.addEventListener('keydown', onAction, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointerdown', onAction, true);
      window.removeEventListener('keydown', onAction, true);
    };
  }, [notice, clear]);
  if (!notice) return null;
  const refused = notice.tone === 'refused';
  return (
    <div style={STRIP} data-notice-strip="">
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
    </div>
  );
}
