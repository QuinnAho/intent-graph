// L0 file-based loader: fetches `/graph.json` from the webview's static
// asset path, converts the build-graph export envelope into React Flow
// node/edge payloads, runs ELK layout in the worker, and dispatches into
// the Zustand graph store.
//
// Tech-spec §6 phase 2 line 443 makes this the L0 transport: "App reads
// graph.json (still file-based for L0)." Phase 3 (tech-spec §6 phase 3
// line 451) replaces this with the MCP messenger transport
// (../transport/messenger-client.ts), at which point the store's wire
// format stays the same — only the producer changes.
//
// Sub-flow parenting (p2-t09): nodes whose body indicates a `parent` (set
// by the spec parser when a frontmatter `parent` field is present, OR set
// by build-graph when a code_symbol belongs to a code_module) become React
// Flow children of that parent via `parentId` + `extent: 'parent'`. The
// React Flow renderer then draws the parent as a sub-flow boundary that
// contains its children.

import type { Edge, Node } from '@xyflow/react';

import { useGraphStore } from '../store/graph-slice.js';
import { runLayout, type LayoutNodeInput, type LayoutEdgeInput } from '../graph/layout/index.js';
import { getLayoutSize } from '../graph/layout/sizing.js';
import { idsInParentLoop } from '../graph/parent-loops.js';
import { layoutNested, parentsFirst, type Placement, type RunLayout } from '../graph/layout/nested.js';
import { LayoutCache, layoutKey } from '../graph/layout/layout-cache.js';
import { FOLD_TUNING, VIEW_TUNING } from '../graph/view-tuning.js';
import { FOLD_BOX_KIND, applyFold, foldKeyOf, foldOf, withoutFoldBox } from '../graph/fold-model.js';
import { inferredOf } from '../app/inferred-model.js';
import { applyNest, nestFootPx, nestOf, nestShape } from '../graph/nest-model.js';
import { useUiStore } from '../store/ui-slice.js';
import { mergeGraphUpdate } from './graph-merge.js';
import { SPEC_KINDS } from './live-source.js';
import { readProblems, useProblemsStore } from '../store/problems.js';

// lane 17: the folder's name the server adds to graph.json, a last segment only
export function readFolder(envelope: unknown): string | null {
  const f = (envelope as { folder?: unknown } | null)?.folder;
  return typeof f === 'string' && f.length > 0 && !/[\\/]/.test(f) ? f : null;
}

// The build-graph export envelope. Mirrors `toGraphJson()` in
// packages/skill/src/build-graph.ts. Kept as an inline type rather than a
// shared schema because the L0 export is a one-way artifact (CLAUDE.md
// hard rule "no JSON-as-storage" — this is JSON-as-export and is regenerated
// from the substrate every build).
interface GraphJsonNode {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly body: Record<string, unknown> | unknown;
  readonly confidence: string;
  readonly parent_id: string | null;
  // set by the live server (packages/skill/src/live/compose.ts)
  readonly status?: 'verified' | 'failed' | 'pending';
  readonly status_reasons?: ReadonlyArray<string>;
  readonly warnings?: ReadonlyArray<string>;
  readonly drift?: {
    readonly verdict: 'aligned' | 'drift' | 'unclear';
    readonly evidence: string;
    readonly suggested_action: string;
    readonly commit: string;
    readonly decided_by: string;
    readonly reported_at: string;
    readonly entries: number;
    readonly stale: boolean;
  };
  // a proposal a model inferred from the code, not yet accepted (lane 10)
  readonly inferred?: Record<string, unknown>;
  // lane 13: the code a declared spec node is bound to, and a code node's path from the root and line from 1
  readonly code?: ReadonlyArray<Record<string, unknown>>;
  readonly path?: string;
  readonly line?: number;
}

interface GraphJsonEdge {
  readonly id: string;
  readonly src: string;
  readonly dst: string;
  readonly kind: string;
  readonly weight: number;
}

export interface GraphJsonEnvelope {
  readonly _format: string;
  readonly _version: number;
  readonly nodes: ReadonlyArray<GraphJsonNode>;
  readonly edges: ReadonlyArray<GraphJsonEdge>;
}

const EXPECTED_FORMAT = 'intentgraph-l0-export';
const EXPECTED_VERSION = 1;

