// Risk-C spike, step 2 (p2-t13) — N-iteration bench wrapper around runSpike()
// from spike-elk-5k-runner.ts. Reports p50/p95/p99 plus mean/min/max for two
// graphs: the 5k synthesized harness (Risk-C scale) and the L0 dogfood seed
// (current real-world scale).
//
// Posture note (also in docs/spikes/elk-5k-results.md): ELK runs on the
// main thread, not in a dedicated worker. The original p2-t13 task notes
// were written against the worker posture; the recommendation in
// elk-5k-results.md is reframed against actual L0 posture.
//
// Usage:
//   pnpm tsx scripts/spike-elk-bench.ts                   # both graphs, N=20
//   pnpm tsx scripts/spike-elk-bench.ts --runs 50         # tighten p99
//   pnpm tsx scripts/spike-elk-bench.ts --only spike      # 5k harness only
//   pnpm tsx scripts/spike-elk-bench.ts --only dogfood    # L0 seed only

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  runLayout,
  type LayoutEdgeInput,
  type LayoutNodeInput,
} from '../packages/webview/src/graph/layout/index.js';

import { synthesize, type SpikeGraph } from './spike-elk-5k.js';

interface BenchSummary {
  readonly label: string;
  readonly nodes: number;
  readonly edges: number;
  readonly runs: number;
  readonly warmup: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly samples: readonly number[];
}

async function timeOnce(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[]): Promise<number> {
  const start = process.hrtime.bigint();
  await runLayout(nodes, edges);
  const end = process.hrtime.bigint();
  return Number(end - start) / 1_000_000;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const frac = idx - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

async function bench(
  label: string,
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  runs: number,
  warmup: number,
): Promise<BenchSummary> {
  process.stdout.write(`[bench] ${label}: ${nodes.length} nodes / ${edges.length} edges, warmup=${warmup}, runs=${runs}\n`);
  for (let i = 0; i < warmup; i += 1) {
    await timeOnce(nodes, edges);
    process.stdout.write(`[bench]   warmup ${i + 1}/${warmup}\n`);
  }
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const ms = await timeOnce(nodes, edges);
    samples.push(ms);
    process.stdout.write(`[bench]   run ${i + 1}/${runs}: ${ms.toFixed(1)}ms\n`);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((acc, v) => acc + v, 0);
  return {
    label,
    nodes: nodes.length,
    edges: edges.length,
    runs,
    warmup,
    mean: sum / samples.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    samples,
  };
}

function fromSpikeGraph(graph: SpikeGraph): { nodes: LayoutNodeInput[]; edges: LayoutEdgeInput[] } {
  return {
    nodes: graph.nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
    edges: graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };
}

interface DogfoodNode {
  readonly id: string;
  readonly kind?: string;
}
interface DogfoodEdge {
  readonly id?: string;
  readonly src?: string;
  readonly source?: string;
  readonly dst?: string;
  readonly target?: string;
}
interface DogfoodGraph {
  readonly nodes: readonly DogfoodNode[];
  readonly edges: readonly DogfoodEdge[];
}

function fromDogfoodGraph(graph: DogfoodGraph): { nodes: LayoutNodeInput[]; edges: LayoutEdgeInput[] } {
  // Default node sizing matches the spike harness (180×80) so the two runs
  // are layout-comparable. Real webview rendering uses kind-aware sizes from
  // packages/webview/src/graph/layout/sizing.ts; the spike is for ELK time
  // alone, so a uniform size is acceptable and is what spike-elk-5k.ts uses.
  const nodes = graph.nodes.map((n) => ({ id: n.id, width: 180, height: 80 }));
  const edges = graph.edges
    .filter((e) => (e.src ?? e.source) && (e.dst ?? e.target))
    .map((e, i) => ({
      id: e.id ?? `e-${i}`,
      source: (e.src ?? e.source)!,
      target: (e.dst ?? e.target)!,
    }));
  return { nodes, edges };
}

interface CliArgs {
  runs: number;
  warmup: number;
  only: 'both' | 'spike' | 'dogfood';
  spikeFixture: string;
  dogfoodFixture: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const out: CliArgs = {
    runs: 20,
    warmup: 3,
    only: 'both',
    spikeFixture: resolve(process.cwd(), '.intentgraph/spike-elk-5k.json'),
    dogfoodFixture: resolve(process.cwd(), '.intentgraph/graph.json'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case '--runs':
        out.runs = Number(argv[++i] ?? '20');
        break;
      case '--warmup':
        out.warmup = Number(argv[++i] ?? '3');
        break;
      case '--only': {
        const v = argv[++i] ?? 'both';
        if (v !== 'both' && v !== 'spike' && v !== 'dogfood') {
          process.stderr.write(`--only must be one of: both | spike | dogfood\n`);
          process.exit(64);
        }
        out.only = v;
        break;
      }
      case '--spike-fixture':
        out.spikeFixture = resolve(argv[++i] ?? '');
        break;
      case '--dogfood-fixture':
        out.dogfoodFixture = resolve(argv[++i] ?? '');
        break;
      case '-h':
      case '--help':
        process.stdout.write(
          `Usage: pnpm tsx scripts/spike-elk-bench.ts [--runs N] [--warmup N] [--only both|spike|dogfood] [--spike-fixture path] [--dogfood-fixture path]\n`,
        );
        process.exit(0);
        break;
      default:
        if (a && a.startsWith('-')) {
          process.stderr.write(`unknown flag: ${a}\n`);
          process.exit(64);
        }
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const summaries: BenchSummary[] = [];

  if (args.only === 'both' || args.only === 'spike') {
    const graph: SpikeGraph = existsSync(args.spikeFixture)
      ? (JSON.parse(readFileSync(args.spikeFixture, 'utf8')) as SpikeGraph)
      : synthesize({ nodeCount: 5000, edgesPerNode: 3, seed: 42 });
    const { nodes, edges } = fromSpikeGraph(graph);
    summaries.push(await bench('spike-5k', nodes, edges, args.runs, args.warmup));
  }
  if (args.only === 'both' || args.only === 'dogfood') {
    if (!existsSync(args.dogfoodFixture)) {
      process.stderr.write(`[bench] dogfood fixture missing: ${args.dogfoodFixture}\n`);
      process.stderr.write(`[bench]   run \`pnpm tsx scripts/seed-dev-db.ts\` first.\n`);
      process.exit(1);
    }
    const graph = JSON.parse(readFileSync(args.dogfoodFixture, 'utf8')) as DogfoodGraph;
    const { nodes, edges } = fromDogfoodGraph(graph);
    summaries.push(await bench('dogfood-l0', nodes, edges, args.runs, args.warmup));
  }

  process.stdout.write('\n========== SUMMARY ==========\n');
  for (const s of summaries) {
    process.stdout.write(
      `${s.label.padEnd(12)}  n=${s.nodes.toString().padStart(5)}  e=${s.edges.toString().padStart(5)}  ` +
        `mean=${s.mean.toFixed(1).padStart(7)}  p50=${s.p50.toFixed(1).padStart(7)}  ` +
        `p95=${s.p95.toFixed(1).padStart(7)}  p99=${s.p99.toFixed(1).padStart(7)}  ` +
        `min=${s.min.toFixed(1).padStart(7)}  max=${s.max.toFixed(1).padStart(7)}  (ms)\n`,
    );
  }
  process.stdout.write('\n');
  process.stdout.write(`${JSON.stringify(summaries.map(({ samples: _samples, ...rest }) => rest), null, 2)}\n`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[bench] FATAL: ${message}\n`);
  if (err instanceof Error && err.stack) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
