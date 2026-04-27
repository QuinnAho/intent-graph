// Original to IntentGraph (composes the lifted SystemNode visual vocabulary).
// Renders a kind='concept' node — Daniel Jackson concept boundary, used as
// React Flow sub-flow parent for child nodes (extent: 'parent').

import type { NodeProps } from '@xyflow/react';

import { registerLayoutSizer } from '../layout/sizing.js';
import { NodeChrome, type NodeChromeData } from './shared/nodeChrome.js';

export interface ConceptNodeData extends Omit<NodeChromeData, 'kind' | 'body'> {
  description?: string;
  childCount?: number;
}

export function ConceptNode(props: NodeProps): JSX.Element {
  const data = props.data as unknown as ConceptNodeData;
  const chromeData: NodeChromeData = {
    kind: 'concept',
    label: data.label,
    ...(data.description && data.isSelected ? { body: <span>{data.description}</span> } : {}),
    ...(data.health !== undefined ? { health: data.health } : {}),
    ...(data.healthOverlay !== undefined ? { healthOverlay: data.healthOverlay } : {}),
    ...(data.highlight !== undefined ? { highlight: data.highlight } : {}),
    ...(data.isSelected !== undefined ? { isSelected: data.isSelected } : {}),
    ...(data.isDimmed !== undefined ? { isDimmed: data.isDimmed } : {}),
    ...(data.isGhosted !== undefined ? { isGhosted: data.isGhosted } : {}),
  };
  return <NodeChrome data={chromeData} />;
}

registerLayoutSizer('concept', (node) => {
  const data = node.data as unknown as ConceptNodeData;
  const childCount = typeof data.childCount === 'number' ? data.childCount : 0;
  return { width: Math.max(280, 220 + childCount * 8), height: 88 + childCount * 4 };
});
