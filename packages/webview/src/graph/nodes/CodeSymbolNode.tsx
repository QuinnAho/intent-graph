// Lifted from claudemap/app/src/components/graph/FunctionNode.jsx +
// claudemap/app/src/components/graph/FileNode.jsx @ claudemap@vendored.
// Adapted: ClaudeMap had separate FileNode + FunctionNode. IntentGraph collapses
// both into CodeSymbolNode (kind='code_symbol') with a free-form `symbolKind`
// data field; the visual vocabulary is shared through the chrome component.
// License: MIT (see /claudemap/LICENSE). See LIFT_LOG.md for the full lift record.

import type { NodeProps } from '@xyflow/react';

import { registerLayoutSizer } from '../layout/sizing.js';
import { NodeChrome, type NodeChromeData } from './shared/nodeChrome.js';

export interface CodeSymbolNodeData extends Omit<NodeChromeData, 'kind' | 'body'> {
  qualifiedName?: string;
  /** Free-form kind hint: 'function' | 'class' | 'const' | etc. Display only. */
  symbolKind?: string;
  /** Drift state surfaces via highlight + health. */
  driftState?: 'aligned' | 'drift' | 'violation';
}

export function CodeSymbolNode(props: NodeProps): JSX.Element {
  const data = props.data as unknown as CodeSymbolNodeData;
  const chromeData: NodeChromeData = {
    kind: 'code_symbol',
    label: data.label,
    ...(data.isSelected && data.qualifiedName ? { body: <span>{data.qualifiedName}</span> } : {}),
    ...(data.health !== undefined ? { health: data.health } : {}),
    ...(data.healthOverlay !== undefined ? { healthOverlay: data.healthOverlay } : {}),
    ...(data.highlight !== undefined ? { highlight: data.highlight } : {}),
    ...(data.isSelected !== undefined ? { isSelected: data.isSelected } : {}),
    ...(data.isDimmed !== undefined ? { isDimmed: data.isDimmed } : {}),
    ...(data.isGhosted !== undefined ? { isGhosted: data.isGhosted } : {}),
  };
  return <NodeChrome data={chromeData} />;
}

registerLayoutSizer('code_symbol', () => ({ width: 200, height: 56 }));
