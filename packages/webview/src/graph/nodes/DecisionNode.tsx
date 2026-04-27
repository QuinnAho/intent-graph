// Original to IntentGraph (composes the lifted SystemNode visual vocabulary).
// Renders a kind='decision' node — records a chosen alternative.

import type { NodeProps } from '@xyflow/react';

import { registerLayoutSizer } from '../layout/sizing.js';
import { NodeChrome, type NodeChromeData } from './shared/nodeChrome.js';

export interface DecisionNodeData extends Omit<NodeChromeData, 'kind' | 'body'> {
  chosen?: string;
}

export function DecisionNode(props: NodeProps): JSX.Element {
  const data = props.data as unknown as DecisionNodeData;
  const chromeData: NodeChromeData = {
    kind: 'decision',
    label: data.label,
    ...(data.chosen && data.isSelected ? { body: <span>chose: {data.chosen}</span> } : {}),
    ...(data.health !== undefined ? { health: data.health } : {}),
    ...(data.healthOverlay !== undefined ? { healthOverlay: data.healthOverlay } : {}),
    ...(data.highlight !== undefined ? { highlight: data.highlight } : {}),
    ...(data.isSelected !== undefined ? { isSelected: data.isSelected } : {}),
    ...(data.isDimmed !== undefined ? { isDimmed: data.isDimmed } : {}),
    ...(data.isGhosted !== undefined ? { isGhosted: data.isGhosted } : {}),
  };
  return <NodeChrome data={chromeData} />;
}

registerLayoutSizer('decision', () => ({ width: 240, height: 76 }));