export interface LoadGraphOptions {
  /** Override the fetch URL. Default `/graph.json` (Vite dev server / static). */
  readonly url?: string;
  /** Test seam: bypass fetch and pass a payload directly. */
  readonly payload?: GraphJsonEnvelope;
  /** a node id to show on the first view (?focus=). a folded proposal unfolds its concept first. */
  readonly reveal?: string | null;
}

// the folds that are open now, from the ui store. a reload starts with none.
// the newest layout of each block. opening an intent leaves the code block as it was, so it is not laid out again.
const blockLayouts = new LayoutCache();

const openFolds = (): ReadonlySet<string> => useUiStore.getState().unfolded;

// the folds, then the intents opened to list their code (lane 13). both come from the ui store.
const decorate = (nodes: ReadonlyArray<Node>): Node[] => applyNest(applyFold(nodes, openFolds()), useUiStore.getState().nested);

/**
 * Fetch graph.json, convert to React Flow node/edge payloads, run layout,
 * and dispatch into the Zustand store. Resolves once layout is complete and
 * the store is in `status: 'ready'`. On any failure (fetch error, schema
 * mismatch, layout error), the store moves to `status: 'error'` with the
 * message preserved.
 */
export async function loadGraphFromJson(opts: LoadGraphOptions = {}): Promise<void> {
  const store = useGraphStore.getState();
  store.setLoading();

  let envelope: GraphJsonEnvelope;
  try {
    envelope = opts.payload ?? (await fetchGraphJson(opts.url ?? '/graph.json'));
  } catch (err) {
    useGraphStore.getState().setError(`graph.json fetch failed: ${(err as Error).message}`);
    return;
  }

  if (envelope._format !== EXPECTED_FORMAT) {
    useGraphStore.getState().setError(
      `graph.json _format mismatch: got "${envelope._format}", expected "${EXPECTED_FORMAT}"`,
    );
    return;
  }
  if (envelope._version !== EXPECTED_VERSION) {
    useGraphStore.getState().setError(
      `graph.json _version mismatch: got ${envelope._version}, expected ${EXPECTED_VERSION}`,
    );
    return;
  }

  const raw = envelopeToReactFlow(envelope);
  const edges = raw.edges;
  useProblemsStore.getState().setProblems(readProblems(envelope));
  useUiStore.getState().setFolder(readFolder(envelope));
  if (opts.reveal) {
    const hit = raw.nodes.find((n) => n.id === opts.reveal);
    const key = hit ? foldKeyOf(hit, new Set(raw.nodes.map((n) => n.id))) : null;
    if (key !== null) useUiStore.getState().openFold(key);
  }
  const nodes = decorate(raw.nodes);

  // Dispatch the un-laid-out graph first so the canvas can render placeholders;
  // ELK populates positions in a second pass. This avoids a blank canvas
  // during the layout round-trip on large graphs.
  useGraphStore.getState().setGraph(nodes, edges);

  try {
    const positioned = await applyLayout(nodes, edges);
    useGraphStore.getState().setGraph(positioned, edges);
    useGraphStore.getState().setLayoutReady(true);
  } catch (err) {
    useGraphStore.getState().setError(`layout failed: ${(err as Error).message}`);
  }
}

/**
 * Apply a live update without a reload. Keeps positions and selection when no
 * node or edge was added or removed, otherwise lays the graph out again. The
 * store stays ready throughout, so the canvas and its viewport stay mounted.
 */
export async function applyGraphUpdate(envelope: GraphJsonEnvelope): Promise<boolean> {
  if (envelope._format !== EXPECTED_FORMAT || envelope._version !== EXPECTED_VERSION) return false;
  const { nodes, edges } = envelopeToReactFlow(envelope);
  useProblemsStore.getState().setProblems(readProblems(envelope));
  useUiStore.getState().setFolder(readFolder(envelope));
  const prev = useGraphStore.getState();
  // the merge compares what the server sent, so the root fold box is left out on both sides
  const merged = mergeGraphUpdate(withoutFoldBox(prev.nodes), prev.edges, nodes, edges);
  const folded = decorate(merged.nodes);
  // a fold row that came or went changes a concept's size, so that needs a layout too. so does an open intent whose code changed.
  const rowsMoved = foldShape(prev.nodes) !== foldShape(folded) || nestShape(prev.nodes) !== nestShape(folded);
  const placed = merged.needsLayout || rowsMoved ? await applyLayout(folded, edges) : keepBoxPlace(prev.nodes, folded);
  useGraphStore.getState().setGraph(placed, edges);
  return true;
}

