// Lifted from claudemap/app/src/components/graph/GraphCanvas.jsx @ claudemap@vendored.
// Adapted: TS strict, props-driven (nodes/edges/handlers passed in, no store reach-in),
// presentation-mode logic stripped, IntentGraph node/edge type maps, ELK readiness via
// a separate hook (use-elk-layout). License: MIT (see /claudemap/LICENSE).
// See docs/04 - Workflow/Lift Log.md for the full lift record.

import {
  Background,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnConnectStartParams,
  type OnNodesChange,
  type ReactFlowInstance,
  useReactFlow,
  useStore,
  type Viewport,
  type XYPosition,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';

import { openNodeMenu, openPaneMenu, openWireMenu, renameNode } from '../app/direct-edit-actions.js';
import { INFERRED_MENU_KIND, inferredOf } from '../app/inferred-model.js';
import { changeParent, refuseEdit } from '../app/wire-edit-actions.js';
import { boxUnder, dropOutcome, endsOf, lightedBox, whyNotParent, type Box } from './wire-edit-model.js';
import { useUiStore } from '../store/ui-slice.js';
import { SPEC_KINDS } from '../transport/live-source.js';
import { ContextMenu } from './ContextMenu.js';
import { HoverNodeContext, PinContext } from './edges/wire-context.js';
import { planWires } from './edges/wire-plan.js';
import { WireEdge } from './edges/WireEdge.js';
import { viewToClearPanel } from './keep-in-view.js';
import { dragHold } from './drag-hold.js';
import { calmHoverUntilMove } from './drop-calm.js';
import { EDIT_TIMING, FIT_TUNING, PANEL_TUNING, WIRE_EDIT_TUNING, WIRE_TUNING } from './view-tuning.js';
import { FOLD_BOX_KIND } from './fold-model.js';
import { isFitKey, shouldRefit, type Size } from './fit-model.js';
import { InferredFoldNode } from './nodes/FoldRow.js';

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
  [FOLD_BOX_KIND]: InferredFoldNode,
};

// spec nodes that can be dragged into another concept box. a concept box itself stays put,
// dragging one would carry everything inside it along.
const MOVABLE_KINDS: ReadonlySet<string> = new Set(['intent', 'constraint', 'decision']);

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
      if (!canvas) return;
      const view = rf.getViewport();
      let box: { x: number; y: number; width: number; height: number };
      if (drawn) {
        const c = canvas.getBoundingClientRect();
        const r = drawn.getBoundingClientRect();
        box = { x: (r.left - c.left - view.x) / view.zoom, y: (r.top - c.top - view.y) / view.zoom, width: r.width / view.zoom, height: r.height / view.zoom };
      } else {
        // a node far outside the view is not drawn at all (onlyRenderVisibleElements), so its box comes from the store
        const inner = rf.getInternalNode(id);
        const width = inner?.measured.width ?? inner?.width ?? node?.width;
        const height = inner?.measured.height ?? inner?.height ?? node?.height;
        if (!inner || !width || !height) return;
        box = { x: inner.internals.positionAbsolute.x, y: inner.internals.positionAbsolute.y, width, height };
      }
      const next = viewToClearPanel(box, view, { width: canvasWidth, height: canvasHeight });
      if (next) void rf.setViewport(next, { duration: 200 });
    }, PANEL_TUNING.settleMs);
    return () => window.clearTimeout(frame);
  }, [props.nodeId, moved, canvasWidth, canvasHeight, rf]);
  return null;
}

const FIT_VIEW_OPTIONS = { padding: FIT_TUNING.padding, maxZoom: FIT_TUNING.maxZoom, minZoom: FIT_TUNING.minZoom };

type FitOptions = typeof FIT_VIEW_OPTIONS & { nodes?: Array<{ id: string }> };

// fits again when the canvas changes size, unless the person moved the view since the last fit.
// F fits too, and after that a change of size fits again. lane 12.
function FitOnResize(props: { options: FitOptions; moved: { current: boolean } }): null {
  const rf = useReactFlow();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const last = useRef<Size | null>(null);
  const lastAt = useRef(0);
  const timer = useRef<number | null>(null);
  const optionsRef = useRef(props.options);
  optionsRef.current = props.options;
  const fit = useCallback((): void => {
    const opts = optionsRef.current;
    // ids that are folded away now are left out, the fit takes what is drawn
    const drawn = opts.nodes?.filter((n) => rf.getNode(n.id)?.hidden !== true && rf.getNode(n.id) !== undefined);
    void rf.fitView(drawn && drawn.length > 0 ? { ...opts, nodes: drawn } : { padding: opts.padding, maxZoom: opts.maxZoom, minZoom: opts.minZoom });
    props.moved.current = false;
    lastAt.current = Date.now();
    const store = document.querySelector('.react-flow')?.getBoundingClientRect();
    last.current = store ? { width: store.width, height: store.height } : null;
  }, [rf, props.moved]);
  // the first fit is the fitView prop, its size is the one to compare with
  useEffect(() => {
    if (last.current === null && width > 0 && height > 0) {
      last.current = { width, height };
      lastAt.current = Date.now();
      return undefined;
    }
    if (!shouldRefit({ last: last.current, now: { width, height }, moved: props.moved.current, thresholdPx: FIT_TUNING.refitPx })) return undefined;
    if (timer.current !== null) return undefined;
    const wait = Math.max(0, FIT_TUNING.refitMs - (Date.now() - lastAt.current));
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (!props.moved.current) fit();
    }, wait);
    return undefined;
  }, [width, height, fit, props.moved]);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target instanceof Element ? e.target : null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]') != null;
      if (!isFitKey(e, typing)) return;
      e.preventDefault();
      fit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fit]);
  return null;
}

