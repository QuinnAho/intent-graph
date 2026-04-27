// Original to IntentGraph (composes the lifted SystemNode visual vocabulary).
// Renders a kind='task' node — every agent action wraps in a task and the task
// graph IS the orchestrator graph (Tech-Spec Pillar 4).

import type { NodeProps } from '@xyflow/react';

import { registerLayoutSizer } from '../layout/sizing.js';
import { NodeChrome, type NodeChromeData } from './shared/nodeChrome.js';

export type TaskStatus =
  | 'proposed'
  | 'leased'
  | 'running'
  | 'produced'
  | 'committed'
  | 'rejected'
  | 'rolled_back';

export interface TaskNodeData extends Omit<NodeChromeData, 'kind' | 'body'> {
  status?: TaskStatus;
  capabilityId?: string;
}

export function TaskNode(props: NodeProps): JSX.Element {
  const data = props.data as unknown as TaskNodeData;
  const chromeData: NodeChromeData = {
    kind: 'task',
    label: data.label,
    ...(data.isSelected && (data.status || data.capabilityId)
      ? {
          body: (
            <span>
              {data.status ? `[${data.status}] ` : ''}
              {data.capabilityId ?? ''}
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

registerLayoutSizer('task', () => ({ width: 240, height: 72 }));
