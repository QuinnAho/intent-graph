// Lifted from claudemap/app/src/lib/layoutEngine.js @ claudemap@vendored.
// Adapted: TS strict. Public API is a single `runLayout(nodes, edges, options)`
// returning a positions array.
// License: MIT (see /claudemap/LICENSE). See LIFT_LOG.md for the full lift record.
//
// Worker posture (phase 2): runLayout calls ELK on the main thread. The
// elkjs bundled module ships its own GWT-compiled worker that it tries to
// spawn at construction time; nested-worker construction inside an ESM
// module worker fails in browsers (`_Worker is not a constructor`). The
// dedicated wrapper worker at ./elk.worker.ts is preserved as the phase-6
// entry point for when graph sizes climb past the main-thread budget; at
// L0 with ~600 nodes ELK runs in 100–300ms on the main thread, which is
// acceptable for a one-shot startup layout. Tech-spec §3.5 line 142
// ("ELK in a dedicated WebWorker") is the long-term posture; phase 6
// hardening will fix the nested-worker construction (likely by passing a
// real `workerFactory` that points at the elk-worker bundle).

import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';

import {
  type LayoutEdgeInput,
  type LayoutNodeInput,
  type LayoutOptions,
  type LayoutPosition,
} from './layout-protocol.js';

export type { LayoutEdgeInput, LayoutNodeInput, LayoutOptions, LayoutPosition };

const DEFAULT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '64',
  'elk.layered.spacing.nodeNodeBetweenLayers': '84',
  'elk.padding': '[top=30,left=30,bottom=30,right=30]',
  'org.eclipse.elk.portConstraints': 'FIXED_ORDER',
};

let elkSingleton: InstanceType<typeof ELK> | null = null;
function getElk(): InstanceType<typeof ELK> {
  if (elkSingleton) return elkSingleton;
  elkSingleton = new ELK();
  return elkSingleton;
}

function buildLayoutOptions(overrides: LayoutOptions['elkOptions'] | undefined): Record<string, string> {
  if (!overrides) return DEFAULT_OPTIONS;
  return { ...DEFAULT_OPTIONS, ...overrides };
}

export async function runLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  options?: LayoutOptions,
): Promise<LayoutPosition[]> {
  const elkChildren: ElkNode[] = nodes.map((node) => ({
    id: node.id,
    width: node.width,
    height: node.height,
  }));

  const elkEdges = edges.map((edge) => ({
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target],
  }));

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: buildLayoutOptions(options?.elkOptions),
    children: elkChildren,
    edges: elkEdges,
  };

  const result = await getElk().layout(graph);
  const placed = new Map<string, ElkNode>();
  for (const child of result.children ?? []) {
    placed.set(child.id, child);
  }

  return nodes.map((node) => {
    const elkNode = placed.get(node.id);
    return {
      id: node.id,
      x: elkNode?.x ?? 0,
      y: elkNode?.y ?? 0,
    };
  });
}

/**
 * Phase-2 stub: no worker to dispose because runLayout runs on the main
 * thread. Preserved as part of the public API so phase-6 hardening can
 * re-introduce the worker wrapper without touching call sites.
 */
export function disposeLayoutWorker(): void {
  elkSingleton = null;
}
