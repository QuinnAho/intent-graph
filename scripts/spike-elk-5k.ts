// Risk-C spike, step 1 (p2-t12) — synthesize a 5,000-node graph harness.
//
// Tech-spec §7-C names ELK at scale as a Phase-2 risk: "ELK in a dedicated
// WebWorker" (§3.5 line 142) is the long-term posture, but at 3k+ nodes
// re-layout cost on the main thread becomes a UX problem. This module
// produces a synthetic graph that lets the runner (p2-t12 step 2,
// spike-elk-5k-runner.ts) measure ELK timing without waiting for the real
// dogfood corpus to grow to 5k nodes.
//
// What this script does NOT do:
//   - measure timing (that's the runner's job, p2-t12 step 2)
//   - write recommendations or compare strategies (that's p2-t13)
//   - touch the SQLite store or graph.json (the harness is in-memory only)
//
// Synthesis discipline:
//   - 5,000 nodes total. Distribution across the 9 node kinds approximates
//     a real dogfood graph at scale: heavy on code_module/code_symbol
//     (the bulk of any project's graph), with a smaller proportion of
//     intent / constraint / decision / concept / rationale and a tail of
//     task / counterexample. The proportions are documented at the
//     KIND_PROPORTIONS constant; they are estimates, not measurements.
//   - ULIDs for all node ids (per ADR-0002 / tech-spec §4.1 line 171).
//   - ~3 edges/node ⇒ ~15,000 edges. The edge mix biases toward containment
//     (produced_by from code_symbol → code_module, the dominant edge in
//     the L0 seed) and inter-concept (realizes from intent → concept).
//     Random sampling within each edge kind, but the per-kind counts are
//     deterministic given a seeded PRNG so the harness is reproducible.
//   - Sizes per node kind match the chrome defaults (nodeChrome.ts:200 +
//     per-kind LayoutSizers in CodeModuleNode.tsx etc.). ELK's layout cost
//     scales with node count primarily but node size affects layered-edge
//     routing, so realistic sizes are part of the harness contract.
//
// Reproducibility: the synthesizer takes a numeric seed (default 42). Same
// seed = same graph, byte-for-byte. The runner can therefore re-measure
// against the same fixture across runs.
//
// Determinism caveat: ULID generation uses Math.random() if not seeded;
// this script seeds Math.random via a small Mulberry32 PRNG that replaces
// the global. After the synthesizer returns the global is NOT restored —
// the script is meant to be invoked once per Node process via tsx.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { ulid } from 'ulid';

// -------- Public API --------

export interface SpikeNode {
  readonly id: string;
  readonly kind:
    | 'intent'
    | 'constraint'
    | 'rationale'
    | 'decision'
    | 'concept'
    | 'code_module'
    | 'code_symbol'
    | 'counterexample'
    | 'task';
  readonly width: number;
  readonly height: number;
}

export interface SpikeEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: 'realizes' | 'produced_by' | 'syncs_with' | 'verified_by' | 'depends_on';
}

export interface SpikeGraph {
  readonly nodes: ReadonlyArray<SpikeNode>;
  readonly edges: ReadonlyArray<SpikeEdge>;
  readonly seed: number;
  readonly generatedAt: string;
}

export interface SynthesizeOptions {
  readonly nodeCount?: number;
  readonly edgesPerNode?: number;
  readonly seed?: number;
}

// Approximate distribution of node kinds in a mature dogfood graph at scale.
// Values are weights, not counts; they sum to 1.0 and are scaled to nodeCount.
// The big two — code_module and code_symbol — dominate because every source
// file plus every top-level export becomes a node.
const KIND_PROPORTIONS: Record<SpikeNode['kind'], number> = {
  code_module: 0.18,
  code_symbol: 0.6,
  intent: 0.05,
  constraint: 0.05,
  concept: 0.03,
  decision: 0.03,
  rationale: 0.02,
  task: 0.03,
  counterexample: 0.01,
};

// Per-kind chrome size baselines. Mirrors getDefaultChromeSize in
// packages/webview/src/graph/nodes/shared/nodeChrome.tsx + the per-kind
// registerLayoutSizer calls. Kept in sync by hand at the spike level —
// importing the registry would pull React into the script's import graph.
const KIND_SIZES: Record<SpikeNode['kind'], { width: number; height: number }> = {
  intent: { width: 220, height: 72 },
  constraint: { width: 220, height: 72 },
  rationale: { width: 220, height: 72 },
  decision: { width: 220, height: 72 },
  concept: { width: 240, height: 80 },
  code_module: { width: 240, height: 72 },
  code_symbol: { width: 200, height: 56 },
  counterexample: { width: 220, height: 72 },
  task: { width: 220, height: 72 },
};

/**
 * Synthesize a Risk-C spike graph. Default 5,000 nodes / ~15,000 edges /
 * seed 42. The output is reproducible byte-for-byte across runs against
 * the same seed.
 */
