// the "2 code" line under an intent's header and, when the intent is open, one row per anchor (lane 13).
// both are part of the intent node, not nodes of their own: no border box, no pins, no wire ends here.

import { ChevronDown, ChevronRight, FileCode2 } from 'lucide-react';
import { useContext, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';

import { inEditorPanel, openCodeRef, toggleNest } from '../../app/nest-actions.js';
import { PinContext } from '../edges/wire-context.js';
import { codeRowText, codeRowTitle, nestCountLabel, nestToggleTitle, type CodeRef, type NestInfo } from '../nest-model.js';
import { NEST_TUNING } from '../view-tuning.js';

const TOGGLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  height: `${NEST_TUNING.togglePx}px`,
  padding: '0 8px 0 4px',
  borderRadius: '999px',
  border: '1px solid var(--ig-edge)',
  background: 'transparent',
  color: 'var(--ig-text)',
  font: 'inherit',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  height: `${NEST_TUNING.rowPx}px`,
  padding: '0 14px 0 30px',
  boxSizing: 'border-box',
  border: 'none',
  borderRadius: 0,
  background: 'transparent',
  color: 'var(--ig-text)',
  font: 'inherit',
  fontSize: '12px',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
};

const CUT: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 };
const MONO = 'var(--ig-font-mono, ui-monospace, monospace)';

// the node around a control must not take the click or the key as its own selection
const keep = (e: KeyboardEvent): void => {
  if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
};

function NestToggle(props: { id: string; nest: NestInfo }): JSX.Element {
  const { id, nest } = props;
  // the wires the old pin chip counted, so its meaning stays in this one count
  const wires = useContext(PinContext).get(id)?.in.hidden['code'] ?? 0;
  const title = nestToggleTitle(nest.count, nest.open, wires);
  const onClick = (e: MouseEvent): void => {
    e.stopPropagation();
    void toggleNest(id);
  };
  const Chevron = nest.open ? ChevronDown : ChevronRight;
  return (
    <button type="button" className="ig-nest-toggle nodrag nopan" data-nest-toggle={id} data-nest-count={nest.count} data-nest-open={nest.open ? 'true' : 'false'} aria-expanded={nest.open} aria-label={`${nestCountLabel(nest.count, nest.open)}, ${nest.open ? 'open' : 'closed'}`} title={title} style={TOGGLE} onClick={onClick} onKeyDown={keep}>
      <Chevron size={13} aria-hidden />
      {nestCountLabel(nest.count, nest.open)}
    </button>
  );
}

function CodeRow(props: { refx: CodeRef; index: number; editor: boolean }): JSX.Element {
  const { refx, index, editor } = props;
  const text = codeRowText(refx);
  const title = codeRowTitle(refx, editor);
  const found = refx.target !== null;
  const state = !found ? 'not-found' : refx.symbol_missing ? 'symbol-missing' : 'found';
  const onClick = (e: MouseEvent): void => {
    e.stopPropagation();
    openCodeRef(refx);
  };
  return (
    <button
      type="button"
      className="ig-code-row nodrag nopan"
      data-code-row={index}
      data-code-raw={refx.raw}
      data-code-state={state}
      {...(refx.target !== null ? { 'data-code-target': refx.target } : {})}
      aria-disabled={!found}
      title={title}
      style={{ ...ROW, cursor: found ? 'pointer' : 'default' }}
      onClick={onClick}
      onKeyDown={keep}
    >
      <FileCode2 size={13} aria-hidden style={{ flexShrink: 0, opacity: found ? 0.8 : 0.4 }} />
      {text.name !== null ? (
        <span data-code-name="" style={{ ...CUT, flexShrink: 0, maxWidth: '45%', fontFamily: MONO, fontWeight: 600 }}>
          {text.name}
        </span>
      ) : null}
      <span data-code-path="" style={{ ...CUT, flexShrink: 1, fontFamily: MONO, opacity: 0.72 }}>
        {text.path}
      </span>
      {text.note !== null ? (
        <span data-code-note="" style={{ ...CUT, flexShrink: 0, marginLeft: 'auto', color: '#d29922', fontSize: '11px', fontWeight: 600 }}>
          {text.note}
        </span>
      ) : null}
    </button>
  );
}

/** the count line, and the rows when open. nothing for an intent without code. */
export function CodeRows(props: { id: string; nest: NestInfo | null; code: ReadonlyArray<CodeRef> }): JSX.Element | null {
  const { id, nest, code } = props;
  if (!nest || nest.count === 0) return null;
  const editor = inEditorPanel();
  return (
    <div data-nest={id} style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', height: `${NEST_TUNING.togglePx}px` }}>
        <NestToggle id={id} nest={nest} />
      </div>
      {nest.open ? (
        <div data-code-rows={id} role="list" style={{ display: 'flex', flexDirection: 'column', paddingTop: '2px', paddingBottom: `${NEST_TUNING.padPx}px` }}>
          {code.map((r, i) => (
            <div role="listitem" key={`${i}:${r.raw}`}>
              <CodeRow refx={r} index={i} editor={editor} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