// moves the view once when a concept folds or unfolds, so its header stays where it was on screen
function ApplyViewShift(): null {
  const rf = useReactFlow();
  const shift = useUiStore((s) => s.viewShift);
  const seen = useRef(shift?.seq ?? 0);
  useEffect(() => {
    if (!shift || shift.seq === seen.current) return;
    seen.current = shift.seq;
    const v = rf.getViewport();
    void rf.setViewport({ x: v.x - shift.dx * v.zoom, y: v.y - shift.dy * v.zoom, zoom: v.zoom });
  }, [shift, rf]);
  return null;
}

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

  const write = useUiStore((s) => s.editConfig.write);
  const selectedWire = useUiStore((s) => s.selectedWire);
  // the node a wire is being dragged from, so valid targets light up and the rest dim
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const connectFromRef = useRef<string | null>(null);
  connectFromRef.current = connectFrom;
  // where a dragged node is drawn while the pointer holds it. dropping clears it, so the node
  // goes back to its laid-out place and only a write followed by a live update moves it for good.
  const [dragAt, setDragAt] = useState<{ id: string; position: XYPosition } | null>(null);
  // the concept box a held node would land in, lit while it is over it
  const [dropBox, setDropBox] = useState<string | null>(null);
  // folded proposals are not drawn, and neither is a wire that ends on one
  const shownNodes = useMemo(() => nodes.filter((n) => n.hidden !== true), [nodes]);
  const shownEdges = useMemo(() => {
    const ids = new Set(shownNodes.map((n) => n.id));
    return edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  }, [shownNodes, edges]);
  const ends = useMemo(() => endsOf(nodes, edges), [nodes, edges]);
  const rfRef = useRef<ReactFlowInstance | null>(null);

  // wires run under node bodies: boxes at the bottom, then wires, then the nodes in them
  const plan = useMemo(() => planWires(shownNodes, shownEdges, viewBlock), [shownNodes, shownEdges]);
  const wires = useMemo(
    () => plan.wires.map((w) => ({ ...w, zIndex: WIRE_TUNING.zWire, selected: w.id === selectedWire })),
    [plan, selectedWire],
  );
  const stacked = useMemo(() => {
    const boxes = new Set(nodes.map((n) => n.parentId).filter((p): p is string => p !== undefined));
    return shownNodes.map((n) => {
      const out: Node = { ...n, zIndex: boxes.has(n.id) ? WIRE_TUNING.zBox : WIRE_TUNING.zNode };
      // a proposal is not a file yet, so it cannot be dragged into another concept
      const movable = n.type !== undefined && MOVABLE_KINDS.has(n.type) && inferredOf(n) === null;
      out.draggable = movable;
      // a node held by the pointer may leave its box, the drop decides where it belongs
      if (movable) delete out.extent;
      if (dragAt && dragAt.id === n.id) {
        out.position = dragAt.position;
        out.zIndex = WIRE_TUNING.zNode + 1;
        out.className = 'ig-held';
      }
      if (dropBox === n.id) out.className = 'ig-drop-ok';
      if (connectFrom && connectFrom !== n.id) out.className = whyNotParent(ends, connectFrom, n.id) === null ? 'ig-drop-ok' : 'ig-drop-dim';
      else if (connectFrom === n.id) out.className = 'ig-drop-from';
      return out;
    });
  }, [nodes, shownNodes, dragAt, connectFrom, dropBox, ends]);

  // only position changes of the held node are kept here, the rest go to the store as before
  const handleNodesChange = useCallback<OnNodesChange>(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === 'position' && c.position && c.dragging) setDragAt({ id: c.id, position: c.position });
      }
      const rest = changes.filter((c) => c.type !== 'position');
      if (rest.length > 0) onNodesChange?.(rest);
    },
    [onNodesChange],
  );

  // the concept box under the pointer, read from the rects of every drawn node in screen space,
  // so it is right while the view pans under a held node and while a graph update has the nodes
  // hidden for a moment (a hit test skips them, their rects stay true)
  const boxAt = useCallback(
    (event: { clientX: number; clientY: number }, dragged: string): { box: string | null } => {
      const boxes: Box[] = [];
      for (const nodeEl of document.querySelectorAll('.react-flow__node')) {
        const id = nodeEl.getAttribute('data-id');
        if (!id) continue;
        const r = nodeEl.getBoundingClientRect();
        boxes.push({ id, x: r.left, y: r.top, width: r.width, height: r.height });
      }
      return { box: boxUnder({ x: event.clientX, y: event.clientY }, boxes, dragged, ends) };
    },
    [ends],
  );
  const handleDragStart = useCallback((): void => dragHold.begin(), []);
  // while a node is held, light the box it would land in. the pointer is read on the window,
  // so this follows a pan under the pointer too
  const heldId = dragAt?.id ?? null;
  useEffect(() => {
    if (!heldId) return undefined;
    const onMove = (e: PointerEvent): void => setDropBox(lightedBox(ends, heldId, boxAt(e, heldId).box, write));
    window.addEventListener('pointermove', onMove, true);
    return () => window.removeEventListener('pointermove', onMove, true);
  }, [heldId, ends, boxAt, write]);
  const handleDragStop = useCallback(
    (event: MouseEvent, node: Node): void => {
      setDragAt(null);
      setDropBox(null);
      const at = boxAt(event, node.id);

      const outcome = dropOutcome(ends, node.id, at.box);
      if (outcome.kind === 'refuse') refuseEdit(outcome.reason);
      else if (outcome.kind === 'move') void changeParent(node.id, outcome.parent);
      // the request is on its way, a graph update held back during the drag may land now
      dragHold.end();
      calmHoverUntilMove();
    },
    [boxAt, ends],
  );

  const isValidConnection = useCallback(
    (c: Connection | Edge): boolean => c.source !== c.target && whyNotParent(ends, c.source, c.target) === null,
    [ends],
  );
  const handleConnectStart = useCallback((_: unknown, params: OnConnectStartParams): void => {
    useUiStore.getState().closeMenu();
    if (params.handleType === 'source' && params.nodeId) setConnectFrom(params.nodeId);
  }, []);
  const handleConnect = useCallback((c: Connection): void => {
    void changeParent(c.source, c.target);
  }, []);
  // a drop on a pin that takes the wire went to handleConnect. a drop on a node's body counts
  // the same as its pin, a node that cannot take it says why, and empty canvas writes nothing.
  const handleConnectEnd = useCallback(
    (event: globalThis.MouseEvent | TouchEvent, state: FinalConnectionState): void => {
      const from = connectFromRef.current;
      setConnectFrom(null);
      calmHoverUntilMove();
      if (!from || state.isValid) return;
      const p = 'changedTouches' in event ? event.changedTouches[0] : event;
      if (!p) return;
      const el = document.elementFromPoint(p.clientX, p.clientY)?.closest('.react-flow__node');
      const to = el?.getAttribute('data-id');
      if (!to || to === from) return;
      const why = whyNotParent(ends, from, to);
      if (why) refuseEdit(why);
      else void changeParent(from, to);
    },
    [ends],
  );
  const handleEdgeClick = useCallback((_: MouseEvent, edge: Edge): void => {
    useUiStore.getState().setSelectedWire(edge.id);
  }, []);
  const handleEdgeContext = useCallback((event: MouseEvent, edge: Edge): void => {
    event.preventDefault();
    openWireMenu(edge.id, { x: event.clientX, y: event.clientY });
  }, []);
  const handlePaneClick = useCallback(
    (event: MouseEvent): void => {
      useUiStore.getState().setSelectedWire(null);
      onPaneClick?.(event);
    },
    [onPaneClick],
  );
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const handleNodeEnter = useCallback<NodeMouseHandler>(
    (event, node) => {
      setHoverNode(node.id);
      onNodeMouseEnter?.(event, node);
    },
    [onNodeMouseEnter],
  );
  const handleNodeLeave = useCallback<NodeMouseHandler>(() => setHoverNode(null), []);

  // a double-click on a node never zooms. on a spec node's title it renames. on empty canvas it zooms as before.
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const drawn = graphLoaded && layoutReady;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    // the first click selects a node and the page redraws it for a moment, so the second click can land
    // on the box behind it. the title is remembered from the first click and matched by place and time.
    let lastTitle: { id: string; x: number; y: number; at: number } | null = null;
    const onClick = (e: globalThis.MouseEvent): void => {
      const target = e.target instanceof Element ? e.target : null;
      const title = target && !target.closest('textarea, input, button') ? target.closest('[data-node-title]') : null;
      const id = title?.closest('.react-flow__node')?.getAttribute('data-id');
      if (id) lastTitle = { id, x: e.clientX, y: e.clientY, at: e.timeStamp };
    };
    const onDouble = (e: globalThis.MouseEvent): void => {
      const target = e.target instanceof Element ? e.target : null;
      const nodeEl = target?.closest('.react-flow__node');
      if (!target || !nodeEl) return;
      e.stopPropagation();
      let id: string | null | undefined;
      if (target.closest('textarea, input, button')) return;
      if (target.closest('[data-node-title]')) id = nodeEl.getAttribute('data-id');
      else if (lastTitle && e.timeStamp - lastTitle.at <= EDIT_TIMING.doubleClickMs && Math.hypot(e.clientX - lastTitle.x, e.clientY - lastTitle.y) <= EDIT_TIMING.samePointPx) id = lastTitle.id;
      if (!id) return;
      const type = nodesRef.current.find((n) => n.id === id)?.type;
      if (type && SPEC_KINDS.has(type)) renameNode(id);
    };
    el.addEventListener('click', onClick, true);
    el.addEventListener('dblclick', onDouble, true);
    return () => {
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('dblclick', onDouble, true);
    };
  }, [drawn]);

  const handleNodeContext = useCallback<NodeMouseHandler>((event, node) => {
    if (!node.type || !SPEC_KINDS.has(node.type)) return;
    event.preventDefault();
    openNodeMenu(node.id, inferredOf(node) ? INFERRED_MENU_KIND : node.type, { x: event.clientX, y: event.clientY });
  }, []);
  const handlePaneContext = useCallback((event: MouseEvent | globalThis.MouseEvent): void => {
    event.preventDefault();
    openPaneMenu({ x: event.clientX, y: event.clientY });
  }, []);
  // only a move the person makes closes the menu, not the page keeping a node clear of the panel
  // a move the person makes also stops the fit again on a change of size, until F or the next fit
  const movedRef = useRef(false);
  const handleMoveStart = useCallback((event: unknown): void => {
    if (!event) return;
    movedRef.current = true;
    useUiStore.getState().closeMenu();
  }, []);

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
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={stacked}
        edges={wires}
        zIndexMode="manual"
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView={fitView}
        fitViewOptions={fitViewOptions}
        minZoom={FIT_TUNING.minZoom}
        nodesDraggable={!interactionLocked}
        nodesConnectable={write && !interactionLocked}
        nodeDragThreshold={WIRE_EDIT_TUNING.dragThresholdPx}
        connectionRadius={WIRE_EDIT_TUNING.connectRadiusPx}
        selectNodesOnDrag={false}
        deleteKeyCode={null}
        onInit={(rf) => {
          rfRef.current = rf as unknown as ReactFlowInstance;
        }}
        onNodesChange={handleNodesChange}
        onNodeDragStart={handleDragStart}
        onNodeDragStop={handleDragStop}
        isValidConnection={isValidConnection}
        onConnectStart={handleConnectStart}
        onConnect={handleConnect}
        onConnectEnd={handleConnectEnd}
        onEdgeClick={handleEdgeClick}
        onEdgeContextMenu={handleEdgeContext}
        onPaneClick={handlePaneClick}
        panOnScroll={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={!interactionLocked}
        onNodeContextMenu={handleNodeContext}
        onPaneContextMenu={handlePaneContext}
        onMoveStart={handleMoveStart}
        elementsSelectable={!interactionLocked}
        selectionOnDrag={!interactionLocked}
        onlyRenderVisibleElements
        onViewportChange={handleViewportChange}
        {...(onNodeClick ? { onNodeClick } : {})}
        onNodeMouseEnter={handleNodeEnter}
        onNodeMouseLeave={handleNodeLeave}
        {...(onPaneMouseMove ? { onPaneMouseMove } : {})}
        proOptions={{ hideAttribution: true }}
        style={{
          backgroundColor: 'var(--ig-canvas)',
          opacity: isGraphTransitioning ? 0.22 : 1,
          transition: 'opacity 0.18s ease',
        }}
      >
        <Background color="var(--ig-edge)" gap={40} size={1} />
        <KeepInView nodeId={clearPanelFor} nodes={nodes} />
        <ContextMenu fitViewOptions={FIT_VIEW_OPTIONS} />
        <FitOnResize options={fitViewOptions} moved={movedRef} />
        <ApplyViewShift />
      </ReactFlow>
      {isGraphTransitioning ? <div style={TRANSITIONING_MESSAGE_STYLE}>Loading…</div> : null}
    </div>
    </HoverNodeContext.Provider>
    </PinContext.Provider>
  );
}
