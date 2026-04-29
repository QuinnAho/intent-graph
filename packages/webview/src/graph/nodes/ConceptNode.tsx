// Original to IntentGraph (composes the lifted SystemNode visual vocabulary).
// Renders a kind='concept' node — Daniel Jackson concept boundary, used as
// React Flow sub-flow parent for child nodes (extent: 'parent').
//
// Sub-flow contract (p2-t09): when child nodes carry `parentId === <this
// concept's id>` plus `extent: 'parent'` (set by the loader at
// transport/graph-json-loader.ts), React Flow renders this concept as a
// containing boundary that visually groups its children. This component
// does not need to set any sub-flow-specific props itself — the React Flow
// renderer reads the parent-child relationship from the node payload and
// handles the rendering. The sizer below grows the concept's bounding box
// with childCount so the parent does not crop its children at render time.
//
// Tech-spec §3.5 line 141 ("sub-flows for concept boundaries (`extent:
// 'parent'`)") is the substrate decision this component honors.

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
