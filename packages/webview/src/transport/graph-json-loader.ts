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
}

interface GraphJsonEdge {
  readonly id: string;
  readonly src: string;
  readonly dst: string;
  readonly kind: string;
  readonly weight: number;
}

interface GraphJsonEnvelope {
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
}

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

  const { nodes, edges } = envelopeToReactFlow(envelope);

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

async function fetchGraphJson(url: string): Promise<GraphJsonEnvelope> {
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
function envelopeToReactFlow(envelope: GraphJsonEnvelope): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodeIds = new Set(envelope.nodes.map((n) => n.id));

  const nodes: Node[] = envelope.nodes.map((n) => {
    const baseData: Record<string, unknown> = {
      label: n.title,
      kind: n.kind,
      body: n.body,
      confidence: n.confidence,
    };
    const node: Node = {
      id: n.id,
      type: n.kind,
      position: { x: 0, y: 0 }, // ELK sets the real position in applyLayout
      data: baseData,
    };
    // Sub-flow parenting: only set parentId when the parent actually exists
    // in the node set. A dangling parent_id (parent stored in DB but absent
    // from the export) would otherwise crash React Flow's renderer.
    if (n.parent_id !== null && nodeIds.has(n.parent_id)) {
      (node as Node & { parentId?: string; extent?: 'parent' }).parentId = n.parent_id;
      (node as Node & { parentId?: string; extent?: 'parent' }).extent = 'parent';
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
  const layoutNodes: LayoutNodeInput[] = nodes.map((n) => {
    const size = getLayoutSize(n);
    return { id: n.id, width: size.width, height: size.height };
  });
  const layoutEdges: LayoutEdgeInput[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }));

  const positions = await runLayout(layoutNodes, layoutEdges);
  const positionMap = new Map<string, { x: number; y: number }>();
  for (const p of positions) {
    positionMap.set(p.id, { x: p.x, y: p.y });
  }

  return nodes.map((n) => {
    const pos = positionMap.get(n.id);
    if (!pos) return n;
    return { ...n, position: pos };
  });
}
