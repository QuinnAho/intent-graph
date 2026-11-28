// Webview app shell. At L0 this loads graph.json from the static asset path
// (the seed-dev-db output) and renders the React Flow canvas. The store
// + selectors keep re-renders narrow so the canvas only updates when the
// node/edge set actually changes.
//
// Phase 3 (tech-spec §6 phase 3 line 451) replaces the file fetch with
// vscode-messenger streaming via ../transport/messenger-client.ts. The
// store shape is unchanged; only the producer differs.

import { applyNodeChanges, type Node, type NodeChange, type NodeSelectionChange } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';

import { GraphCanvas } from '../graph/GraphCanvas.js';
import { openDetails, openNodeMenu, openPaneMenu, renameNode } from './direct-edit-actions.js';
import { directKey } from './direct-edit-model.js';
import { acceptProposal, dismissProposal } from './inferred-actions.js';
import { INFERRED_MENU_KIND, inferredKey, inferredOf } from './inferred-model.js';
import { MENU_TUNING } from './direct-edit-tuning.js';
import { EditPanel } from './EditPanel.js';
import { Legend, useLegendFirstVisit } from './Legend.js';
import { StateBar } from './StateBar.js';
import { Notice } from './Notice.js';
import { deleteWire, undoLast } from './wire-edit-actions.js';
import { isUndoKey } from '../graph/wire-edit-model.js';
import { useSettledId } from './use-settled-id.js';
import { pickEditNode, selectOnly } from './edit-model.js';
import { ProblemsPanel } from './ProblemsPanel.js';
import {
  useGraphEdges,
  useGraphError,
  useGraphLoaded,
  useGraphNodes,
  useGraphStatus,
  useLayoutReady,
} from '../store/selectors.js';
import { useGraphStore } from '../store/graph-slice.js';
import { useUiStore } from '../store/ui-slice.js';
import { readEditConfig } from '../transport/edit-api.js';
import { dragHold } from '../graph/drag-hold.js';
import { applyGraphUpdate, fetchGraphJson, loadGraphFromJson } from '../transport/graph-json-loader.js';
import { pickInitialFit, readFocus, readLiveSource, type LiveSource } from '../transport/live-source.js';

declare global {
  interface Window {
    __INTENTGRAPH_LIVE__?: unknown;
  }
}

function waitForLayout(): Promise<void> {
  return new Promise((done) => {
    if (useGraphStore.getState().layoutReady) {
      done();
      return;
    }
    const stop = useGraphStore.subscribe((s) => {
      if (s.layoutReady) {
        stop();
        done();
      }
    });
  });
}

// follow a live server: every graph event refetches and merges in place, so
// the page never reloads and the viewport stays where the user left it.
// the page's html element carries data-graph-version for scripts that watch it.
function useLiveUpdates(live: LiveSource | null): void {
  useEffect(() => {
    if (!live) return undefined;
    let busy = false;
    let again = false;
    let seen = -1;
    let stopped = false;
    const pull = async (): Promise<void> => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        await waitForLayout();
        await dragHold.whenFree();
        const envelope = await fetchGraphJson(live.graphUrl);
        if (!stopped && (await applyGraphUpdate(envelope))) {
          const v = (envelope as unknown as { _live_version?: number })._live_version;
          document.documentElement.dataset['graphVersion'] = String(v ?? '');
          useUiStore.getState().bumpGraphVersion();
        }
      } catch (err) {
        console.warn('live update failed', err);
      }
      busy = false;
      if (again && !stopped) {
        again = false;
        void pull();
      }
    };
    const events = new EventSource(live.eventsUrl);
    events.addEventListener('graph', (ev) => {
      const v = Number((JSON.parse((ev as MessageEvent<string>).data) as { version?: number }).version);
      if (v === seen) return;
      seen = v;
      void pull();
    });
    return () => {
      stopped = true;
      events.close();
    };
  }, [live]);
}

// keep selection in the store so a live update does not clear it
function onSelectionChange(changes: NodeChange[]): void {
  const select = changes.filter((c): c is NodeSelectionChange => c.type === 'select');
  if (select.length === 0) return;
  const s = useGraphStore.getState();
  s.setGraph(applyNodeChanges(select, [...s.nodes] as Node[]), s.edges);
}

