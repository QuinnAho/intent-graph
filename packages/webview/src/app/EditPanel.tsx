// side panel for the selected spec node: title and body editable, check status,
// anchors and warnings read only. Ctrl+S saves, Esc cancels. a save carries the hash
// the panel loaded, so an edit made on disk meanwhile comes back as a conflict.
// also holds the short form a concept's add button opens.

import type { Node } from '@xyflow/react';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';

import { getNodeIcon, type NodeKind } from '../graph/nodes/nodeIcons.js';
import { DriftMark, StatusMark, type CheckStatus, type DriftInfo } from '../graph/nodes/shared/nodeChrome.js';
import { useGraphStore } from '../store/graph-slice.js';
import { useUiStore } from '../store/ui-slice.js';
import { createIntent, fetchEditableNode, saveNode, type EditableNode } from '../transport/edit-api.js';
import { isDirty, isSaveKey, kindsProblem, pickEditNode, titleProblem, toggleKind, type Draft } from './edit-model.js';
import { CREATE_TUNING } from './edit-tuning.js';
import { PANEL_TUNING } from '../graph/view-tuning.js';

const PANEL: CSSProperties = {
  position: 'absolute',
  top: `${PANEL_TUNING.margin}px`,
  right: `${PANEL_TUNING.margin}px`,
  bottom: `${PANEL_TUNING.margin}px`,
  width: `min(${PANEL_TUNING.width}px, calc(100vw - ${2 * PANEL_TUNING.margin}px))`,
  zIndex: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '14px',
  overflowY: 'auto',
  boxSizing: 'border-box',
  background: 'var(--ig-node)',
  border: '1px solid var(--ig-edge)',
  borderRadius: '12px',
  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.35)',
  color: 'var(--ig-text)',
  fontSize: '13px',
};

const HEADER: CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', minHeight: '24px' };
const LABEL: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.75 };
const FIELD: CSSProperties = {
  font: 'inherit',
  fontSize: '13px',
  fontWeight: 400,
  letterSpacing: 'normal',
  textTransform: 'none',
  color: 'var(--ig-text)',
  background: 'var(--ig-canvas)',
  border: '1px solid var(--ig-edge)',
  borderRadius: '6px',
  padding: '7px 9px',
  boxSizing: 'border-box',
  width: '100%',
};
const BODY_FIELD: CSSProperties = { ...FIELD, minHeight: '180px', resize: 'vertical', fontFamily: 'var(--ig-font-mono, monospace)', fontSize: '12px', lineHeight: 1.45 };
const READ_TEXT: CSSProperties = { fontWeight: 400, letterSpacing: 'normal', textTransform: 'none', color: 'var(--ig-text)', lineHeight: 1.45, overflowWrap: 'anywhere', userSelect: 'text' };
const ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' };
const BUTTON: CSSProperties = {
  font: 'inherit',
  fontWeight: 600,
  padding: '6px 14px',
  borderRadius: '6px',
  border: '1px solid var(--ig-edge)',
  background: 'transparent',
  color: 'var(--ig-text)',
  cursor: 'pointer',
};
const PRIMARY: CSSProperties = { ...BUTTON, background: 'rgba(120, 169, 255, 0.18)', borderColor: 'rgba(120, 169, 255, 0.7)' };
const ICON_BUTTON: CSSProperties = { ...BUTTON, padding: '2px 4px', marginLeft: 'auto', border: 'none', display: 'inline-flex' };
const SECTION_TITLE: CSSProperties = { fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.75, margin: '0 0 4px' };
const LIST: CSSProperties = { margin: 0, paddingLeft: '18px', fontSize: '12px', lineHeight: 1.5, wordBreak: 'break-word' };
const MUTED: CSSProperties = { fontSize: '12px', opacity: 0.7 };
const UNSAVED: CSSProperties = { color: '#d29922', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' };
const NOTE_BASE: CSSProperties = { padding: '8px 10px', borderRadius: '8px', fontSize: '12px', lineHeight: 1.45, border: '1px solid' };
const NOTE_STYLE: Record<'error' | 'ok' | 'info', CSSProperties> = {
  error: { ...NOTE_BASE, borderColor: 'rgba(248, 81, 73, 0.65)', background: 'rgba(248, 81, 73, 0.10)' },
  ok: { ...NOTE_BASE, borderColor: 'rgba(63, 185, 80, 0.55)', background: 'rgba(63, 185, 80, 0.08)' },
  info: { ...NOTE_BASE, borderColor: 'var(--ig-edge)', background: 'transparent' },
};

type Note = { readonly kind: 'error' | 'ok'; readonly text: string } | null;

function NoteBox(props: { note: Note }): JSX.Element | null {
  if (!props.note) return null;
  const { kind, text } = props.note;
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} style={NOTE_STYLE[kind]} {...(kind === 'error' ? { 'data-edit-error': '' } : { 'data-edit-saved': '' })}>
      {text}
    </div>
  );
}