/** which folds have a row and which are open, as one string to compare */
function foldShape(nodes: ReadonlyArray<Node>): string {
  return nodes
    .map((n) => foldOf(n))
    .filter((f) => f !== null)
    .map((f) => `${f!.key}:${f!.count > 0 ? 1 : 0}:${f!.open ? 1 : 0}`)
    .sort()
    .join('|');
}

// the root box is made again on every update, it keeps the place the layout gave it
function keepBoxPlace(prev: ReadonlyArray<Node>, next: Node[]): Node[] {
  const old = prev.find((n) => n.type === FOLD_BOX_KIND);
  if (!old) return next;
  return next.map((n) => (n.type === FOLD_BOX_KIND ? { ...n, position: old.position, ...(old.width !== undefined ? { width: old.width } : {}), ...(old.height !== undefined ? { height: old.height } : {}) } : n));
}

/** lay the graph out again after a fold opened or closed. the store stays ready throughout. */
export async function refold(): Promise<void> {
  const s = useGraphStore.getState();
  const folded = decorate(s.nodes);
  const placed = await applyLayout(folded, s.edges);
  // a live update may have landed while the layout ran, then that one wins
  if (useGraphStore.getState().nodes !== s.nodes) return;
  useGraphStore.getState().setGraph(placed, s.edges);
}

export async function fetchGraphJson(url: string): Promise<GraphJsonEnvelope> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as GraphJsonEnvelope;
}

/**
 * Convert the export envelope's nodes/edges into React Flow shapes.
 *
 * Sub-flow parenting (p2-t09):
 *   - A node's `parent_id` becomes `node.parentId` in React Flow.
 *   - When `parentId` is set, `extent: 'parent'` is also set so the child
 *     stays inside the parent's bounds when dragged (per tech-spec §3.5
 *     line 141 "sub-flows for concept boundaries (`extent: 'parent'`)").
 *   - The parent node's React Flow `type` is unchanged — concept nodes
 *     still render via ConceptNode.tsx; the sub-flow boundary is implicit
 *     in the parent-child relationship plus React Flow's own renderer.
 */
export function envelopeToReactFlow(envelope: GraphJsonEnvelope): {
  nodes: Node[];
  edges: Edge[];
} {
  // Map id → kind so sub-flow parenting can check the parent's kind, not
  // just its existence. parent_id is concept-boundary-only per tech-spec
  // §4.1 line 179; the renderer enforces that here as a belt-and-braces
  // check against future producers re-overloading parent_id (see
  // packages/skill/src/build-graph.ts where the walker keeps symbol
  // parentId null and uses a contain edge instead).
  const nodeKindById = new Map(envelope.nodes.map((n) => [n.id, n.kind]));
  const looped = idsInParentLoop(envelope.nodes);

  const nodes: Node[] = envelope.nodes.map((n) => {
    const baseData: Record<string, unknown> = {
      label: n.title,
      kind: n.kind,
      body: n.body,
      confidence: n.confidence,
    };
    if (n.status !== undefined) baseData['checkStatus'] = n.status;
    if (n.status_reasons !== undefined && n.status_reasons.length > 0) baseData['statusReasons'] = n.status_reasons;
    if (n.warnings !== undefined && n.warnings.length > 0) baseData['warnings'] = n.warnings;
    if (n.drift !== undefined) baseData['drift'] = n.drift;
    if (n.inferred !== undefined) baseData['inferred'] = n.inferred;
    if (n.code !== undefined && n.code.length > 0) baseData['code'] = n.code;
    if (n.path !== undefined) baseData['path'] = n.path;
    if (n.line !== undefined) baseData['line'] = n.line;
    const node: Node = {
      id: n.id,
      type: n.kind,
      position: { x: 0, y: 0 }, // ELK sets the real position in applyLayout
      data: baseData,
    };
    // Sub-flow parenting (per tech-spec §3.5 line 141): set parentId +
    // extent:'parent' only when the parent exists in this envelope AND is
    // a concept node. A dangling parent_id (parent stored in DB but absent
    // from the export) would crash React Flow's renderer; a non-concept
    // parent would invoke React Flow's sub-flow rendering on a relationship
    // that isn't supposed to be a visual container (e.g. module→symbol).
    if (n.parent_id !== null && !looped.has(n.id)) {
      const parentKind = nodeKindById.get(n.parent_id);
      if (parentKind === 'concept') {
        (node as Node & { parentId?: string; extent?: 'parent' }).parentId = n.parent_id;
        (node as Node & { parentId?: string; extent?: 'parent' }).extent = 'parent';
      }
    }
    return node;
  });

  // De-duplicate edges to satisfy React Flow's id-uniqueness invariant. The
  // build-graph step ULIDs each edge, so duplicates should not arise — but
  // belt-and-suspenders against future producers.
  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (const e of envelope.edges) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    edges.push({
      id: e.id,
      source: e.src,
      target: e.dst,
      type: undefined,
      data: { kind: e.kind, weight: e.weight },
    });
  }

  return { nodes, edges };
}

