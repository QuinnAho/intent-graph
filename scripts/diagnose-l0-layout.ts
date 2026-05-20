// One-off diagnostic for Item 7 readiness: where do spec nodes land in the
// L0 ELK layout relative to the code-module clusters? Helps the human picking
// a target intent and understanding why the default viewport feels arbitrary.
//
// Not part of the build pipeline. Safe to delete after Phase 2 closes.

import { readFileSync } from 'node:fs';

import {
  runLayout,
  type LayoutEdgeInput,
  type LayoutNodeInput,
} from '../packages/webview/src/graph/layout/index.js';

interface ExportNode {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly parent_id: string | null;
}
interface ExportEdge {
  readonly id: string;
  readonly src: string;
  readonly dst: string;
  readonly kind: string;
}
interface Envelope {
  readonly nodes: readonly ExportNode[];
  readonly edges: readonly ExportEdge[];
}

function sizeFor(kind: string): { width: number; height: number } {
  if (kind === 'intent') return { width: 240, height: 76 };
  if (kind === 'concept') return { width: 320, height: 120 };
  if (kind === 'constraint') return { width: 220, height: 76 };
  if (kind === 'code_module') return { width: 200, height: 64 };
  if (kind === 'code_symbol') return { width: 180, height: 56 };
  return { width: 180, height: 80 };
}

async function main(): Promise<void> {
  const d = JSON.parse(readFileSync('.intentgraph/graph.json', 'utf8')) as Envelope;

  const nodes: LayoutNodeInput[] = d.nodes.map((n) => ({
    id: n.id,
    ...sizeFor(n.kind),
  }));
  const edges: LayoutEdgeInput[] = d.edges
    .filter((e) => e.src && e.dst)
    .map((e) => ({ id: e.id, source: e.src, target: e.dst }));

  console.log(`[diagnose] running layout on ${nodes.length} nodes / ${edges.length} edges...`);
  const t0 = process.hrtime.bigint();
  const positioned = await runLayout(nodes, edges);
  const t1 = process.hrtime.bigint();
  console.log(`[diagnose] layout done in ${(Number(t1 - t0) / 1e6).toFixed(0)}ms`);
  console.log();

  const kindOf = new Map<string, string>(d.nodes.map((n) => [n.id, n.kind]));
  const titleOf = new Map<string, string>(d.nodes.map((n) => [n.id, n.title]));

  // Per-kind bounding boxes
  const byKind: Record<string, { xs: number[]; ys: number[]; count: number }> = {};
  for (const p of positioned) {
    const kind = kindOf.get(p.id);
    if (!kind) continue;
    if (!byKind[kind]) byKind[kind] = { xs: [], ys: [], count: 0 };
    byKind[kind]!.xs.push(p.x);
    byKind[kind]!.ys.push(p.y);
    byKind[kind]!.count += 1;
  }

  console.log('=== layout bounding boxes per kind (ELK output coords; x→right, y↓down) ===');
  console.log('kind          n     x_min    x_max    y_min    y_max  span_x  span_y');
  console.log('----          --    -----    -----    -----    -----  ------  ------');
  const order = ['concept', 'intent', 'constraint', 'code_module', 'code_symbol'];
  for (const k of order) {
    const v = byKind[k];
    if (!v) continue;
    const xMin = Math.min(...v.xs);
    const xMax = Math.max(...v.xs);
    const yMin = Math.min(...v.ys);
    const yMax = Math.max(...v.ys);
    console.log(
      k.padEnd(14) +
        String(v.count).padStart(3) +
        '   ' +
        String(Math.round(xMin)).padStart(6) +
        '   ' +
        String(Math.round(xMax)).padStart(6) +
        '   ' +
        String(Math.round(yMin)).padStart(6) +
        '   ' +
        String(Math.round(yMax)).padStart(6) +
        '   ' +
        String(Math.round(xMax - xMin)).padStart(5) +
        '   ' +
        String(Math.round(yMax - yMin)).padStart(5),
    );
  }

  console.log();
  console.log('=== 12 intent positions (sorted by y then x) ===');
  const intentPositions = positioned
    .filter((p) => kindOf.get(p.id) === 'intent')
    .sort((a, b) => a.y - b.y || a.x - b.x);
  for (const p of intentPositions) {
    console.log(
      '  x=' +
        String(Math.round(p.x)).padStart(5) +
        ' y=' +
        String(Math.round(p.y)).padStart(5) +
        '  ' +
        p.id.padEnd(48) +
        '  ' +
        (titleOf.get(p.id) ?? ''),
    );
  }

  console.log();
  console.log('=== specific target candidate: intent-graph-state-survives-crashes ===');
  const tgt = positioned.find((p) => p.id === 'intent-graph-state-survives-crashes');
  if (tgt) {
    console.log(`  position: x=${Math.round(tgt.x)}, y=${Math.round(tgt.y)}`);
    console.log(`  title:    "${titleOf.get(tgt.id)}"`);
    // What's nearby (within 400px)?
    const nearby = positioned
      .filter((p) => p.id !== tgt.id)
      .map((p) => ({ id: p.id, kind: kindOf.get(p.id) ?? '?', dx: p.x - tgt.x, dy: p.y - tgt.y, dist: Math.hypot(p.x - tgt.x, p.y - tgt.y) }))
      .filter((n) => n.dist < 400)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 8);
    console.log(`  nearby (<400px), sorted by distance:`);
    for (const n of nearby) {
      console.log(`    ${String(Math.round(n.dist)).padStart(4)}px  ${n.kind.padEnd(12)}  ${n.id}`);
    }
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`[diagnose] FATAL: ${(err as Error).message}\n`);
  if (err instanceof Error && err.stack) process.stderr.write(err.stack + '\n');
  process.exit(1);
});