function clearSelection(): void {
  const s = useGraphStore.getState();
  s.setGraph(s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), s.edges);
}

// ctrl+s and esc while the panel is open, wherever the focus is
function useEditKeys(onSave: () => void, onCancel: () => void): void {
  const keys = useRef({ onSave, onCancel });
  keys.current = { onSave, onCancel };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isSaveKey(e)) {
        e.preventDefault();
        keys.current.onSave();
      } else if (e.key === 'Escape') {
        keys.current.onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function KindHeader(props: { kind: string; file?: string; unsaved?: boolean; onClose: () => void }): JSX.Element {
  const Icon = getNodeIcon(props.kind as NodeKind);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <div style={HEADER}>
      <Icon size={18} />
      <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{props.kind}</span>
      {props.unsaved ? (
        <span style={UNSAVED} data-unsaved="true" aria-label="unsaved changes">
          ● Unsaved
        </span>
      ) : null}
      <button type="button" style={ICON_BUTTON} aria-label="Close panel" onClick={props.onClose}>
        <X size={16} />
      </button>
    </div>
    {props.file ? (
      // the whole path, wrapped at slashes, never cut
      <div style={{ ...MUTED, fontFamily: 'var(--ig-font-mono, monospace)', overflowWrap: 'anywhere' }} data-edit-file="">
        {props.file}
      </div>
    ) : null}
    </div>
  );
}

