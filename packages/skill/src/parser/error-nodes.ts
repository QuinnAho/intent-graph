// Tech-Spec §7-J: "A TS 5.x feature may not parse on an older grammar. Pin
// grammar versions and treat ERROR/MISSING nodes as first-class 'unknown
// skeleton' nodes rather than failing." This module owns the second half of
// that requirement — given a parsed tree, walk it, find ERROR / MISSING
// regions, and emit `code_symbol`-shaped records for them so downstream
// consumers (drift detection in phase 4, retrieval in phase 5) can reason
// about the broken regions instead of pretending they do not exist.
//
// The first half (grammar pinning) is owned by ./grammar-registry.ts.
// The ERROR-tolerance signal at parse time (the `clean` flag on
// ParseFileResult in ./tree-sitter.ts) is also already in place; this
// module turns that signal into authored graph rows.
//
// Why a synthetic `code_symbol` rather than a new node kind:
//   tech-spec §4.1 line 174 fixes the node-kind enum to nine values.
//   Adding 'unknown_skeleton' as a tenth would be a schema change. The
//   §7-J wording calls these "unknown skeleton *nodes*" descriptively;
//   ADR-0015 (schema scope) declined trigger gymnastics on related grounds
//   and would not welcome an enum widening for this. Encoding the marker
//   in `qualified_name` (a sentinel string) keeps the schema unchanged
//   and the row's body shape compliant with CodeSymbolBodySchema. The
//   sentinel is grep-friendly and stable across reparses given the same
//   file path + range.
//
// Why range-based identity (path + start row + start column):
//   ERROR / MISSING regions have no name, no signature, and no body — the
//   tokens within them are by definition not parseable as a declaration.
//   The composite-heuristic in ./tree-sitter.ts (signature + body +
//   outgoing-calls + name) cannot identify these across reparses; only
//   position can. The id therefore uses `<unknown_skeleton>` as the
//   qualified_name and the start line/column as the disambiguator. Two
//   broken regions on different lines of the same file are two distinct
//   skeleton symbols; the same broken region across reparses is one
//   symbol whose body_hash changes when the broken text changes.

import type { CodeSymbolBody } from '@intentgraph/shared/schemas';

import { computeContentHash } from './cache.js';

/** Sentinel name marking a synthetic skeleton symbol. Greppable by design. */
export const UNKNOWN_SKELETON_NAME = '<unknown_skeleton>';

/** Tree-sitter node surface we read here. Subset of the binding's API. */
interface TreeSitterNode {
  readonly type: string;
  readonly text: string;
  readonly startPosition: { row: number; column: number };
  readonly endPosition: { row: number; column: number };
  readonly namedChildCount: number;
  readonly childCount: number;
  namedChild(index: number): TreeSitterNode | null;
  child(index: number): TreeSitterNode | null;
  readonly hasError?: boolean;
  readonly isMissing?: boolean;
}

interface TreeSitterTree {
  readonly rootNode: TreeSitterNode;
}

/**
 * Walk the parsed tree and emit one `CodeSymbolBody` per ERROR / MISSING
 * region. Returns an empty array when the tree is clean.
 *
 * The walker visits *all* descendants (named and unnamed) because tree-sitter
 * marks the literal `(type === 'ERROR')` node and the `isMissing` flag at
 * arbitrary depth. We do not descend into a node once we have classified it
 * as a skeleton — every error region is reported at the highest-level node
 * that carries the marker, not duplicated at every error-flagged child.
 */
export function extractUnknownSkeletons(uri: string, tree: unknown): CodeSymbolBody[] {
  const out: CodeSymbolBody[] = [];
  const root = (tree as TreeSitterTree).rootNode;
  visit(root, uri, out);
  return out;
}

function visit(node: TreeSitterNode, uri: string, out: CodeSymbolBody[]): void {
  if (isSkeletonMarker(node)) {
    out.push(toSkeletonSymbol(uri, node));
    // Do not descend: the highest-level marker is the canonical record for
    // this region. Descending would emit duplicates for nested ERROR markers
    // inside the same broken span.
    return;
  }
  for (let i = 0; i < node.childCount; i += 1) {
    const child = node.child(i);
    if (child) visit(child, uri, out);
  }
}

/**
 * A node is a skeleton marker when tree-sitter's parser has flagged the
 * region as unparseable. The three signals are independent and any one is
 * sufficient:
 *   - `node.type === 'ERROR'` — tree-sitter inserts a synthetic ERROR node
 *     to mark a span the grammar could not match.
 *   - `node.isMissing === true` — tree-sitter reports a token it expected
 *     but did not find (e.g., a missing semicolon or closing brace).
 *   - `node.hasError === true` AND no child carries the same flag — the
 *     subtree contains an error but the marker is not at a child level we
 *     have already classified. We use this as a fallback only when the
 *     other two are absent so we don't double-report.
 *
 * The `hasError` fallback is gated to nodes whose type is one of the
 * grammar's "statement-level" types (function_declaration, etc.); flagging
 * a whole-file `program` node as a single skeleton would erase positional
 * information that downstream consumers need. Statement-level granularity
 * is the smallest unit at which a useful `range` survives.
 */
function isSkeletonMarker(node: TreeSitterNode): boolean {
  if (node.type === 'ERROR') return true;
  if (node.isMissing === true) return true;
  if (node.hasError !== true) return false;
  // hasError-only fallback: statement-level granularity. Without this, a
  // single typo at the end of a file would bubble up to the root `program`
  // node and produce one skeleton spanning the whole file.
  return STATEMENT_LEVEL_TYPES.has(node.type);
}

const STATEMENT_LEVEL_TYPES = new Set([
  'function_declaration',
  'method_definition',
  'class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'lexical_declaration',
  'variable_declaration',
  'export_statement',
  'import_statement',
  'expression_statement',
]);

function toSkeletonSymbol(uri: string, node: TreeSitterNode): CodeSymbolBody {
  // signature_hash hashes the node type — stable across reparses while the
  // grammar reports the same marker shape, distinct between an ERROR and a
  // missing-token region. body_hash hashes the broken text so a reparse
  // with the same broken span produces the same symbol identity, but
  // editing the broken text mints a new symbol (which is honest — the
  // skeleton tracks the broken region's content, not a stable declaration).
  return {
    uri,
    range: {
      start: { line: node.startPosition.row, column: node.startPosition.column },
      end: { line: node.endPosition.row, column: node.endPosition.column },
    },
    qualified_name: UNKNOWN_SKELETON_NAME,
    signature_hash: computeContentHash(`skeleton:${node.type}`),
    body_hash: computeContentHash(node.text),
  };
}
