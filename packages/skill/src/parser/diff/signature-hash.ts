// Normalised syntax hash for a file or a named top-level symbol (ADR-0030 `@sig`).
//
// Idea borrowed from Fiberplane Drift (MIT): hash the tree-sitter node kinds plus
// token text instead of the raw source, so reformatting and comments do not count
// as a change. Drift stores an XxHash3. We use sha-256 from node:crypto because it
// is already the content hash in parser/cache.ts and needs no dependency.
//
// What is dropped before hashing, and why:
//   - whitespace: never a token in the CST.
//   - `comment` nodes: prose, not behaviour.
//   - anonymous `;` and `,` tokens: prettier adds and removes them (ASI, trailing
//     commas). Known blind spot: array holes `[a,,b]` hash like `[a,b]`.
//   - quote style: `'x'` and `"x"` hash the same, template backticks do not.

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { extname } from 'node:path';

import { dispatchGrammarForExtension } from '../grammar-registry.js';
import { parseBufferSize } from '../tree-sitter.js';

const requireFn = createRequire(import.meta.url);

interface TsNode {
  readonly type: string;
  readonly text: string;
  readonly isNamed: boolean;
  readonly childCount: number;
  readonly startPosition: { row: number; column: number };
  readonly endPosition: { row: number; column: number };
  child(index: number): TsNode | null;
  childForFieldName(field: string): TsNode | null;
  readonly hasError?: boolean;
}

interface TsParser {
  setLanguage(grammar: unknown): void;
  parse(input: string, oldTree?: unknown, opts?: { bufferSize?: number }): { readonly rootNode: TsNode };
}

export interface SignatureResult {
  /** sha-256 hex of the normalised form, '' when the symbol was not found. */
  readonly hash: string;
  readonly found: boolean;
  /** 'syntax' when tree-sitter parsed it, 'text' for files with no grammar. */
  readonly mode: 'syntax' | 'text';
  /** False when the CST holds ERROR or MISSING nodes. The hash is still usable. */
  readonly clean: boolean;
}

export interface TopLevelSymbol {
  /** `name`, or `Class.member` for a class member. */
  readonly name: string;
  /** 1-based, inclusive, of the outermost statement (export keyword included). */
  readonly startLine: number;
  readonly endLine: number;
  readonly node: unknown;
}

const DROPPED_TOKENS = new Set([';', ',']);
const CLASS_TYPES = new Set(['class_declaration', 'abstract_class_declaration', 'class']);
const MEMBER_TYPES = new Set([
  'method_definition',
  'public_field_definition',
  'field_definition',
  'abstract_method_signature',
  'method_signature',
]);

const parsers = new Map<unknown, TsParser>();

export interface ParseLimits {
  /** Refuse files larger than this many utf-8 bytes. No cap when absent. */
  readonly maxBytes?: number;
}