function NodeEditor(props: { node: Node }): JSX.Element {
  const { node } = props;
  const data = node.data as { kind?: string; checkStatus?: CheckStatus; statusReasons?: ReadonlyArray<string>; drift?: DriftInfo; warnings?: ReadonlyArray<string> };
  const config = useUiStore((s) => s.editConfig);
  const graphVersion = useUiStore((s) => s.graphVersion);
  const [loaded, setLoaded] = useState<EditableNode | null>(null);
  const [draft, setDraft] = useState<Draft>({ title: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const dirty = isDirty(loaded, draft);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const request = useRef(0);
  const canEdit = config.write && loaded?.writable === true;

  const load = useCallback(
    async (keepNote: boolean): Promise<void> => {
      const mine = ++request.current;
      const r = await fetchEditableNode(config, node.id);
      // a later load won, or the person started typing while this one was out
      if (mine !== request.current || dirtyRef.current) return;
      if (!r.ok) {
        setNote({ kind: 'error', text: r.message });
        return;
      }
      setLoaded(r.value);
      setDraft({ title: r.value.title, body: r.value.body });
      if (!keepNote) setNote(null);
    },
    [config, node.id],
  );

  useEffect(() => {
    dirtyRef.current = false;
    setLoaded(null);
    setNote(null);
    void load(false);
  }, [load]);

  // a live update (this save, or an edit on disk) reloads the panel unless it holds unsaved text
  useEffect(() => {
    if (graphVersion > 0 && !dirtyRef.current) void load(true);
  }, [graphVersion, load]);

  const save = async (): Promise<void> => {
    if (!loaded || !canEdit || busy || !dirty) return;
    const problem = titleProblem(draft.title);
    if (problem) {
      setNote({ kind: 'error', text: problem });
      return;
    }
    setBusy(true);
    const title = draft.title.trim();
    const r = await saveNode(config, node.id, { title, body: draft.body, hash: loaded.hash });
    setBusy(false);
    if (!r.ok) {
      setNote({ kind: 'error', text: r.message });
      return;
    }
    dirtyRef.current = false;
    setLoaded({ ...loaded, title, body: draft.body, hash: r.value.hash });
    setDraft({ title, body: draft.body });
    setNote({ kind: 'ok', text: 'Saved to the spec file.' });
  };

  const cancel = (): void => {
    if (!loaded) return;
    dirtyRef.current = false;
    setDraft({ title: loaded.title, body: loaded.body });
    setNote(null);
    // read the file again, so a conflict clears with what is on disk now
    void load(false);
  };

  useEditKeys(() => void save(), cancel);

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    void save();
  };

  return (
    <aside style={PANEL} data-edit-panel={node.id} aria-label={`edit ${node.id}`} className="nowheel">
      <KindHeader kind={data.kind ?? node.type ?? 'node'} {...(loaded ? { file: loaded.file } : {})} unsaved={dirty} onClose={clearSelection} />
      {config.readOnlyReason ? (
        <div style={NOTE_STYLE.info} data-read-only="">
          {config.readOnlyReason}
        </div>
      ) : null}
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {canEdit ? (
          <>
            <label style={LABEL}>
              Title
              <input data-edit-title="" style={FIELD} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label style={LABEL}>
              Body
              <textarea data-edit-body="" style={BODY_FIELD} value={draft.body} spellCheck onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </label>
            <div style={ROW}>
              <button type="submit" style={{ ...PRIMARY, opacity: dirty && !busy ? 1 : 0.5 }} disabled={!dirty || busy} data-edit-save="">
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" style={{ ...BUTTON, opacity: dirty ? 1 : 0.5 }} disabled={!dirty} onClick={cancel} data-edit-cancel="">
                Cancel
              </button>
              <span style={MUTED}>Ctrl+S or Cmd+S saves, Esc cancels</span>
            </div>
          </>
        ) : (
          // read only: plain text, no field that looks like it takes input
          <>
            <div style={LABEL}>
              Title
              <div style={READ_TEXT} data-read-title="">
                {draft.title}
              </div>
            </div>
            <div style={LABEL}>
              Body
              <div style={{ ...READ_TEXT, fontFamily: 'var(--ig-font-mono, monospace)', fontSize: '12px', whiteSpace: 'pre-wrap' }} data-read-body="">
                {draft.body}
              </div>
            </div>
          </>
        )}
      </form>
      <NoteBox note={note} />
      <section>
        <h3 style={SECTION_TITLE}>Checks</h3>
        <div style={ROW}>{data.checkStatus ? <StatusMark status={data.checkStatus} /> : <span style={MUTED}>no check status</span>}</div>
        {data.statusReasons && data.statusReasons.length > 0 ? (
          <ul style={{ ...LIST, marginTop: '6px' }} data-status-reasons="">
            {data.statusReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}
      </section>
      {data.drift ? (
        <section data-drift-panel={data.drift.verdict}>
          <h3 style={SECTION_TITLE}>Drift</h3>
          <div style={ROW}>
            <DriftMark drift={data.drift} />
            <span style={MUTED}>
              {data.drift.entries} {data.drift.entries === 1 ? 'entry' : 'entries'}, decided by {data.drift.decided_by}
            </span>
          </div>
          {data.drift.stale ? (
            <p style={{ ...MUTED, margin: '6px 0 0' }} data-drift-stale-note="">
              Stale: a file this node is bound to changed after the report was written. Run the drift check again.
            </p>
          ) : null}
          <dl style={{ margin: '6px 0 0', fontSize: '12px', lineHeight: 1.5, wordBreak: 'break-word' }}>
            <dt style={MUTED}>Commit</dt>
            <dd style={{ margin: 0, fontFamily: 'var(--ig-font-mono, monospace)' }} data-drift-commit="">{data.drift.commit}</dd>
            <dt style={{ ...MUTED, marginTop: '4px' }}>Evidence</dt>
            <dd style={{ margin: 0 }} data-drift-evidence="">{data.drift.evidence}</dd>
            <dt style={{ ...MUTED, marginTop: '4px' }}>Suggested action</dt>
            <dd style={{ margin: 0 }} data-drift-action="">{data.drift.suggested_action}</dd>
            <dt style={{ ...MUTED, marginTop: '4px' }}>Report written</dt>
            <dd style={{ margin: 0 }}>{data.drift.reported_at}</dd>
          </dl>
        </section>
      ) : null}
      <section data-anchors="">
        <h3 style={SECTION_TITLE}>Anchors (read only)</h3>
        <AnchorList name="realized_by" items={loaded?.realized_by ?? []} />
        <AnchorList name="verified_by" items={loaded?.verified_by ?? []} />
      </section>
      {data.warnings && data.warnings.length > 0 ? (
        <section data-edit-warnings="">
          <h3 style={{ ...SECTION_TITLE, color: '#d29922' }}>Warnings</h3>
          <ul style={LIST}>
            {data.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}

function AnchorList(props: { name: string; items: ReadonlyArray<string> }): JSX.Element {
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ ...MUTED, fontFamily: 'var(--ig-font-mono, monospace)' }}>{props.name}</div>
      {props.items.length === 0 ? (
        <div style={{ ...MUTED, paddingLeft: '18px' }}>none</div>
      ) : (
        <ul style={{ ...LIST, fontFamily: 'var(--ig-font-mono, monospace)' }}>
          {props.items.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateForm(props: { parent: string }): JSX.Element {
  const config = useUiStore((s) => s.editConfig);
  const close = useUiStore((s) => s.closeCreate);
  const setPendingSelect = useUiStore((s) => s.setPendingSelect);
  const parentTitle = useGraphStore((s) => (s.nodes.find((n) => n.id === props.parent)?.data as { label?: string } | undefined)?.label ?? props.parent);
  const [title, setTitle] = useState('');
  const [kinds, setKinds] = useState<string[]>([...CREATE_TUNING.defaultTargetKinds]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  const create = async (): Promise<void> => {
    if (busy || !config.write) return;
    const problem = titleProblem(title);
    if (problem) {
      setNote({ kind: 'error', text: problem });
      return;
    }
    const kindProblem = kindsProblem(kinds);
    if (kindProblem) {
      setNote({ kind: 'error', text: kindProblem });
      return;
    }
    setBusy(true);
    const r = await createIntent(config, props.parent, title.trim(), kinds);
    setBusy(false);
    if (!r.ok) {
      setNote({ kind: 'error', text: r.message });
      return;
    }
    setPendingSelect(r.value.id);
    close();
  };

  useEditKeys(() => void create(), close);

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    void create();
  };

  return (
    <aside style={PANEL} data-create-form={props.parent} aria-label="new intent" className="nowheel">
      <KindHeader kind="intent" onClose={close} />
      <div style={MUTED}>
        New intent inside <strong>{parentTitle}</strong>. It is saved as a draft under spec/intents/.
      </div>
      {config.readOnlyReason ? (
        <div style={NOTE_STYLE.info} data-read-only="">
          {config.readOnlyReason}
        </div>
      ) : null}
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label style={LABEL}>
          Title
          <input ref={field} data-create-title="" style={FIELD} value={title} disabled={!config.write || busy} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }} data-create-kinds="">
          <legend style={{ ...LABEL, padding: 0, marginBottom: '4px' }}>Target kinds</legend>
          <div style={MUTED}>What this intent shapes. Pick at least one.</div>
          {CREATE_TUNING.targetKinds.map((k) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <input type="checkbox" data-create-kind={k} checked={kinds.includes(k)} disabled={!config.write || busy} onChange={() => setKinds(toggleKind(kinds, k))} />
              {k}
            </label>
          ))}
        </fieldset>
        <div style={ROW}>
          <button type="submit" style={{ ...PRIMARY, opacity: config.write && !busy ? 1 : 0.5 }} disabled={!config.write || busy} data-create-save="">
            {busy ? 'Creating…' : 'Create'}
          </button>
          <button type="button" style={BUTTON} onClick={close} data-create-cancel="">
            Cancel
          </button>
          <span style={MUTED}>Enter creates, Esc cancels</span>
        </div>
      </form>
      <NoteBox note={note} />
    </aside>
  );
}

export function EditPanel(): JSX.Element | null {
  const createParent = useUiStore((s) => s.createParent);
  const node = useGraphStore((s) => pickEditNode(s.nodes));
  if (createParent) return <CreateForm key={createParent} parent={createParent} />;
  if (!node) return null;
  return <NodeEditor key={node.id} node={node} />;
}
