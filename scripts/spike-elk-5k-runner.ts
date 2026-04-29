// Risk-C spike, step 1 cont'd (p2-t12) — runner that invokes ELK against the
// 5,000-node harness produced by spike-elk-5k.ts.
//
// Tech-spec §7-C and the p2-t12 task notes: "a runner that invokes the ELK
// worker from p2-t08 against it. Output is the script + harness only — no
// measurements yet." Measurement (p50 / p95 / p99) and the keep-vs-escalate
// recommendation land in p2-t13 and write to docs/spikes/elk-5k-results.md.
//
// Posture:
//   - The runner imports `runLayout` from the webview package directly. That
//     is the production entry point (graph-json-loader.ts:197 calls the same
//     function), so the spike measures the actual layout cost as IntentGraph
//     uses it. ELK runs on the main thread per the phase-2 posture set in
//     p2-t09 follow-up commit 17e5065 — phase 6 hardening will revisit the
//     worker wrapper.
//   - The runner reads the harness JSON written by spike-elk-5k.ts (default
//     `.intentgraph/spike-elk-5k.json`). If the harness file is missing, it
//     calls `synthesize()` directly so a single command works end-to-end.
//   - One layout call per run. Repeated calls would amortize the elkjs
//     constructor warm-up over multiple invocations and bias the
//     measurement; p2-t13 will add the multi-run loop with a warm-up
//     sample, which is the right place for that.
//   - Output: a small JSON summary printed to stdout (counts in / out, ELK
//     wall time as one number). No analysis, no comparisons. p2-t13 owns
//     the analysis.
//
// What this script does NOT do:
//   - Compute p50/p95/p99 (p2-t13).
//   - Recommend incremental-vs-server-side ELK (p2-t13, human checkpoint
//     because the recommendation is load-bearing).
//   - Run inside a real WebWorker. ELK on the main thread is the phase-2
//     posture. The wrapper at packages/webview/src/graph/layout/elk.worker.ts
//     is preserved as the phase-6 entry point.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { runLayout } from '../packages/webview/src/graph/layout/index.js';
import type {
  LayoutEdgeInput,
  LayoutNodeInput,
} from '../packages/webview/src/graph/layout/layout-protocol.js';

import {
  synthesize,
  type SpikeGraph,
  type SpikeNode,
  type SpikeEdge,
} from './spike-elk-5k.js';

interface RunSummary {
  readonly nodes: number;
  readonly edges: number;
  readonly seed: number;
  readonly elkMillis: number;
  readonly positionsCount: number;
  readonly source: 'fixture' | 'in-memory-synthesis';
  readonly fixturePath: string | null;
}

/**
 * Run one ELK layout pass over a SpikeGraph and return a small wall-time
 * summary. The runner does not loop; p2-t13 adds the warm-up + N-iteration
 * loop with quantile reporting.
 */
export async function runSpike(graph: SpikeGraph, source: RunSummary['source'], fixturePath: string | null): Promise<RunSummary> {
  const layoutNodes: LayoutNodeInput[] = graph.nodes.map(toLayoutNode);
  const layoutEdges: LayoutEdgeInput[] = graph.edges.map(toLayoutEdge);

  const start = process.hrtime.bigint();
  const positions = await runLayout(layoutNodes, layoutEdges);
  const end = process.hrtime.bigint();

  // bigint nanoseconds → number milliseconds. Division stays in bigint
  // until the last step so we don't lose precision on long runs.
  const ns = end - start;
  const elkMillis = Number(ns / 1000n) / 1000;

  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    seed: graph.seed,
    elkMillis,
    positionsCount: positions.length,
    source,
    fixturePath,
  };
}

function toLayoutNode(n: SpikeNode): LayoutNodeInput {
  return { id: n.id, width: n.width, height: n.height };
}

function toLayoutEdge(e: SpikeEdge): LayoutEdgeInput {
  return { id: e.id, source: e.source, target: e.target };
}

// -------- CLI shim --------

interface CliArgs {
  readonly fixture: string | null;
  readonly nodes: number;
  readonly edgesPerNode: number;
  readonly seed: number;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let fixture: string | null = resolve(process.cwd(), '.intentgraph/spike-elk-5k.json');
  let nodes = 5000;
  let edgesPerNode = 3;
  let seed = 42;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--fixture':
        fixture = resolve(argv[i + 1] ?? '');
        i += 1;
        break;
      case '--no-fixture':
        fixture = null;
        break;
      case '--nodes':
        nodes = Number(argv[i + 1] ?? '5000');
        i += 1;
        break;
      case '--edges-per-node':
        edgesPerNode = Number(argv[i + 1] ?? '3');
        i += 1;
        break;
      case '--seed':
        seed = Number(argv[i + 1] ?? '42');
        i += 1;
        break;
      case '-h':
      case '--help':
        process.stdout.write(
          `Usage: pnpm tsx scripts/spike-elk-5k-runner.ts [--fixture path | --no-fixture] [--nodes N] [--edges-per-node N] [--seed N]\n`,
        );
        process.exit(0);
        break;
      default:
        if (arg && arg.startsWith('-')) {
          process.stderr.write(`unknown flag: ${arg}\n`);
          process.exit(64);
        }
    }
  }
  return { fixture, nodes, edgesPerNode, seed };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let graph: SpikeGraph;
  let source: RunSummary['source'];
  let fixturePath: string | null;
  if (args.fixture && existsSync(args.fixture)) {
    process.stdout.write(`[spike-runner] loading fixture ${args.fixture}\n`);
    graph = JSON.parse(readFileSync(args.fixture, 'utf8')) as SpikeGraph;
    source = 'fixture';
    fixturePath = args.fixture;
  } else {
    process.stdout.write(
      `[spike-runner] no fixture (or --no-fixture); synthesizing in-memory (nodes=${args.nodes}, seed=${args.seed})\n`,
    );
    graph = synthesize({ nodeCount: args.nodes, edgesPerNode: args.edgesPerNode, seed: args.seed });
    source = 'in-memory-synthesis';
    fixturePath = null;
  }

  process.stdout.write(
    `[spike-runner] running ELK on ${graph.nodes.length} nodes / ${graph.edges.length} edges...\n`,
  );
  const summary = await runSpike(graph, source, fixturePath);
  process.stdout.write(
    `[spike-runner] DONE: ${summary.elkMillis.toFixed(1)}ms (${summary.positionsCount} positions returned)\n`,
  );
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

const isDirectInvocation = (() => {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  const here = new URL(import.meta.url).pathname.replace(/^\//, '');
  return resolve(here).toLowerCase() === resolve(argv1).toLowerCase();
})();

if (isDirectInvocation) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[spike-runner] FATAL: ${message}\n`);
    if (err instanceof Error && err.stack) {
      process.stderr.write(`${err.stack}\n`);
    }
    process.exit(1);
  });
}
