// the title of a spec node as a text field, drawn over the title so the node keeps its size.
// Enter saves, a click elsewhere saves if the text changed, Esc cancels. a save sends the
// body it fetched when the field opened, with that fetch's hash, so a file that changed
// meanwhile comes back as a conflict and nothing is written.

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import { focusNode } from '../../../app/direct-edit-actions.js';
import { renameOutcome, type RenameEnd } from '../../../app/direct-edit-model.js';
import { acceptProposal } from '../../../app/inferred-actions.js';
import { inferredRenameOutcome, isInferredId } from '../../../app/inferred-model.js';
import { useUiStore } from '../../../store/ui-slice.js';
import { fetchEditableNode, saveNode, type ApiResult, type EditableNode } from '../../../transport/edit-api.js';

// same font and line height as the title, so the text does not move
const FIELD: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  margin: 0,
  padding: 0,
  border: 'none',
  outline: 'none',
  resize: 'none',
  overflow: 'hidden',
  boxSizing: 'border-box',
  font: 'inherit',
  fontSize: '13px',
  fontWeight: 600,
  lineHeight: '18px',
  overflowWrap: 'anywhere',
  color: 'var(--ig-text)',
  background: 'var(--ig-canvas)',
  // a frame drawn outside the box, so it adds no size
  boxShadow: '0 0 0 4px var(--ig-canvas), 0 0 0 5px rgba(120, 169, 255, 0.9)',
  borderRadius: '2px',
};

const ERROR: CSSProperties = {
  position: 'fixed',
  zIndex: 40,
  maxWidth: '320px',
  padding: '6px 10px',
  borderRadius: '8px',
  border: '1px solid rgba(248, 81, 73, 0.65)',
  background: 'var(--ig-node)',
  color: 'var(--ig-text)',
  fontSize: '12px',
  lineHeight: 1.4,
  boxShadow: '0 6px 16px rgba(0, 0, 0, 0.4)',
};

export function RenameField(props: { id: string; label: string }): JSX.Element {
  const { id, label } = props;
  const config = useUiStore((s) => s.editConfig);
  const setRenameId = useUiStore((s) => s.setRenameId);
  const setPendingTitle = useUiStore((s) => s.setPendingTitle);
  const field = useRef<HTMLTextAreaElement>(null);
  const fetched = useRef<Promise<ApiResult<EditableNode>> | null>(null);
  const finished = useRef(false);
  const [text, setText] = useState(label);
  const [error, setError] = useState<{ message: string; x: number; y: number } | null>(null);

  // a layout effect, so the cursor is in the field before the first keystroke can arrive
  useLayoutEffect(() => {
    finished.current = false;
    // a proposal has no file yet, there is nothing to load
    fetched.current = isInferredId(id) ? null : fetchEditableNode(config, id);
    const el = field.current;
    el?.focus({ preventScroll: true });
    el?.select();
    // a node drawn again after a click is hidden for a moment and cannot take focus, so try again
    let tries = 0;
    let frame = 0;
    const retry = (): void => {
      if (!el || document.activeElement === el || tries++ >= 20) return;
      el.focus({ preventScroll: true });
      if (document.activeElement === el) el.select();
      else frame = window.requestAnimationFrame(retry);
    };
    if (el && document.activeElement !== el) frame = window.requestAnimationFrame(retry);
    // an unmount for any other reason (a different node renamed) leaves nothing half done
    return () => {
      finished.current = true;
      window.cancelAnimationFrame(frame);
    };
    // the field opens once per node
  }, []);

  const close = (refocus: boolean): void => {
    finished.current = true;
    setRenameId(null);
    if (refocus) window.setTimeout(() => focusNode(id), 0);
  };

  const fail = (message: string): void => {
    const r = field.current?.getBoundingClientRect();
    setError({ message, x: r?.left ?? 0, y: (r?.bottom ?? 0) + 10 });
  };

  // on a proposal Enter accepts under the typed title, Esc and a click away write nothing
  const finishInferred = async (end: RenameEnd): Promise<void> => {
    const out = inferredRenameOutcome(text, end);
    if (out.kind === 'problem') {
      fail(out.message);
      return;
    }
    if (out.kind === 'cancel') {
      close(end !== 'blur');
      return;
    }
    finished.current = true;
    const r = await acceptProposal(id, out.title);
    if (r && !r.ok) {
      finished.current = false;
      fail(r.message);
      return;
    }
    close(false);
  };

  const finish = async (end: RenameEnd): Promise<void> => {
    if (finished.current) return;
    if (isInferredId(id)) {
      await finishInferred(end);
      return;
    }
    const out = renameOutcome(label, text, end);
    if (out.kind === 'problem') {
      fail(out.message);
      return;
    }
    if (out.kind === 'cancel') {
      close(end !== 'blur');
      return;
    }
    finished.current = true;
    const got = await (fetched.current ?? fetchEditableNode(config, id));
    if (!got.ok) {
      finished.current = false;
      fail(got.message);
      return;
    }
    if (!got.value.writable) {
      finished.current = false;
      fail('This file cannot be written.');
      return;
    }
    const r = await saveNode(config, id, { title: out.title, body: got.value.body, hash: got.value.hash });
    if (!r.ok) {
      finished.current = false;
      fail(r.message);
      return;
    }
    setPendingTitle(id, out.title);
    close(end !== 'blur');
  };

  return (
    <>
      <textarea
        ref={field}
        data-rename-field={id}
        aria-label="Rename"
        className="nodrag nopan nowheel"
        style={FIELD}
        value={text}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onBlur={() => void finish('blur')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            // the key ends here, so the panel's own Esc does not also act
            e.nativeEvent.stopPropagation();
            void finish(e.key === 'Enter' ? 'enter' : 'escape');
          }
        }}
      />
      {error
        ? createPortal(
            <div role="alert" data-rename-error="" style={{ ...ERROR, left: error.x, top: error.y }}>
              {error.message}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
