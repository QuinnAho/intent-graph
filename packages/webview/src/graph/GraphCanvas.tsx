// Lifted from claudemap/app/src/components/graph/GraphCanvas.jsx @ claudemap@vendored.
// Adapted: TS strict, props-driven (nodes/edges/handlers passed in, no store reach-in),
// presentation-mode logic stripped, IntentGraph node/edge type maps, ELK readiness via
// a separate hook (use-elk-layout). License: MIT (see /claudemap/LICENSE).
// See LIFT_LOG.md for the full lift record.

import {
  Background,
  ReactFlow,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';

import { CodeModuleNode } from './nodes/CodeModuleNode.js';
import { CodeSymbolNode } from './nodes/CodeSymbolNode.js';
import { ConceptNode } from './nodes/ConceptNode.js';
import { ConstraintNode } from './nodes/ConstraintNode.js';
import { CounterexampleNode } from './nodes/CounterexampleNode.js';
import { DecisionNode } from './nodes/DecisionNode.js';
import { IntentNode } from './nodes/IntentNode.js';
import { RationaleNode } from './nodes/RationaleNode.js';
import { TaskNode } from './nodes/TaskNode.js';
import { useZoomLevel, type ZoomLevel } from './zoom/useZoomLevel.js';

type NodeMouseHandler = (event: MouseEvent, node: Node) => void;
type PaneMouseHandler = (event: MouseEvent) => void;

const NODE_TYPES: NodeTypes = {
  intent: IntentNode,
  constraint: ConstraintNode,
  rationale: RationaleNode,
  decision: DecisionNode,
  concept: ConceptNode,
  code_module: CodeModuleNode,
  code_symbol: CodeSymbolNode,
  counterexample: CounterexampleNode,
  task: TaskNode,
};

const EDGE_TYPES: EdgeTypes = {};

const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1.2 };

const TRANSITIONING_MESSAGE_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--ig-text)',
  fontSize: '13px',
  letterSpacing: '0.01em',
  zIndex: 18,
  pointerEvents: 'auto',
};

const LOADING_PLACEHOLDER_STYLE: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--ig-text)',
  fontSize: '13px',
  letterSpacing: '0.01em',
};

export interface GraphCanvasProps {
  nodes: Node[];
  edges: Edge[];
  graphLoaded: boolean;
  layoutReady: boolean;
  fitView?: boolean;
  interactionLocked?: boolean;
  onNodeClick?: NodeMouseHandler;
  onNodeMouseEnter?: NodeMouseHandler;
  onPaneMouseMove?: PaneMouseHandler;
  onPaneClick?: PaneMouseHandler;
  onZoomLevelChange?: (level: ZoomLevel) => void;
}

export function GraphCanvas(props: GraphCanvasProps): JSX.Element {
  const {
    nodes,
    edges,
    graphLoaded,
    layoutReady,
    fitView = true,
    interactionLocked = false,
    onNodeClick,
    onNodeMouseEnter,
    onPaneMouseMove,
    onPaneClick,
    onZoomLevelChange,
  } = props;

  const { zoomLevel, onViewportChange: onZoomViewportChange } = useZoomLevel();
  const graphReady = graphLoaded && layoutReady;
  const hasMountedGraphRef = useRef(false);

  if (graphReady) {
    hasMountedGraphRef.current = true;
  }

  const showGraph = graphReady || hasMountedGraphRef.current;
  const isGraphTransitioning = !graphLoaded && hasMountedGraphRef.current;

  useEffect(() => {
    onZoomLevelChange?.(zoomLevel);
  }, [onZoomLevelChange, zoomLevel]);

  const handleViewportChange = (viewport: Viewport): void => {
    onZoomViewportChange(viewport);
  };

  if (!showGraph) {
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <div style={LOADING_PLACEHOLDER_STYLE}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView={fitView}
        fitViewOptions={FIT_VIEW_OPTIONS}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnScroll={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={!interactionLocked}
        elementsSelectable={!interactionLocked}
        selectionOnDrag={!interactionLocked}
        onlyRenderVisibleElements
        onViewportChange={handleViewportChange}
        {...(onNodeClick ? { onNodeClick } : {})}
        {...(onNodeMouseEnter ? { onNodeMouseEnter } : {})}
        {...(onPaneMouseMove ? { onPaneMouseMove } : {})}
        {...(onPaneClick ? { onPaneClick } : {})}
        proOptions={{ hideAttribution: true }}
        style={{
          backgroundColor: 'var(--ig-canvas)',
          opacity: isGraphTransitioning ? 0.22 : 1,
          transition: 'opacity 0.18s ease',
        }}
      >
        <Background color="var(--ig-edge)" gap={40} size={1} />
      </ReactFlow>
      {isGraphTransitioning ? <div style={TRANSITIONING_MESSAGE_STYLE}>Loading…</div> : null}
    </div>
  );
}
