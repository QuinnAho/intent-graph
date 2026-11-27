// Lifted from claudemap/app/src/components/graph/GraphCanvas.jsx @ claudemap@vendored.
// Adapted: TS strict, props-driven (nodes/edges/handlers passed in, no store reach-in),
// presentation-mode logic stripped, IntentGraph node/edge type maps, ELK readiness via
// a separate hook (use-elk-layout). License: MIT (see /claudemap/LICENSE).
// See docs/04 - Workflow/Lift Log.md for the full lift record.

import {
  Background,
  ReactFlow,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
  type OnNodesChange,
  useReactFlow,
  useStore,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';

import { SPEC_KINDS } from '../transport/live-source.js';
import { HoverNodeContext, PinContext } from './edges/wire-context.js';
import { planWires } from './edges/wire-plan.js';
import { WireEdge } from './edges/WireEdge.js';
import { viewToClearPanel } from './keep-in-view.js';
import { PANEL_TUNING, WIRE_TUNING } from './view-tuning.js';

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

// Node-type → component map. React Flow looks each node's `type` field up
// against this map to pick the renderer. Sub-flow handling (p2-t09): React
// Flow reads `parentId` + `extent: 'parent'` from the node payload itself
// (set by transport/graph-json-loader.ts), not from a per-type opt-in here
// — so concept nodes act as sub-flow boundaries automatically when their
// children carry the right parentId. Keeping the map flat (no `parent`-
// specific entry) means adding a new node kind only requires adding it
// here and registering a sizer; sub-flow capability is implicit in the
// parent-child relationship.
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

// one wire component for every edge kind, colour and dash come from the kind
const EDGE_TYPES: EdgeTypes = { wire: WireEdge };

// the layout puts spec nodes and code nodes in two blocks. a wire between blocks is counted, not drawn.
const viewBlock = (n: Node): string => (n.type !== undefined && SPEC_KINDS.has(n.type) ? 'spec' : 'code');

// pans and zooms the viewport so the node whose panel is open is not under the panel.
// the box is read from the drawn node, which is the truth for a node inside a concept.
function KeepInView(props: { nodeId: string | null; nodes: ReadonlyArray<Node> }): null {
  const rf = useReactFlow();
  const canvasWidth = useStore((s) => s.width);
  const canvasHeight = useStore((s) => s.height);
  const node = props.nodeId ? props.nodes.find((n) => n.id === props.nodeId) : undefined;
  // the box moves when a live update lays the graph out again, so it is part of the trigger
  const moved = `${node?.position.x}|${node?.position.y}|${node?.width}|${node?.height}`;
  useEffect(() => {
    if (!props.nodeId || canvasWidth === 0) return undefined;
    const id = props.nodeId;
    const frame = window.setTimeout(() => {
      const canvas = document.querySelector('.react-flow');
      const drawn = Array.from(document.querySelectorAll('.react-flow__node')).find((e) => e.getAttribute('data-id') === id);
      if (!canvas || !drawn) return;
      const c = canvas.getBoundingClientRect();
      const r = drawn.getBoundingClientRect();
      const view = rf.getViewport();
      const box = { x: (r.left - c.left - view.x) / view.zoom, y: (r.top - c.top - view.y) / view.zoom, width: r.width / view.zoom, height: r.height / view.zoom };
      const next = viewToClearPanel(box, view, { width: canvasWidth, height: canvasHeight });
      if (next) void rf.setViewport(next, { duration: 200 });
    }, PANEL_TUNING.settleMs);
    return () => window.clearTimeout(frame);
  }, [props.nodeId, moved, canvasWidth, canvasHeight, rf]);
  return null;
}

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
  /** node ids the first view fits to (a focus node, or the spec nodes). null fits everything. */
  fitNodeIds?: ReadonlyArray<string> | null;
  /** node whose edit panel is open, the view keeps it clear of the panel */
  clearPanelFor?: string | null;
  /** selection changes, so a live update can keep what the user picked */
  onNodesChange?: OnNodesChange;
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
    fitNodeIds = null,
    onNodesChange,
    clearPanelFor = null,
  } = props;
  const fitViewOptions = useMemo(
    () => (fitNodeIds && fitNodeIds.length > 0 ? { ...FIT_VIEW_OPTIONS, nodes: fitNodeIds.map((id) => ({ id })) } : FIT_VIEW_OPTIONS),
    [fitNodeIds],
  );

  // wires run under node bodies: boxes at the bottom, then wires, then the nodes in them
  const plan = useMemo(() => planWires(nodes, edges, viewBlock), [nodes, edges]);
  const wires = useMemo(() => plan.wires.map((w) => ({ ...w, zIndex: WIRE_TUNING.zWire })), [plan]);
  const stacked = useMemo(() => {
    const boxes = new Set(nodes.map((n) => n.parentId).filter((p): p is string => p !== undefined));
    return nodes.map((n) => ({ ...n, zIndex: boxes.has(n.id) ? WIRE_TUNING.zBox : WIRE_TUNING.zNode }));
  }, [nodes]);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const handleNodeEnter = useCallback<NodeMouseHandler>(
    (event, node) => {
      setHoverNode(node.id);
      onNodeMouseEnter?.(event, node);
    },
    [onNodeMouseEnter],
  );
  const handleNodeLeave = useCallback<NodeMouseHandler>(() => setHoverNode(null), []);

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
    <PinContext.Provider value={plan.pins}>
    <HoverNodeContext.Provider value={hoverNode}>
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={stacked}
        edges={wires}
        zIndexMode="manual"
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView={fitView}
        fitViewOptions={fitViewOptions}
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
        {...(onNodesChange ? { onNodesChange } : {})}
        onNodeMouseEnter={handleNodeEnter}
        onNodeMouseLeave={handleNodeLeave}
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
        <KeepInView nodeId={clearPanelFor} nodes={nodes} />
      </ReactFlow>
      {isGraphTransitioning ? <div style={TRANSITIONING_MESSAGE_STYLE}>Loading…</div> : null}
    </div>
    </HoverNodeContext.Provider>
    </PinContext.Provider>
  );
}