function parseWithGrammar(path: string, content: string, limits: ParseLimits = {}): TsNode | null {
  const grammar = dispatchGrammarForExtension(extname(path).toLowerCase());
  if (!grammar) return null;
  const bytes = Buffer.byteLength(content, 'utf8');
  if (limits.maxBytes !== undefined && bytes > limits.maxBytes) {
    throw new Error(`${path} is ${bytes} bytes, over the parse cap of ${limits.maxBytes}`);
  }
  let parser = parsers.get(grammar);
  if (!parser) {
    const Ctor = requireFn('tree-sitter') as new () => TsParser;
    parser = new Ctor();
    parser.setLanguage(grammar);
    parsers.set(grammar, parser);
  }
  return parser.parse(content, undefined, { bufferSize: parseBufferSize(content) }).rootNode;
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Append the normalised token stream of a subtree to `out`. */
function normalise(node: TsNode, out: string[]): void {
  if (node.type === 'comment') return;
  if (node.childCount === 0) {
    if (!node.isNamed) {
      if (DROPPED_TOKENS.has(node.type)) return;
      out.push(node.type === "'" ? '"' : node.type);
      return;
    }
    out.push(`${node.type}:${node.text}`);
    return;
  }
  out.push(`(${node.type}`);
  for (let i = 0; i < node.childCount; i += 1) {
    const c = node.child(i);
    if (c) normalise(c, out);
  }
  out.push(')');
}

function normalisedForm(node: TsNode): string {
  const out: string[] = [];
  normalise(node, out);
  return out.join('\u0000');
}

function declarationNames(decl: TsNode): string[] {
  const direct = decl.childForFieldName('name');
  if (direct) return [direct.text];
  const names: string[] = [];
  for (let i = 0; i < decl.childCount; i += 1) {
    const c = decl.child(i);
    if (c?.type === 'variable_declarator') {
      const n = c.childForFieldName('name');
      if (n) names.push(n.text);
    }
  }
  return names;
}

function memberSymbols(className: string, cls: TsNode): TopLevelSymbol[] {
  const body = cls.childForFieldName('body');
  if (!body) return [];
  const out: TopLevelSymbol[] = [];
  for (let i = 0; i < body.childCount; i += 1) {
    const m = body.child(i);
    if (!m || !MEMBER_TYPES.has(m.type)) continue;
    const n = m.childForFieldName('name');
    if (!n) continue;
    out.push({
      name: `${className}.${n.text}`,
      startLine: m.startPosition.row + 1,
      endLine: m.endPosition.row + 1,
      node: m,
    });
  }
  return out;
}

function symbolsOfRoot(root: TsNode): TopLevelSymbol[] {
  const out: TopLevelSymbol[] = [];
  for (let i = 0; i < root.childCount; i += 1) {
    const stmt = root.child(i);
    if (!stmt || !stmt.isNamed) continue;
    let decl: TsNode | null = stmt;
    let isDefault = false;
    if (stmt.type === 'export_statement') {
      decl = stmt.childForFieldName('declaration');
      if (!decl) {
        // `export default <expr>` has a value, not a declaration
        decl = stmt.childForFieldName('value');
        isDefault = decl !== null;
      }
    }
    if (!decl) continue;
    const names = isDefault ? ['default'] : declarationNames(decl);
    for (const name of names) {
      out.push({
        name,
        startLine: stmt.startPosition.row + 1,
        endLine: stmt.endPosition.row + 1,
        node: stmt,
      });
    }
    const first = names[0];
    if (CLASS_TYPES.has(decl.type) && first) out.push(...memberSymbols(first, decl));
  }
  return out;
}

/** Top-level symbols of a code file, with class members as `Class.member`. Empty for non-code files. */
export function listTopLevelSymbols(path: string, content: string, limits: ParseLimits = {}): TopLevelSymbol[] {
  const root = parseWithGrammar(path, content, limits);
  return root ? symbolsOfRoot(root) : [];
}

export interface SymbolSignature {
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly hash: string;
}

/** Every top-level symbol with its normalised hash, from one parse. Empty for non-code files. */
export function symbolSignatures(path: string, content: string, limits: ParseLimits = {}): SymbolSignature[] {
  const root = parseWithGrammar(path, content, limits);
  if (!root) return [];
  return symbolsOfRoot(root).map((s) => ({
    name: s.name,
    startLine: s.startLine,
    endLine: s.endLine,
    hash: sha256(normalisedForm(s.node as TsNode)),
  }));
}

/**
 * Normalised hash of a whole file (no symbol) or of one named symbol.
 * A missing symbol gives found=false and an empty hash. Throws only for a file over limits.maxBytes.
 */
export function signatureOf(path: string, content: string, symbol?: string, limits: ParseLimits = {}): SignatureResult {
  const root = parseWithGrammar(path, content, limits);
  if (!root) {
    // no grammar: hash the text with whitespace runs collapsed. symbols are not addressable.
    if (symbol) return { hash: '', found: false, mode: 'text', clean: true };
    return { hash: sha256(content.replace(/\s+/g, ' ').trim()), found: true, mode: 'text', clean: true };
  }
  const clean = root.hasError !== true;
  if (!symbol) return { hash: sha256(normalisedForm(root)), found: true, mode: 'syntax', clean };
  const hit = symbolsOfRoot(root).find((s) => s.name === symbol);
  if (!hit) return { hash: '', found: false, mode: 'syntax', clean };
  return { hash: sha256(normalisedForm(hit.node as TsNode)), found: true, mode: 'syntax', clean };
}

/** True when an anchor's `@sig` (eight or more hex chars) is a prefix of the full hash. */
export function sigMatches(anchorSig: string, fullHash: string): boolean {
  if (!/^[0-9a-f]{8,}$/.test(anchorSig)) return false;
  return fullHash.startsWith(anchorSig);
}
