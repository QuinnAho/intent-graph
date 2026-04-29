// Lifted from claudemap/app/src/lib/layoutEngine.js @ claudemap@vendored.
// Adapted: TS strict, runs inside a Vite Web Worker (off main thread; ClaudeMap
// ran ELK on the main thread). Single message protocol: { id, nodes, edges, options }
// in, { id, positions } or { id, error } out. License: MIT (see /claudemap/LICENSE).
// See LIFT_LOG.md for the full lift record.
//
// Worker scope: this file is a Vite-bundled ESM worker — `import.meta.url`
// resolves under the worker URL, and `self` is the DedicatedWorkerGlobalScope.
// We import elkjs's bundled module here. The bundled module's default
// constructor would normally spawn a Worker of its own for the GWT-compiled
// ELK core; that nested-worker construction is what the runLayout call
// site avoids by short-circuiting in the wrapper (see graph/layout/index.ts).
// At phase 2, runLayout calls ELK directly on the main thread — this file
// remains the worker-friendly entry point for phase 6 hardening when
// graph sizes climb past the main-thread budget.

/// <reference lib="webworker" />

import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';

import {
  type LayoutEdgeInput,
  type LayoutNodeInput,
  type LayoutOptions,
  type LayoutPosition,
  type LayoutWorkerRequest,
  type LayoutWorkerResponse,
} from './layout-protocol.js';

const elk = new ELK();

const DEFAULT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '64',
  'elk.layered.spacing.nodeNodeBetweenLayers': '84',
  'elk.padding': '[top=30,left=30,bottom=30,right=30]',
  'org.eclipse.elk.portConstraints': 'FIXED_ORDER',
};

function buildLayoutOptions(overrides: LayoutOptions['elkOptions'] | undefined): Record<string, string> {
  if (!overrides) return DEFAULT_OPTIONS;
  return { ...DEFAULT_OPTIONS, ...overrides };
}

async function runLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  options: LayoutOptions | undefined,
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

  const result = await elk.layout(graph);
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

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (event: MessageEvent<LayoutWorkerRequest>) => {
  const { id, nodes, edges, options } = event.data;
  void runLayout(nodes, edges, options).then(
    (positions) => {
      const response: LayoutWorkerResponse = { id, positions };
      ctx.postMessage(response);
    },
    (err: unknown) => {
      const response: LayoutWorkerResponse = {
        id,
        error: err instanceof Error ? err.message : String(err),
      };
      ctx.postMessage(response);
    },
  );
});
