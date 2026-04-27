// Original to IntentGraph (composes the lifted SystemNode visual vocabulary).
// Renders a kind='counterexample' node — a first-class graph node carrying the
// shrunk failing input that broke an obligation.

import type { NodeProps } from '@xyflow/react';

import { registerLayoutSizer } from '../layout/sizing.js';
import { NodeChrome, type NodeChromeData } from './shared/nodeChrome.js';

export interface CounterexampleNodeData extends Omit<NodeChromeData, 'kind' | 'body'> {
  inputRepr?: string;
  shrinker?: 'fast-check' | 'hypothesis' | 'hdd';
}

export function CounterexampleNode(props: NodeProps): JSX.Element {
  const data = props.data as unknown as CounterexampleNodeData;
  const chromeData: NodeChromeData = {
    kind: 'counterexample',
    label: data.label,
    ...(data.isSelected && data.inputRepr ? { body: <code>{data.inputRepr}</code> } : {}),
    ...(data.health !== undefined ? { health: data.health } : {}),
    ...(data.healthOverlay !== undefined ? { healthOverlay: data.healthOverlay } : {}),
    ...(data.highlight !== undefined ? { highlight: data.highlight } : {}),
    ...(data.isSelected !== undefined ? { isSelected: data.isSelected } : {}),
    ...(data.isDimmed !== undefined ? { isDimmed: data.isDimmed } : {}),
    ...(data.isGhosted !== undefined ? { isGhosted: data.isGhosted } : {}),
  };
  return <NodeChrome data={chromeData} />;
}

registerLayoutSizer('counterexample', () => ({ width: 240, height: 76 }));
