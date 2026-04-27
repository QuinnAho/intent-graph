// Lifted from claudemap/app/src/components/graph/SystemNode.jsx +
// claudemap/app/src/components/graph/FileNode.jsx @ claudemap@vendored.
// Adapted: ClaudeMap split file vs system at the data layer. IntentGraph collapses
// "module" (the file/directory unit) into a single CodeModuleNode that composes the
// shared chrome. License: MIT (see /claudemap/LICENSE).
// See LIFT_LOG.md for the full lift record.

import type { NodeProps } from '@xyflow/react';

import { registerLayoutSizer } from '../layout/sizing.js';
import { NodeChrome, type NodeChromeData } from './shared/nodeChrome.js';

export interface CodeModuleNodeData extends Omit<NodeChromeData, 'kind' | 'body'> {
  uri?: string;
  language?: string;
  childCount?: number;
}

export function CodeModuleNode(props: NodeProps): JSX.Element {
  const data = props.data as unknown as CodeModuleNodeData;
  const chromeData: NodeChromeData = {
    kind: 'code_module',
    label: data.label,
    ...(data.isSelected && (data.uri || data.language)
      ? {
          body: (
            <span>
              {data.language ? `${data.language} · ` : ''}
              {data.uri ?? ''}
            </span>
          ),
        }
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

registerLayoutSizer('code_module', (node) => {
  const data = node.data as unknown as CodeModuleNodeData;
  const childCount = typeof data.childCount === 'number' ? data.childCount : 0;
  return { width: 240, height: 72 + Math.min(80, childCount * 6) };
});