/**
 * Run ELK layout against the node/edge set and return nodes with positions
 * populated. Sizes come from the per-kind sizing registry in
 * graph/layout/sizing.ts; missing sizes default to a sensible 200×60.
 */
async function applyLayout(nodes: ReadonlyArray<Node>, edges: ReadonlyArray<Edge>): Promise<Node[]> {
  // spec nodes get their own block above the code, so the first view can show
  // them without hunting through hundreds of code nodes. edges that cross the
  // two blocks (code realizes intent) are drawn but not laid out.
  // the root fold box sits with the spec. folded proposals are not laid out at all.
  const isSpec = (n: Node): boolean => n.type !== undefined && (SPEC_KINDS.has(n.type) || n.type === FOLD_BOX_KIND);
  const shown = nodes.filter((n) => n.hidden !== true);
  const groups = [shown.filter(isSpec), shown.filter((n) => !isSpec(n))];
  // the fold row at a concept's foot, and unfolded proposals below the declared children
  const nestedOpts = {
    footOf: (n: Node): number => (n.type === 'concept' ? ((foldOf(n)?.count ?? 0) > 0 ? FOLD_TUNING.rowPx + FOLD_TUNING.rowGapPx : 0) : nestFootPx(n)),
    bandOf: (n: Node): number => (inferredOf(n) !== null || n.type === FOLD_BOX_KIND ? 1 : 0),
    bandGap: FOLD_TUNING.bandGap,
  };

  // spec nodes render at the width the layout gave them, so a long title
  // ellipsises instead of pushing the status mark past its concept's border
  const sizeOf = (n: Node): { width: number; height: number } => {
    if (n.type === FOLD_BOX_KIND) return { width: FOLD_TUNING.boxWidth, height: FOLD_TUNING.boxHeight };
    return isSpec(n) ? { width: VIEW_TUNING.specNodeWidth, height: getLayoutSize(n).height } : getLayoutSize(n);
  };

  const placed = new Map<string, Placement>();
  let offsetY = 0;
  for (const [slot, group] of groups.entries()) {
    if (group.length === 0) continue;
    const ids = new Set(group.map((n) => n.id));
    const run: RunLayout = (layoutNodes: LayoutNodeInput[], layoutEdges: LayoutEdgeInput[]) => runLayout(layoutNodes, layoutEdges);
    const inner = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const key = layoutKey(group, inner, sizeOf, nestedOpts);
    const groupPlaced = blockLayouts.get(String(slot), key) ?? (await layoutNested(group, inner, sizeOf, run, VIEW_TUNING, nestedOpts));
    blockLayouts.set(String(slot), key, groupPlaced);
    let bottom = offsetY;
    for (const n of group) {
      const p = groupPlaced.get(n.id);
      if (!p) continue;
      const topLevel = n.parentId === undefined || !ids.has(n.parentId);
      const position = topLevel ? { x: p.position.x, y: p.position.y + offsetY } : p.position;
      placed.set(n.id, p.size ? { position, size: p.size } : { position });
      if (topLevel) bottom = Math.max(bottom, position.y + (p.size ?? sizeOf(n)).height);
    }
    offsetY = bottom + VIEW_TUNING.specCodeGap;
  }

  return parentsFirst(
    nodes.map((n) => {
      const p = placed.get(n.id);
      if (!p) return n;
      // an open intent is as tall as its rows, the layout only reserves room for it, so no spare room shows at its foot
      if (p.size && nestOf(n)?.open) {
        const open: Node = { ...n, position: p.position, width: p.size.width };
        delete open.height;
        return open;
      }
      if (p.size) return { ...n, position: p.position, width: p.size.width, height: p.size.height };
      if (!isSpec(n)) return { ...n, position: p.position };
      // a node that was open had its height from the layout, closed it takes its own height again
      const closed: Node = { ...n, position: p.position, width: sizeOf(n).width };
      delete closed.height;
      return closed;
    }),
  );
}