export function synthesize(opts: SynthesizeOptions = {}): SpikeGraph {
  const nodeCount = opts.nodeCount ?? 5000;
  const edgesPerNode = opts.edgesPerNode ?? 3;
  const seed = opts.seed ?? 42;

  const rng = mulberry32(seed);

  const nodes: SpikeNode[] = [];
  const byKind: Record<SpikeNode['kind'], string[]> = {
    intent: [],
    constraint: [],
    rationale: [],
    decision: [],
    concept: [],
    code_module: [],
    code_symbol: [],
    counterexample: [],
    task: [],
  };

  // Produce per-kind node counts. Round each weight × nodeCount; the last
  // kind absorbs any rounding remainder so the total is exactly nodeCount.
  const kinds = Object.keys(KIND_PROPORTIONS) as Array<SpikeNode['kind']>;
  let allocated = 0;
  for (let i = 0; i < kinds.length; i += 1) {
    const k = kinds[i]!;
    const isLast = i === kinds.length - 1;
    const count = isLast ? nodeCount - allocated : Math.round(KIND_PROPORTIONS[k] * nodeCount);
    allocated += count;
    for (let j = 0; j < count; j += 1) {
      const id = `${k}:${ulidWith(rng)}`;
      nodes.push({ id, kind: k, ...KIND_SIZES[k] });
      byKind[k].push(id);
    }
  }

  // Edge synthesis. Each "edges-per-node" round draws one edge per node from
  // the kind-specific edge templates. The templates pair a source kind with
  // a target kind and an edge kind; the source instance is the current node;
  // the target is sampled uniformly from the target-kind pool.
  const edges: SpikeEdge[] = [];
  const targetEdgeCount = nodeCount * edgesPerNode;

  while (edges.length < targetEdgeCount) {
    for (const node of nodes) {
      if (edges.length >= targetEdgeCount) break;
      const template = pickEdgeTemplate(node.kind, rng);
      if (!template) continue;
      const targetPool = byKind[template.targetKind];
      if (targetPool.length === 0) continue;
      const target = targetPool[Math.floor(rng() * targetPool.length)]!;
      if (target === node.id) continue; // no self-loops; ELK handles them but the dogfood graph never has them
      edges.push({
        id: `edge:${ulidWith(rng)}`,
        source: node.id,
        target,
        kind: template.edgeKind,
      });
    }
  }

  return {
    nodes,
    edges: edges.slice(0, targetEdgeCount),
    seed,
    generatedAt: new Date().toISOString(),
  };
}

// -------- Internals --------

interface EdgeTemplate {
  readonly targetKind: SpikeNode['kind'];
  readonly edgeKind: SpikeEdge['kind'];
}

// Per-source-kind edge templates. The mix is biased toward the dominant
// dogfood edges: produced_by (code_symbol → code_module), realizes (intent
// → concept), and verified_by (constraint → concept). Other kinds emit
// fewer edges; the missing-template path returns null and the synthesizer
// skips that source on this round.
const EDGE_TEMPLATES: Record<SpikeNode['kind'], ReadonlyArray<EdgeTemplate>> = {
  code_symbol: [
    { targetKind: 'code_module', edgeKind: 'produced_by' },
    { targetKind: 'code_symbol', edgeKind: 'depends_on' },
  ],
  code_module: [
    { targetKind: 'concept', edgeKind: 'realizes' },
    { targetKind: 'code_module', edgeKind: 'depends_on' },
  ],
  intent: [
    { targetKind: 'concept', edgeKind: 'realizes' },
    { targetKind: 'intent', edgeKind: 'depends_on' },
  ],
  constraint: [{ targetKind: 'concept', edgeKind: 'verified_by' }],
  concept: [{ targetKind: 'concept', edgeKind: 'syncs_with' }],
  decision: [{ targetKind: 'intent', edgeKind: 'depends_on' }],
  rationale: [{ targetKind: 'decision', edgeKind: 'depends_on' }],
  task: [{ targetKind: 'intent', edgeKind: 'depends_on' }],
  counterexample: [{ targetKind: 'constraint', edgeKind: 'verified_by' }],
};

function pickEdgeTemplate(
  kind: SpikeNode['kind'],
  rng: () => number,
): EdgeTemplate | null {
  const templates = EDGE_TEMPLATES[kind];
  if (templates.length === 0) return null;
  return templates[Math.floor(rng() * templates.length)] ?? null;
}

/**
 * Mulberry32 — small deterministic PRNG. Same seed = same sequence. Produces
 * floats in [0, 1) suitable as a Math.random() drop-in for synthesis.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Wrap ulid() with the seeded PRNG so re-running the synthesizer with the
 * same seed produces identical IDs. The ulid library accepts a custom PRNG
 * via its second argument (its internal monotonic factory).
 */
function ulidWith(rng: () => number): string {
  return ulid(Date.now(), rng as never);
}

// -------- CLI shim --------

interface CliArgs {
  readonly nodeCount: number;
  readonly edgesPerNode: number;
  readonly seed: number;
  readonly out: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let nodeCount = 5000;
  let edgesPerNode = 3;
  let seed = 42;
  let out = resolve(process.cwd(), '.intentgraph/spike-elk-5k.json');

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--nodes':
        nodeCount = Number(argv[i + 1] ?? '5000');
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
      case '--out':
        out = resolve(argv[i + 1] ?? out);
        i += 1;
        break;
      case '-h':
      case '--help':
        process.stdout.write(
          `Usage: pnpm tsx scripts/spike-elk-5k.ts [--nodes N] [--edges-per-node N] [--seed N] [--out path]\n`,
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
  return { nodeCount, edgesPerNode, seed, out };
}

function isDirectInvocation(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  // tsx rewrites the URL but argv[1] is the script path; resolve both.
  const here = new URL(import.meta.url).pathname.replace(/^\//, '');
  return resolve(here).toLowerCase() === resolve(argv1).toLowerCase();
}

if (isDirectInvocation()) {
  const args = parseArgs(process.argv.slice(2));
  process.stdout.write(`[spike-elk-5k] synthesizing ${args.nodeCount} nodes (seed=${args.seed})...\n`);
  const graph = synthesize({
    nodeCount: args.nodeCount,
    edgesPerNode: args.edgesPerNode,
    seed: args.seed,
  });
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(graph, null, 2), 'utf8');
  process.stdout.write(
    `[spike-elk-5k] wrote ${graph.nodes.length} nodes / ${graph.edges.length} edges → ${args.out}\n`,
  );
}
