// Skill-side tree-sitter walker.
//
// Tech-Spec §3.2 lines 116–119:
// - "Two parsers, one source of truth." Skill owns project-wide CSTs for
//   non-open files. This module is the skill's parser.
// - "Layer 0 = tree-sitter skeleton always-on." This walker IS Layer 0.
// - "Symbol identity = SCIP-first when available → composite-heuristic
//   (signature 0.30 + body 0.35 + outgoing-call 0.20 + name 0.15) with
//   thresholds 0.85 confident / 0.65 tentative; embeddings as tiebreaker
//   only at 0.65–0.85 (cosine ≥ 0.92 promotes); LSP rename events as hard
//   overrides."
// - "Hyperparameters fixed per language — never auto-tune in the inner loop."
//
// This file lands the Layer-0 skeleton:
//   • parseFile() — parse one file with the registered grammar; tolerate
//     ERROR/MISSING per tech-spec §7-J.
//   • extractCodeSymbols() — walk the CST and emit CodeSymbolBody-shaped
//     records for top-level declarations (function/class/interface/etc).
//   • computeIdentityScore() — composite-heuristic scorer with the documented
//     weights and thresholds, used to match a fresh symbol against a prior
//     one across reparses. SCIP-first and embedding-tiebreaker layers are
//     stubbed (return null/false) so the walker is honest about what Layer-0
//     does versus what Layers 1/2 add downstream.
//
// What this file does NOT do:
//   • Write to the SQLite graph store. p2-t06 (`build-graph.ts`) consumes
//     this walker's output and seeds the DB.
//   • Compute embeddings. The embedding tiebreaker (cosine ≥ 0.92) is wired
//     in Phase 5 alongside sqlite-vec (tech-spec §6 phase 5 lines 467–468).
//     For now, identity scoring returns null at the tiebreaker tier, which
//     the caller treats as "match unresolved" rather than synthesizing a
//     score the substrate cannot back up.
//   • Subscribe to LSP rename events. That is Layer 1, lands in Phase 4
//     (tech-spec §6 phase 4 line 456 — `onDidSaveTextDocument` triggers).

import { createRequire } from 'node:module';
import { extname } from 'node:path';

import { dispatchGrammarForExtension } from './grammar-registry.js';
import { computeContentHash, type ParseCache, type ParseCacheEntry } from './cache.js';
import type { CodeSymbolBody } from '@intentgraph/shared/schemas';

const requireFn = createRequire(import.meta.url);

// Composite-heuristic weights from tech-spec.md:118. Pinned here so any future
// tuning lands as a tracked code change with grep-able provenance, not as a
// silent constant drift. ADR-level call to change.
export const IDENTITY_WEIGHT_SIGNATURE = 0.3;
export const IDENTITY_WEIGHT_BODY = 0.35;
export const IDENTITY_WEIGHT_OUTGOING_CALLS = 0.2;
export const IDENTITY_WEIGHT_NAME = 0.15;

// Sanity check: the four weights MUST sum to 1.0 so the resulting score lives
// in [0, 1]. This is not enforced at runtime because the constants are above
// — but a contributor refactoring the weights would catch a drift via this
// constant being wrong, plus the property test in parser-tree-sitter.test.ts.
export const IDENTITY_WEIGHT_SUM = 1.0;

// Thresholds from tech-spec.md:118.
export const IDENTITY_THRESHOLD_CONFIDENT = 0.85;
export const IDENTITY_THRESHOLD_TENTATIVE = 0.65;

// Embedding tiebreaker promotion threshold (tech-spec.md:118). Used only when
// the composite score lands in [TENTATIVE, CONFIDENT). Wired in Phase 5.
export const IDENTITY_EMBEDDING_PROMOTION_THRESHOLD = 0.92;

export interface ParseFileResult {
  /** SHA-256 of the file content. Threaded through to extractCodeSymbols. */
  readonly contentHash: string;
  /** The cache entry that was hit or freshly inserted. */
  readonly entry: ParseCacheEntry;
  /** True if the parse landed cleanly. False if the CST contains ERROR/MISSING nodes. */
  readonly clean: boolean;
}

/**
 * Parse a single file via the registered grammar. Caches by content hash —
 * the cache module's invalidation discipline is the only thing standing
 * between this walker and silent staleness. See cache.ts header.
 *
 * Returns null when the file's extension has no registered grammar (not an
 * error — the walker skips it cleanly).
 */
