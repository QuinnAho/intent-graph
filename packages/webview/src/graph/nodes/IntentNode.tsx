// Original to IntentGraph (composes the lifted SystemNode visual vocabulary).
// Renders a kind='intent' node with the chrome from shared/nodeChrome and a
// summary body when the node is selected.

import type { NodeProps } from '@xyflow/react';

import { registerLayoutSizer } from '../layout/sizing.js';
import { NodeChrome, type NodeChromeData } from './shared/nodeChrome.js';

export interface IntentNodeData extends Omit<NodeChromeData, 'kind' | 'body'> {
  summary?: string;
}

export function IntentNode(props: NodeProps): JSX.Element {
  const data = props.data as unknown as IntentNodeData;
  const chromeData: NodeChromeData = {
    kind: 'intent',
    label: data.label,
    ...(data.summary && data.isSelected ? { body: <span>{data.summary}</span> } : {}),
    ...(data.health !== undefined ? { health: data.health } : {}),
    ...(data.healthOverlay !== undefined ? { healthOverlay: data.healthOverlay } : {}),
    ...(data.highlight !== undefined ? { highlight: data.highlight } : {}),
    ...(data.isSelected !== undefined ? { isSelected: data.isSelected } : {}),
    ...(data.isDimmed !== undefined ? { isDimmed: data.isDimmed } : {}),
    ...(data.isGhosted !== undefined ? { isGhosted: data.isGhosted } : {}),
  };
  return <NodeChrome data={chromeData} />;
}

registerLayoutSizer('intent', () => ({ width: 240, height: 76 }));
