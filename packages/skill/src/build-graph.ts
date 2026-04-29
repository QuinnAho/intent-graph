// Static graph build: combines /spec markdown parsing with the tree-sitter
// code walk to produce a complete L0 graph snapshot. Two outputs from the
// same pass: a `graph.json` dump (the L0 dogfood artifact per tech-spec §6
// phase 2 line 444) and a seeded SQLite database (the substrate of truth
// per ADR-0002).
//
// The build walks four sources and merges them into one node/edge set:
//
//   1. /spec/{intents,constraints,decisions,concepts}/*.md — parsed by
//      packages/skill/src/parser/spec-md/index.ts (p2-t04). Produces nodes
//      of kind {intent, constraint, decision, concept} plus `realizes`
//      edges where the frontmatter `parent` field points to another spec
//      node (per the parent→realizes mapping established in p2-t04).
//
//   2. packages/*/src/** files — walked by parser/fileWalker.ts and parsed
//      by parser/tree-sitter.ts (p2-t05). Each file produces:
//         a. one `code_module` node (the file itself), with `file_hash` =
//            SHA-256 of the content.
//         b. N `code_symbol` nodes (top-level declarations: functions,
//            classes, interfaces, type aliases, enums, exports).
//         c. one `produced_by` edge from each `code_symbol` to its
//            containing `code_module` (so the canvas can render a file as
//            the parent of its top-level symbols, and so traversal can ask
//            "what symbols are in this module").
//
//   3. Spec → code anchoring is NOT inferred at L0. The `realizes` edge from
//      `code_symbol` → `intent` (the load-bearing edge for drift detection)
//      requires a real authored anchor that does not exist in the spec
//      corpus yet. Phase 4's drift detection is what builds those edges via
//      the proposer; L0's job is only to surface the symbols and intents
//      separately so the human can author the anchors. This is consistent
//      with tech-spec §6 phase 2 line 445 — L0's gate is "find an intent
//      visually within 60s," not "edges to code are auto-extracted."
//
//   4. Coverage Verifier (p2-t07) reads the resulting graph and surfaces
//      orphans (intents with zero `realizes`-in, constraints with zero
//      `verified_by` outgoing). That's a verifier pass downstream of this
//      build, not part of the build itself.
//
// Output discipline:
//
//   - graph.json is JSON-as-export, never JSON-as-storage (CLAUDE.md hard
//     rule). It is regenerable from the SQLite seed and from /spec — never
//     read back as a source.
//
//   - The SQLite seed is created via the existing initDatabase + drizzle
//     insert path (no raw SQL outside the schema layer). The seed is
//     idempotent: re-running build() on the same DB drops and re-inserts
//     the static-build node/edge set. (Per-event_log audit of the seed
//     operation is a phase 4 concern — at L0, the build is a fresh
//     bootstrap, not a delta.)

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ulid } from 'ulid';

import { parseSpecTree, type EdgeInsert, type NodeInsert } from './parser/spec-md/index.js';
import { collectProjectSnapshot } from './parser/fileWalker.js';
import { ParseCache } from './parser/cache.js';
import { extractCodeSymbols, parseFile } from './parser/tree-sitter.js';
import type { DbClient } from './db/client.js';
import { node as nodeTable, edge as edgeTable } from './db/schema.js';

export interface BuildGraphOptions {
  /** Repository root (the directory that contains /spec and /packages). */
  readonly repoRoot: string;
  /** Override the timestamp written to created_at / updated_at on rows. */
  readonly now?: number;
  /**
   * Optional override for the spec parser's root. Defaults to
   * `${repoRoot}/spec`. Tests pass a fixture root.
   */
  readonly specRoot?: string;
  /**
   * Path prefixes (relative to repoRoot, forward-slash-normalized) to skip
   * during the code walk. Default skips `claudemap/` (the read-only
   * reference fork — CLAUDE.md "do not lift" hard rule means we never
   * extract symbols from that subtree). Pass an empty array to walk
   * everything.
   */
  readonly skipPathPrefixes?: ReadonlyArray<string>;
}

const DEFAULT_SKIP_PATH_PREFIXES = ['claudemap/'] as const;