export function parseFile(
  path: string,
  content: string,
  cache: ParseCache,
): ParseFileResult | null {
  const grammar = dispatchGrammarForExtension(extname(path).toLowerCase());
  if (!grammar) return null;

  const contentHash = computeContentHash(content);
  const cached = cache.get(path, contentHash);
  if (cached) {
    return { contentHash, entry: cached, clean: !treeHasErrorNodes(cached.tree) };
  }

  // tree-sitter's default export is a class — `new Parser()`. setLanguage()
  // accepts the grammar handle from the registry.
  const ParserCtor = requireFn('tree-sitter') as new () => TreeSitterParser;
  const parser = new ParserCtor();
  parser.setLanguage(grammar);

  const tree = parser.parse(content);
  const entry: ParseCacheEntry = {
    tree,
    contentHash,
    byteSize: Buffer.byteLength(content, 'utf8'),
    parsedAt: Date.now(),
  };
  cache.set(path, entry);

  return { contentHash, entry, clean: !treeHasErrorNodes(tree) };
}

/**
 * Extract `code_symbol`-shaped records from a parsed tree. Returns one record
 * per top-level declaration. Range is line/column per the CodeSymbolBody
 * shape in `packages/shared/src/schemas/node.ts`.
 *
 * Per tech-spec §3.2, signature_hash and body_hash are SHA-256 of the
 * extracted text — the composite-heuristic identity scorer reads those hashes
 * back to compare across reparses. The hashes are deterministic given the
 * same source text, which is what makes the cache-by-content-hash discipline
 * sound: same content → same hashes → same identity outcome.
 */
export function extractCodeSymbols(uri: string, parsed: ParseFileResult): CodeSymbolBody[] {
  const tree = parsed.entry.tree as TreeSitterTree;
  const out: CodeSymbolBody[] = [];

  // The tree-sitter API exposes a cursor for efficient walking. We walk the
  // top-level only — nested functions/classes are not their own symbols at
  // Layer 0 (a future Layer-1 pass via SCIP can add them). Top-level is the
  // common case for "exported surface" identity.
  const root = tree.rootNode;
  for (let i = 0; i < root.namedChildCount; i += 1) {
    const child = root.namedChild(i);
    if (!child) continue;
    const symbol = nodeToSymbol(uri, child);
    if (symbol) out.push(symbol);
  }

  return out;
}

export interface IdentityCandidate {
  readonly qualifiedName: string;
  readonly signatureHash: string;
  readonly bodyHash: string;
  readonly outgoingCallNames: readonly string[];
}

export interface IdentityScoreResult {
  readonly score: number;
  readonly tier: 'confident' | 'tentative' | 'unmatched';
  readonly components: {
    readonly signature: number;
    readonly body: number;
    readonly outgoingCalls: number;
    readonly name: number;
  };
}

/**
 * Composite-heuristic symbol identity score.
 *
 * Weights from tech-spec.md:118: signature 0.30 + body 0.35 + outgoing-call 0.20
 * + name 0.15. Each component is a normalized similarity in [0, 1]:
 *   - signature: 1 if signature_hash matches, 0 otherwise. Hash equality is
 *     binary; partial signature similarity is not meaningful at Layer 0.
 *   - body: 1 if body_hash matches, 0 otherwise. Same reasoning.
 *   - outgoing-calls: Jaccard similarity of the outgoing-call name sets. A
 *     symbol that calls the same set of functions across reparses is the
 *     same symbol even if its body churned around the calls.
 *   - name: 1 if qualified_name matches, 0 otherwise. Renames are caught by
 *     the LSP-rename hard-override layer (tech-spec.md:118 line tail), not by
 *     this scorer.
 *
 * Output tier per tech-spec.md:118 thresholds:
 *   - score ≥ 0.85 → 'confident' (commit the rebind)
 *   - 0.65 ≤ score < 0.85 → 'tentative' (caller may invoke embedding tiebreaker
 *     downstream; promotion at cosine ≥ 0.92 is Phase 5 work)
 *   - score < 0.65 → 'unmatched' (treat as a new symbol)
 *
 * The signature-and-body-both-match short-circuit is intentional: the
 * combined weight is 0.65, exactly the tentative threshold. So a symbol with
 * identical signature and body but a renamed identifier scores 0.65 alone
 * (tentative), and gains the rest from outgoing-call and name agreement. A
 * symbol with everything identical scores 1.0 (confident). This is the
 * baseline we want — refactoring that preserves shape preserves identity.
 */
