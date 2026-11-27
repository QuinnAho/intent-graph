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
import { EditPanel } from './EditPanel.js';
import { selectOnly } from './edit-model.js';
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

const SHELL_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100vw',
  height: '100vh',
};

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
      <GraphCanvas
        nodes={nodes as Parameters<typeof GraphCanvas>[0]['nodes']}
        edges={edges as Parameters<typeof GraphCanvas>[0]['edges']}
        graphLoaded={graphLoaded}
        layoutReady={layoutReady && fitNodeIds !== undefined}
        fitNodeIds={fitNodeIds ?? null}
        onNodesChange={handleNodesChange}
      />
      <ProblemsPanel />
      <EditPanel />
    </div>
  );
}