export interface BuildGraphSummary {
  readonly nodes: number;
  readonly edges: number;
  readonly specNodes: number;
  readonly codeModules: number;
  readonly codeSymbols: number;
  readonly warnings: ReadonlyArray<{ readonly file: string; readonly message: string }>;
  readonly errors: ReadonlyArray<{ readonly file: string; readonly message: string }>;
}

export interface BuildGraphResult {
  /** All node insert payloads from this build (spec + code). */
  readonly nodes: ReadonlyArray<NodeInsert | CodeNodeInsert>;
  /** All edge insert payloads from this build. */
  readonly edges: ReadonlyArray<EdgeInsert>;
  /** Aggregate counters for logging and the L0 dogfood gate. */
  readonly summary: BuildGraphSummary;
}

/**
 * Internal node insert for the code_module / code_symbol kinds. Mirrors the
 * shape of `NodeInsert` from spec-md/index.ts but covers the two kinds the
 * spec parser does not emit. Kept local rather than promoted to the shared
 * schemas package because the build pipeline is the only producer of these
 * payloads at L0.
 */
export interface CodeNodeInsert {
  readonly id: string;
  readonly kind: 'code_module' | 'code_symbol';
  readonly title: string;
  readonly body: string;
  readonly confidence: 'extracted';
  readonly parentId: string | null;
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Pure build pass: walks /spec and the source tree, returns node + edge
 * payloads. Does not touch the database. The caller (`writeToDatabase` or
 * `writeToJson`) decides what to do with the result.
 */
export function build(opts: BuildGraphOptions): BuildGraphResult {
  const now = opts.now ?? Date.now();
  const repoRoot = resolve(opts.repoRoot);
  const specRoot = opts.specRoot ?? `${repoRoot}/spec`;

  // Source 1: /spec markdown.
  const spec = parseSpecTree(specRoot, { now });

  // Source 2: tree-sitter walk of code files.
  const snapshot = collectProjectSnapshot(repoRoot);
  const cache = new ParseCache();
  const codeNodes: CodeNodeInsert[] = [];
  const codeEdges: EdgeInsert[] = [];
  const parseWarnings: Array<{ readonly file: string; readonly message: string }> = [];
  let codeModuleCount = 0;
  let codeSymbolCount = 0;

  const skipPrefixes = opts.skipPathPrefixes ?? DEFAULT_SKIP_PATH_PREFIXES;

  for (const file of snapshot.files) {
    if (skipPrefixes.some((p) => file.relativePath.startsWith(p))) continue;
    // Read the file once; the walker already validated it exists. Use the
    // absolute path for parsing (tree-sitter cares about extension dispatch,
    // not path resolution) and a stable canonical URI for the node id.
    const absolutePath = `${repoRoot}/${file.relativePath}`;
    let content: string;
    try {
      content = readFileSync(absolutePath, 'utf8');
    } catch {
      // The walker filtered binary/unreadable files already; if read still
      // fails we skip silently rather than failing the whole build. A future
      // hardening pass may surface these as warnings.
      continue;
    }

    let parsed: ReturnType<typeof parseFile> = null;
    try {
      parsed = parseFile(absolutePath, content, cache);
    } catch (err) {
      // Tree-sitter native can throw on adversarial inputs (the 32 KiB
      // default buffer, embedded null bytes, malformed UTF-8). Surface as
      // a build warning rather than failing the whole pass — phase 7's
      // hardening can revisit when language coverage expands.
      parseWarnings.push({
        file: file.relativePath,
        message: `tree-sitter parse failed: ${(err as Error).message}`,
      });
      continue;
    }
    if (!parsed) continue; // unsupported extension (e.g. .py at L0 — phase 7)

    const moduleId = `code_module:${file.relativePath}`;
    const fileHash = createHash('sha256').update(content).digest('hex');

    codeNodes.push({
      id: moduleId,
      kind: 'code_module',
      title: file.relativePath,
      body: JSON.stringify({
        uri: toFileUri(absolutePath),
        language: file.language,
        file_hash: fileHash,
      }),
      confidence: 'extracted',
      parentId: null,
      version: 0,
      createdAt: now,
      updatedAt: now,
    });
    codeModuleCount += 1;

    const symbols = extractCodeSymbols(toFileUri(absolutePath), parsed);
    for (const symbol of symbols) {
      // Symbol id is stable across reparses provided file path + qualified
      // name + signature_hash all match. The composite-heuristic in
      // tree-sitter.ts is what decides identity *after* a parse change; for
      // a fresh build, this composite key is the canonical id.
      const symbolId = `code_symbol:${file.relativePath}#${symbol.qualified_name}#${symbol.signature_hash.slice(0, 12)}`;
      // parent_id is concept-boundary-only per tech-spec §4.1 line 179.
      // Module-contains-symbol is edge-expressed (the produced_by edge below;
      // see tech-spec §3.7 contain edges for the retrieval consumer). Setting
      // parentId here would make the renderer treat the symbol as a sub-flow
      // child of the module (graph-json-loader.ts:154 + ADR-0009), which is
      // not what §3.5 line 141 ("sub-flows for concept boundaries") asks for.
      codeNodes.push({
        id: symbolId,
        kind: 'code_symbol',
        title: symbol.qualified_name,
        body: JSON.stringify(symbol),
        confidence: 'extracted',
        parentId: null,
        version: 0,
        createdAt: now,
        updatedAt: now,
      });
      codeSymbolCount += 1;

      codeEdges.push({
        id: ulid(),
        src: symbolId,
        dst: moduleId,
        kind: 'produced_by',
        weight: 1,
        body: null,
        createdAt: now,
      });
    }
  }

  const allNodes = [...spec.nodes, ...codeNodes];
  const allEdges = [...spec.edges, ...codeEdges];

  return {
    nodes: allNodes,
    edges: allEdges,
    summary: {
      nodes: allNodes.length,
      edges: allEdges.length,
      specNodes: spec.nodes.length,
      codeModules: codeModuleCount,
      codeSymbols: codeSymbolCount,
      warnings: [...spec.warnings, ...parseWarnings],
      errors: spec.errors,
    },
  };
}

/**
 * Write the build result to the SQLite database. Idempotent: clears any
 * existing rows in `node` and `edge` first, then inserts the fresh set.
 * This is correct for L0 (the build is a fresh bootstrap, not a delta);
 * phase 4 introduces the event_log-driven incremental update path that
 * supersedes this.
 */
export function writeToDatabase(client: DbClient, result: BuildGraphResult): void {
  const tx = client.raw.transaction(() => {
    // Clear in dependency order (edges reference nodes via FK).
    client.db.delete(edgeTable).run();
    client.db.delete(nodeTable).run();

    // Insert nodes first so edge FKs resolve. Drizzle's better-sqlite3 driver
    // does not have a native bulk insert; chunk to avoid SQL parser limits
    // (SQLite default = 999 host parameters per statement; each row uses 9).
    const NODE_CHUNK = 100;
    for (let i = 0; i < result.nodes.length; i += NODE_CHUNK) {
      const chunk = result.nodes.slice(i, i + NODE_CHUNK);
      client.db.insert(nodeTable).values(chunk).run();
    }

    const EDGE_CHUNK = 100;
    for (let i = 0; i < result.edges.length; i += EDGE_CHUNK) {
      const chunk = result.edges.slice(i, i + EDGE_CHUNK);
      client.db.insert(edgeTable).values(chunk).run();
    }
  });
  tx();
}

/**
 * Render the build result as the canonical graph.json format (the L0 export
 * dump). The shape is intentionally simple and human-readable; it is NEVER
 * read back as a storage source per CLAUDE.md hard rule "No JSON-as-storage."
 */
export function toGraphJson(result: BuildGraphResult): string {
  return JSON.stringify(
    {
      _format: 'intentgraph-l0-export',
      _version: 1,
      _generated_at: new Date().toISOString(),
      summary: {
        nodes: result.summary.nodes,
        edges: result.summary.edges,
        spec_nodes: result.summary.specNodes,
        code_modules: result.summary.codeModules,
        code_symbols: result.summary.codeSymbols,
      },
      nodes: result.nodes.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: JSON.parse(n.body) as unknown,
        confidence: n.confidence,
        parent_id: n.parentId,
      })),
      edges: result.edges.map((e) => ({
        id: e.id,
        src: e.src,
        dst: e.dst,
        kind: e.kind,
        weight: e.weight,
      })),
    },
    null,
    2,
  );
}

/** Canonical file:// URI for an absolute path. Windows paths are normalized. */
function toFileUri(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, '/');
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
}
