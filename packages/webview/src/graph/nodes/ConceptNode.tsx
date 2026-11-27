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
//
// while selected on a page that can write, a React Flow NodeToolbar above the
// concept offers "add intent", which opens the create form in the side panel.

import { NodeToolbar, Position, type NodeProps } from '@xyflow/react';
import { Plus } from 'lucide-react';

import { registerLayoutSizer } from '../layout/sizing.js';
import { NodeChrome, type NodeChromeData } from './shared/nodeChrome.js';
import { useUiStore } from '../../store/ui-slice.js';

const ADD_BUTTON = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 10px',
  borderRadius: '999px',
  border: '1px solid rgba(120, 169, 255, 0.7)',
  background: 'var(--ig-node)',
  color: 'var(--ig-text)',
  font: 'inherit',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.30)',
} as const;

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
    ...(data.checkStatus !== undefined ? { checkStatus: data.checkStatus } : {}),
    ...(data.warnings !== undefined ? { warnings: data.warnings } : {}),
    ...(data.drift !== undefined ? { drift: data.drift } : {}),
  };
  const canWrite = useUiStore((s) => s.editConfig.write);
  const openCreate = useUiStore((s) => s.openCreate);
  return (
    <>
      <NodeToolbar isVisible={props.selected === true && canWrite} position={Position.Top} align="start">
        <button type="button" style={ADD_BUTTON} data-add-intent={props.id} onClick={() => openCreate(props.id)}>
          <Plus size={14} aria-hidden />
          Add intent
        </button>
      </NodeToolbar>
      <NodeChrome data={chromeData} />
    </>
  );
}

registerLayoutSizer('concept', (node) => {
  const data = node.data as unknown as ConceptNodeData;
  const childCount = typeof data.childCount === 'number' ? data.childCount : 0;
  return { width: Math.max(280, 220 + childCount * 8), height: 88 + childCount * 4 };
});
