// Webview app shell. At L0 this loads graph.json from the static asset path
// (the seed-dev-db output) and renders the React Flow canvas. The store
// + selectors keep re-renders narrow so the canvas only updates when the
// node/edge set actually changes.
//
// Phase 3 (tech-spec §6 phase 3 line 451) replaces the file fetch with
// vscode-messenger streaming via ../transport/messenger-client.ts. The
// store shape is unchanged; only the producer differs.

import { useEffect, type CSSProperties } from 'react';

import { GraphCanvas } from '../graph/GraphCanvas.js';
import {
  useGraphEdges,
  useGraphError,
  useGraphLoaded,
  useGraphNodes,
  useGraphStatus,
  useLayoutReady,
} from '../store/selectors.js';
import { loadGraphFromJson } from '../transport/graph-json-loader.js';

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

  useEffect(() => {
    if (status === 'idle') {
      void loadGraphFromJson();
    }
  }, [status]);

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
        layoutReady={layoutReady}
      />
    </div>
  );
}