// F2 renames, Enter opens details, the menu key opens the menu. read in the capture phase,
// so a node that the same Enter is about to select is not yet selected when this looks.
function useDirectEditKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target instanceof Element ? e.target : null;
      const typing = target?.closest('input, textarea, select, button, a, [contenteditable="true"], [role="menu"]') != null;
      const ui = useUiStore.getState();
      const picked = pickEditNode(useGraphStore.getState().nodes);
      // an inferred node: Enter accepts, Delete dismisses, F2 opens the title first
      const inferred = inferredKey({ typing, menuOpen: ui.menu !== null, renameOpen: ui.renameId !== null, inferredSelected: inferredOf(picked) !== null }, e);
      if (inferred && picked) {
        e.preventDefault();
        e.stopPropagation();
        if (inferred === 'accept') void acceptProposal(picked.id);
        else if (inferred === 'dismiss') void dismissProposal(picked.id);
        else if (ui.editConfig.write) renameNode(picked.id);
        else void acceptProposal(picked.id);
        return;
      }
      const action = directKey({ typing, menuOpen: ui.menu !== null, renameOpen: ui.renameId !== null, selectedKind: picked?.type ?? null, write: ui.editConfig.write }, e);
      if (!action) return;
      e.preventDefault();
      if (action === 'rename' && picked) renameNode(picked.id);
      else if (action === 'details' && picked) openDetails(picked.id);
      else if (action === 'menu') {
        if (picked && picked.type) {
          const el = Array.from(document.querySelectorAll('.react-flow__node')).find((n) => n.getAttribute('data-id') === picked.id);
          const r = el?.getBoundingClientRect();
          openNodeMenu(picked.id, inferredOf(picked) ? INFERRED_MENU_KIND : picked.type, { x: (r?.left ?? 0) + MENU_TUNING.nodeInset, y: (r?.top ?? 0) + MENU_TUNING.nodeInset });
        } else openPaneMenu({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}

// ctrl+z or cmd+z undoes the newest write when no text field has the focus. inside one it stays the
// browser's own text undo. delete or backspace removes the wire picked with a click.
function useWireEditKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target instanceof Element ? e.target : null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]') != null;
      if (isUndoKey(e, typing)) {
        e.preventDefault();
        void undoLast();
        return;
      }
      const wire = useUiStore.getState().selectedWire;
      if (!typing && wire && (e.key === 'Delete' || e.key === 'Backspace') && !target?.closest('[role="menu"]')) {
        e.preventDefault();
        deleteWire(wire);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

// the canvas and the edit panel fill what is left above the problems strip, so nothing sits on a node
const SHELL_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100vw',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
};

// the state bar sits above this row and the legend beside the canvas, each in its own room
const MIDDLE_STYLE: CSSProperties = { display: 'flex', flex: '1 1 auto', minHeight: 0 };
const CANVAS_AREA_STYLE: CSSProperties = { position: 'relative', flex: '1 1 auto', minHeight: 0, minWidth: 0 };

const ERROR_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--ig-text)',
  fontFamily: 'var(--ig-font-mono, monospace)',
  fontSize: '13px',
  padding: '24px',
  textAlign: 'center',
  whiteSpace: 'pre-wrap',
};

export function App(): JSX.Element {
  const nodes = useGraphNodes();
  const edges = useGraphEdges();
  const status = useGraphStatus();
  const graphLoaded = useGraphLoaded();
  const layoutReady = useLayoutReady();
  const errorMessage = useGraphError();
  const live = useMemo(() => readLiveSource(window.location.search, window.__INTENTGRAPH_LIVE__), []);
  const focus = useMemo(() => readFocus(window.location.search), []);
  const pendingSelect = useUiStore((s) => s.pendingSelect);
  const editNodeId = useSettledId(useGraphStore((s) => pickEditNode(s.nodes)?.id ?? null));
  // picked once, when the first laid-out graph arrives. later updates never refit.
  const [fitNodeIds, setFitNodeIds] = useState<string[] | null | undefined>(undefined);

  useEffect(() => {
    if (status === 'idle') {
      void loadGraphFromJson(live ? { url: live.graphUrl } : {});
    }
  }, [status, live]);

  useEffect(() => {
    if (layoutReady && fitNodeIds === undefined) setFitNodeIds(pickInitialFit(nodes, focus));
  }, [layoutReady, fitNodeIds, nodes, focus]);

  useEffect(() => {
    useUiStore.getState().setEditConfig(readEditConfig(window.__INTENTGRAPH_LIVE__));
  }, []);

  // a node the page just created is selected once a live update brings it, so its panel opens
  useEffect(() => {
    if (!pendingSelect) return;
    const next = selectOnly(nodes, pendingSelect);
    if (!next) return;
    useGraphStore.getState().setGraph(next, useGraphStore.getState().edges);
    useUiStore.getState().setPendingSelect(null);
  }, [nodes, pendingSelect]);

  useLiveUpdates(live);
  useDirectEditKeys();
  useWireEditKeys();
  useLegendFirstVisit();
  const handleNodesChange = useCallback(onSelectionChange, []);

  if (status === 'error' && errorMessage) {
    return (
      <div style={SHELL_STYLE}>
        <div style={ERROR_STYLE}>
          {`Failed to load graph.json:\n\n${errorMessage}\n\nRun \`pnpm tsx scripts/seed-dev-db.ts\` to regenerate.`}
        </div>
      </div>
    );
  }

  return (
    <div style={SHELL_STYLE}>
      <StateBar />
      <div style={MIDDLE_STYLE}>
      <div style={CANVAS_AREA_STYLE}>
      <GraphCanvas
        nodes={nodes as Parameters<typeof GraphCanvas>[0]['nodes']}
        edges={edges as Parameters<typeof GraphCanvas>[0]['edges']}
        graphLoaded={graphLoaded}
        layoutReady={layoutReady && fitNodeIds !== undefined}
        fitNodeIds={fitNodeIds ?? null}
        onNodesChange={handleNodesChange}
        clearPanelFor={editNodeId}
      />
      <EditPanel />
      </div>
      <Legend />
      </div>
      <Notice />
      <ProblemsPanel />
    </div>
  );
}
