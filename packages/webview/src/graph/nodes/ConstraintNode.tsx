// Original to IntentGraph (composes the lifted SystemNode visual vocabulary).
// Renders a kind='constraint' node — the verifier-bearing predicate.

import type { NodeProps } from '@xyflow/react';

import { registerLayoutSizer } from '../layout/sizing.js';
import { NodeChrome, type NodeChromeData } from './shared/nodeChrome.js';

export interface ConstraintNodeData extends Omit<NodeChromeData, 'kind' | 'body'> {
  predicateKind?: 'property' | 'type' | 'logical' | 'example';
}

export function ConstraintNode(props: NodeProps): JSX.Element {
  const data = props.data as unknown as ConstraintNodeData;
  const chromeData: NodeChromeData = {
    kind: 'constraint',
    label: data.label,
    ...(data.predicateKind && data.isSelected
      ? { body: <span>predicate: {data.predicateKind}</span> }
      : {}),
    ...(data.health !== undefined ? { health: data.health } : {}),
    ...(data.healthOverlay !== undefined ? { healthOverlay: data.healthOverlay } : {}),
    ...(data.highlight !== undefined ? { highlight: data.highlight } : {}),
    ...(data.isSelected !== undefined ? { isSelected: data.isSelected } : {}),
    ...(data.isDimmed !== undefined ? { isDimmed: data.isDimmed } : {}),
    ...(data.isGhosted !== undefined ? { isGhosted: data.isGhosted } : {}),
  };
  return <NodeChrome data={chromeData} />;
}

registerLayoutSizer('constraint', () => ({ width: 240, height: 72 }));
