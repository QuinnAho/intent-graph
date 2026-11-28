// the live graph: the static export from build-graph plus realized_by edges,
// a check status on spec nodes, and anchor warnings on the node they belong to.

import type { InferProposalRow, LiveActivity, LiveCodeRef, LiveDrift, LiveInferred, NodeActivity } from '@intentgraph/shared/schemas';

import { toGraphJson, type BuildGraphResult } from '../build-graph.js';
import { parseAnchor, type NodeAnchors } from '../parser/spec-md/anchors.js';
import { activityMarks, type LaneFiles } from './activity-marks.js';
import { codePlace, codeRefs, findTarget } from './code-refs.js';
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
  body: unknown;
  readonly confidence: string;
  readonly parent_id: string | null;
  status?: CheckStatus;
  status_reasons?: ReadonlyArray<string>;
  warnings?: ReadonlyArray<string>;
  drift?: LiveDrift;
  /** set only on a proposal a model inferred from the code, not yet accepted */
  inferred?: LiveInferred;
  /** the lanes at work on this node, set only when one is */
  activity?: NodeActivity[];
  /** a declared spec node with realized_by: one entry per anchor, in the file's order (lane 13) */
  code?: LiveCodeRef[];
  /** a code node: its file as a path from the root */
  path?: string;
  /** a code symbol: its first line, counted from 1 */
  line?: number;
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
  /** the last segment of the root folder, for the bar (lane 17). never a full path. */
  readonly folder?: string;
  /** the lanes at work, set when the server reads activity */
  agents?: LiveActivity[];
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

/** the work in progress: one entry per lane, the paths each changed, and whether paths compare without case */
export interface LiveActivityInput {
  readonly agents: ReadonlyArray<LiveActivity>;
  readonly lanes: ReadonlyArray<LaneFiles>;
  readonly caseless: boolean;
}

/** lane 17: the last segment of the root, so the page can name the folder. never the full path. */
export function folderName(root: string): string {
  const parts = root.replace(/\\/g, '/').split('/').filter((p) => p.length > 0 && p !== '.');
  const last = parts[parts.length - 1] ?? '';
  // a drive root like "C:" names no folder
  return /^[A-Za-z]:$/.test(last) ? '' : last;
}

export function composeLiveGraph(
  result: BuildGraphResult,
  anchors: ReadonlyMap<string, NodeAnchors>,
  report: TestReport | null,
  root: string,
  drift: LiveDriftInput | null = null,
  infer: LiveInferInput | null = null,
  activity: LiveActivityInput | null = null,
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
    folder: folderName(root),
    problems: [...result.summary.errors.map(toProblem('error')), ...result.summary.warnings.map(toProblem('warning')), ...(drift?.problem ? [drift.problem] : []), ...(infer?.problem ? [infer.problem] : [])],
  };
  // a loop made by hand has no top to draw from, so say it once and name its files
  for (const ring of findParentLoops(graph.nodes)) {
    const files = ring.map((id) => toRelative((anchors.get(id) as { file?: string } | undefined)?.file ?? id, root));
    graph.problems.push({ severity: 'error', file: files[0]!, message: `parent loop, each of these is under the next: ${files.join(' -> ')} -> ${files[0]!}` });
  }
  const ids = new Set(graph.nodes.map((x) => x.id));
  const symbolIds = graph.nodes.filter((x) => x.kind === 'code_symbol').map((x) => x.id);
  // code nodes carry a path from the root, the absolute file uri never leaves the server
  const lines = new Map<string, number>();
  for (const node of graph.nodes) {
    const place = codePlace(node.id, node.body);
    if (!place) continue;
    node.path = place.path;
    if (place.line !== undefined) {
      node.line = place.line;
      lines.set(node.id, place.line);
    }
    if (node.body !== null && typeof node.body === 'object' && 'uri' in node.body) {
      const rest = { ...(node.body as Record<string, unknown>) };
      delete rest['uri'];
      node.body = rest;
    }
  }

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
    if (a && a.realizedBy.length > 0) node.code = codeRefs(a.realizedBy, ids, symbolIds, lines);
  }
  if (infer) addInferred(graph, infer.proposals, ids, symbolIds);
  if (activity) addActivity(graph, anchors, root, activity);
  return graph;
}

/** the agents list at the top, and on each node the lanes that touch it */
function addActivity(graph: LiveGraph, anchors: ReadonlyMap<string, NodeAnchors>, root: string, activity: LiveActivityInput): void {
  graph.agents = activity.agents.map((a) => ({ ...a }));
  if (activity.lanes.every((l) => l.paths.length === 0)) return;
  const specFiles = new Map<string, string>();
  const testFiles = new Map<string, string[]>();
  for (const [id, a] of anchors) {
    const file = (a as { file?: unknown }).file;
    if (typeof file === 'string') specFiles.set(id, toRelative(file, root));
    if (a.verifiedBy.length > 0) testFiles.set(id, a.verifiedBy.map((v) => v.path));
  }
  const marks = activityMarks({ nodes: graph.nodes, edges: graph.edges, specFiles, testFiles }, activity.lanes, activity.caseless);
  for (const node of graph.nodes) {
    const m = marks.get(node.id);
    if (m) node.activity = m;
  }
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
    const warnings: string[] = [];
    for (const raw of p.anchors) {
      const a = parseAnchor(raw);
      const target = a.ok ? findTarget(a.anchor.path, a.anchor.name, ids, symbolIds) : null;
      // same words a declared node gets for its realized_by, so the person sees it before accepting
      if (!a.ok || !target) {
        warnings.push(`realized_by: ${raw} is not in the graph`);
        continue;
      }
      if (a.anchor.name !== undefined && !target.startsWith('code_symbol:')) warnings.push(`realized_by: ${raw} symbol not found, linked to the file`);
      if (seen.has(target)) continue;
      seen.add(target);
      graph.edges.push({ id: `anchor:${target}->${id}`, src: target, dst: id, kind: 'realizes', weight: 1 });
    }
    if (warnings.length > 0) node.warnings = warnings;
  }
}

/** the anchors of a proposal that no node of the graph stands for, in the order given. a symbol whose file is there is found. */
export function missingAnchors(anchors: ReadonlyArray<string>, nodes: ReadonlyArray<{ readonly id: string; readonly kind: string }>): string[] {
  const ids = new Set(nodes.map((n) => n.id));
  const symbolIds = nodes.filter((n) => n.kind === 'code_symbol').map((n) => n.id);
  return anchors.filter((raw) => {
    const a = parseAnchor(raw);
    return !a.ok || findTarget(a.anchor.path, a.anchor.name, ids, symbolIds) === null;
  });
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
