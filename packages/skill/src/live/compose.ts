// the live graph: the static export from build-graph plus realized_by edges,
// a check status on spec nodes, and anchor warnings on the node they belong to.

import type { InferProposalRow, LiveDrift, LiveInferred } from '@intentgraph/shared/schemas';

import { toGraphJson, type BuildGraphResult } from '../build-graph.js';
import { parseAnchor, type NodeAnchors } from '../parser/spec-md/anchors.js';
import { mapCheckStatus, toRelative, type CheckStatus, type TestReport } from './check-status.js';
import { inferredNodeId, liveInferred } from './infer-marks.js';
import { findParentLoops } from './parent-rules.js';

// a file the parser rejected or warned about. a rejected file has no node, so
// this list is the only place it shows up.
export interface LiveProblem {
  readonly severity: 'error' | 'warning';
  readonly file: string;
  readonly message: string;
}

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
  drift?: LiveDrift;
  /** set only on a proposal a model inferred from the code, not yet accepted */
  inferred?: LiveInferred;
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
  readonly problems: LiveProblem[];
  [key: string]: unknown;
}

/** what the newest drift report says: a mark per node id, and a problem when the report is unusable */
export interface LiveDriftInput {
  readonly marks: ReadonlyMap<string, LiveDrift>;
  readonly problem: LiveProblem | null;
}

/** the open proposals of the newest inference report, and a problem when the report is unusable */
export interface LiveInferInput {
  readonly proposals: ReadonlyArray<InferProposalRow>;
  readonly problem: LiveProblem | null;
}

export function composeLiveGraph(
  result: BuildGraphResult,
  anchors: ReadonlyMap<string, NodeAnchors>,
  report: TestReport | null,
  root: string,
  drift: LiveDriftInput | null = null,
  infer: LiveInferInput | null = null,
): LiveGraph {
  const parsed = JSON.parse(toGraphJson(result)) as LiveGraph;
  const toProblem = (severity: LiveProblem['severity']) => (p: { readonly file: string; readonly message: string }): LiveProblem => ({
    severity,
    file: toRelative(p.file, root),
    // js-yaml appends a code snippet after the first line, the first line says enough
    message: p.message.split(/\r?\n/)[0]!.trim(),
  });
  const graph: LiveGraph = {
    ...parsed,
    problems: [...result.summary.errors.map(toProblem('error')), ...result.summary.warnings.map(toProblem('warning')), ...(drift?.problem ? [drift.problem] : []), ...(infer?.problem ? [infer.problem] : [])],
  };
  // a loop made by hand has no top to draw from, so say it once and name its files
  for (const ring of findParentLoops(graph.nodes)) {
    const files = ring.map((id) => toRelative((anchors.get(id) as { file?: string } | undefined)?.file ?? id, root));
    graph.problems.push({ severity: 'error', file: files[0]!, message: `parent loop, each of these is under the next: ${files.join(' -> ')} -> ${files[0]!}` });
  }
  const ids = new Set(graph.nodes.map((x) => x.id));
  const symbolIds = graph.nodes.filter((x) => x.kind === 'code_symbol').map((x) => x.id);

  for (const node of graph.nodes) {
    if (!SPEC_KINDS.has(node.kind)) continue;
    const a = anchors.get(node.id);
    const check = mapCheckStatus(a?.verifiedBy ?? [], report, root);
    node.status = check.status;
    node.status_reasons = check.reasons;
    const mark = drift?.marks.get(node.id);
    if (mark) node.drift = mark;
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
  if (infer) addInferred(graph, infer.proposals, ids, symbolIds);
  return graph;
}

/** each open proposal as an intent node marked inferred, under its concept, with realizes edges from the code it cites */
function addInferred(graph: LiveGraph, proposals: ReadonlyArray<InferProposalRow>, ids: ReadonlySet<string>, symbolIds: ReadonlyArray<string>): void {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const p of proposals) {
    const id = inferredNodeId(p);
    if (byId.has(id)) continue;
    const concept = p.belongs_under !== null && byId.get(p.belongs_under)?.kind === 'concept' ? p.belongs_under : null;
    const restated = p.restates !== null ? byId.get(p.restates) : undefined;
    const node: LiveGraphNode = { id, kind: 'intent', title: p.title, body: p.body, confidence: p.confidence, parent_id: concept, inferred: liveInferred(p, restated?.title ?? null) };
    graph.nodes.push(node);
    byId.set(id, node);
    const seen = new Set<string>();
    for (const raw of p.anchors) {
      const a = parseAnchor(raw);
      if (!a.ok) continue;
      const target = findTarget(a.anchor.path, a.anchor.name, ids, symbolIds);
      if (!target || seen.has(target)) continue;
      seen.add(target);
      graph.edges.push({ id: `anchor:${target}->${id}`, src: target, dst: id, kind: 'realizes', weight: 1 });
    }
  }
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

/** what changed between two problem lists, so the log names each problem once */
export function diffProblems(before: ReadonlyArray<LiveProblem>, after: ReadonlyArray<LiveProblem>): { added: LiveProblem[]; fixed: string[] } {
  const key = (p: LiveProblem): string => `${p.severity}|${p.file}|${p.message}`;
  const had = new Set(before.map(key));
  const added = after.filter((p) => !had.has(key(p)));
  const files = new Set(after.map((p) => p.file));
  const fixed = [...new Set(before.map((p) => p.file))].filter((file) => !files.has(file));
  return { added, fixed };
}
