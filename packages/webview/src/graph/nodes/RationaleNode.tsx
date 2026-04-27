// Original to IntentGraph (composes the lifted SystemNode visual vocabulary).
// Renders a kind='rationale' node — captures "why" prose for nearby decisions.

import type { NodeProps } from '@xyflow/react';

import { registerLayoutSizer } from '../layout/sizing.js';
import { NodeChrome, type NodeChromeData } from './shared/nodeChrome.js';

export interface RationaleNodeData extends Omit<NodeChromeData, 'kind' | 'body'> {
  text?: string;
}

export function RationaleNode(props: NodeProps): JSX.Element {
  const data = props.data as unknown as RationaleNodeData;
  const chromeData: NodeChromeData = {
    kind: 'rationale',
    label: data.label,
    ...(data.text && data.isSelected ? { body: <span>{data.text}</span> } : {}),
    ...(data.health !== undefined ? { health: data.health } : {}),
    ...(data.healthOverlay !== undefined ? { healthOverlay: data.healthOverlay } : {}),
    ...(data.highlight !== undefined ? { highlight: data.highlight } : {}),
    ...(data.isSelected !== undefined ? { isSelected: data.isSelected } : {}),
    ...(data.isDimmed !== undefined ? { isDimmed: data.isDimmed } : {}),
    ...(data.isGhosted !== undefined ? { isGhosted: data.isGhosted } : {}),
  };
  return <NodeChrome data={chromeData} />;
}

registerLayoutSizer('rationale', () => ({ width: 220, height: 68 }));
