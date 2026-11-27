// the live graph: the static export from build-graph plus realized_by edges,
// a check status on spec nodes, and anchor warnings on the node they belong to.

import { toGraphJson, type BuildGraphResult } from '../build-graph.js';
import type { NodeAnchors } from '../parser/spec-md/anchors.js';
import { mapCheckStatus, type CheckStatus, type TestReport } from './check-status.js';

const SPEC_KINDS = new Set(['intent', 'constraint', 'decision', 'concept']);

export interface LiveGraphNode {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly body: unknown;
  readonly confidence: string;
  readonly parent_id: string | null;
  status?: CheckStatus;
  status_reasons?: ReadonlyArray<string>;
  warnings?: ReadonlyArray<string>;
}

export interface LiveGraphEdge {
  readonly id: string;
  readonly src: string;
  readonly dst: string;
  readonly kind: string;
  readonly weight: number;
}

export interface LiveGraph {
  readonly _format: string;
  readonly _version: number;
  readonly nodes: LiveGraphNode[];
  readonly edges: LiveGraphEdge[];
  [key: string]: unknown;
}

export function composeLiveGraph(
  result: BuildGraphResult,
  anchors: ReadonlyMap<string, NodeAnchors>,
  report: TestReport | null,
  root: string,
): LiveGraph {
  const graph = JSON.parse(toGraphJson(result)) as LiveGraph;
  const ids = new Set(graph.nodes.map((x) => x.id));
  const symbolIds = graph.nodes.filter((x) => x.kind === 'code_symbol').map((x) => x.id);

  for (const node of graph.nodes) {
    if (!SPEC_KINDS.has(node.kind)) continue;
    const a = anchors.get(node.id);
    const check = mapCheckStatus(a?.verifiedBy ?? [], report, root);
    node.status = check.status;
    node.status_reasons = check.reasons;
    const warnings = [...(a?.warnings ?? [])];
    for (const r of a?.realizedBy ?? []) {
      const target = findTarget(r.path, r.name, ids, symbolIds);
      if (!target) {
        warnings.push(`realized_by: ${r.raw} is not in the graph`);
        continue;
      }
      if (r.name !== undefined && !target.startsWith('code_symbol:')) warnings.push(`realized_by: ${r.raw} symbol not found, linked to the file`);
      // stable id so a rebuild does not look like a topology change
      graph.edges.push({ id: `anchor:${target}->${node.id}`, src: target, dst: node.id, kind: 'realizes', weight: 1 });
    }
    if (warnings.length > 0) node.warnings = warnings;
  }
  return graph;
}

function findTarget(path: string, name: string | undefined, ids: ReadonlySet<string>, symbolIds: ReadonlyArray<string>): string | null {
  if (name !== undefined) {
    const prefix = `code_symbol:${path}#${name}#`;
    const hit = symbolIds.find((id) => id.startsWith(prefix));
    if (hit) return hit;
  }
  const mod = `code_module:${path}`;
  return ids.has(mod) ? mod : null;
}
