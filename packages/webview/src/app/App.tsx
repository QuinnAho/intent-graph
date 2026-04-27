import type { CSSProperties } from 'react';

import { GraphCanvas } from '../graph/GraphCanvas.js';

const SHELL_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100vw',
  height: '100vh',
};

export function App(): JSX.Element {
  return (
    <div style={SHELL_STYLE}>
      <GraphCanvas nodes={[]} edges={[]} graphLoaded={true} layoutReady={true} />
    </div>
  );
}