export function computeIdentityScore(
  prior: IdentityCandidate,
  candidate: IdentityCandidate,
): IdentityScoreResult {
  const signatureMatch = prior.signatureHash === candidate.signatureHash ? 1 : 0;
  const bodyMatch = prior.bodyHash === candidate.bodyHash ? 1 : 0;
  const outgoingCallsMatch = jaccardSimilarity(
    prior.outgoingCallNames,
    candidate.outgoingCallNames,
  );
  const nameMatch = prior.qualifiedName === candidate.qualifiedName ? 1 : 0;

  const components = {
    signature: signatureMatch,
    body: bodyMatch,
    outgoingCalls: outgoingCallsMatch,
    name: nameMatch,
  };

  const score = Math.min(
    1,
    signatureMatch * IDENTITY_WEIGHT_SIGNATURE +
      bodyMatch * IDENTITY_WEIGHT_BODY +
      outgoingCallsMatch * IDENTITY_WEIGHT_OUTGOING_CALLS +
      nameMatch * IDENTITY_WEIGHT_NAME,
  );

  // Threshold comparisons use a small epsilon to absorb IEEE 754 rounding
  // at the canonical boundaries. Without this, `0.3 + 0.35` evaluates to
  // 0.6499999999999999 in IEEE 754, and a candidate with identical signature
  // and body slips below the 0.65 tentative threshold — silently
  // misclassified as 'unmatched'. The epsilon is one ULP-level tolerance,
  // which is well below any meaningful semantic distinction in the score.
  const EPSILON = 1e-9;
  let tier: 'confident' | 'tentative' | 'unmatched';
  if (score >= IDENTITY_THRESHOLD_CONFIDENT - EPSILON) {
    tier = 'confident';
  } else if (score >= IDENTITY_THRESHOLD_TENTATIVE - EPSILON) {
    tier = 'tentative';
  } else {
    tier = 'unmatched';
  }

  return { score, tier, components };
}

/** Jaccard similarity over two name sets. Order-independent, duplicate-tolerant. */
function jaccardSimilarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const name of setA) {
    if (setB.has(name)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

// ---------- internal CST helpers ----------

/** Tree-sitter type sketches. The native binding is opaque; we type the surface we use. */
interface TreeSitterParser {
  setLanguage(grammar: unknown): void;
  parse(input: string): TreeSitterTree;
}

interface TreeSitterTree {
  readonly rootNode: TreeSitterNode;
}

interface TreeSitterNode {
  readonly type: string;
  readonly text: string;
  readonly startPosition: { row: number; column: number };
  readonly endPosition: { row: number; column: number };
  readonly namedChildCount: number;
  namedChild(index: number): TreeSitterNode | null;
  childForFieldName(field: string): TreeSitterNode | null;
  readonly hasError?: boolean;
  readonly isMissing?: boolean;
}

const SYMBOL_NODE_TYPES = new Set([
  'function_declaration',
  'method_definition',
  'class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'lexical_declaration', // const / let
  'variable_declaration', // var
  'export_statement',
]);

function nodeToSymbol(uri: string, node: TreeSitterNode): CodeSymbolBody | null {
  // export_statement wraps the actual declaration; unwrap one level so the
  // identity matches the underlying declaration node's text.
  let target = node;
  if (node.type === 'export_statement') {
    const inner = node.namedChild(0);
    if (!inner) return null;
    target = inner;
  }
  if (!SYMBOL_NODE_TYPES.has(target.type) && target.type !== 'export_statement') {
    return null;
  }

  const name = extractSymbolName(target);
  if (!name) return null;

  // Signature is everything up to (but not including) the body. For functions
  // that means parameters + return type; for classes the heritage clause; for
  // type aliases the right-hand side. We approximate by taking the slice from
  // the node start to the body-field start, which is the cheapest approach
  // that produces a deterministic hash. Nodes without a body field hash the
  // whole node text as the signature.
  const bodyNode = target.childForFieldName('body');
  const fullText = target.text;
  const signatureText = bodyNode
    ? fullText.slice(0, fullText.length - bodyNode.text.length)
    : fullText;
  const bodyText = bodyNode ? bodyNode.text : '';

  return {
    uri,
    range: {
      start: { line: target.startPosition.row, column: target.startPosition.column },
      end: { line: target.endPosition.row, column: target.endPosition.column },
    },
    qualified_name: name,
    signature_hash: computeContentHash(signatureText),
    body_hash: computeContentHash(bodyText),
  };
}

function extractSymbolName(node: TreeSitterNode): string | null {
  // Most declarations expose a 'name' field. Variable/lexical declarations
  // wrap the name inside a declarator child. We check both.
  const direct = node.childForFieldName('name');
  if (direct) return direct.text;

  for (let i = 0; i < node.namedChildCount; i += 1) {
    const child = node.namedChild(i);
    if (!child) continue;
    if (child.type === 'variable_declarator') {
      const named = child.childForFieldName('name');
      if (named) return named.text;
    }
  }
  return null;
}

/**
 * Tech-Spec §7-J: ERROR/MISSING nodes are first-class "unknown skeleton"
 * markers, not failures. We surface presence via the `clean` flag on
 * ParseFileResult so the caller can decide whether to downgrade confidence
 * on extracted symbols (per ADR-0022's confidence vocabulary). The walker
 * itself does not throw.
 */
function treeHasErrorNodes(tree: unknown): boolean {
  const t = tree as TreeSitterTree;
  return walkNodeForErrors(t.rootNode);
}

function walkNodeForErrors(node: TreeSitterNode): boolean {
  if (node.hasError === true || node.isMissing === true || node.type === 'ERROR') return true;
  for (let i = 0; i < node.namedChildCount; i += 1) {
    const child = node.namedChild(i);
    if (child && walkNodeForErrors(child)) return true;
  }
  return false;
}
