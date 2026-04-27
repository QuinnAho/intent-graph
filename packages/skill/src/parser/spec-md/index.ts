// Public entry point for the /spec/*.md → graph parser. Walks the four
// kind-directories under specRoot (intents, constraints, decisions,
// concepts), parses each non-README .md file's frontmatter (ADR-0009
// validation) plus per-kind body shape (tech-spec §4.1), and produces
// node + edge insert payloads ready for build-graph.ts (p2-t06) to write
// to the SQLite store.
//
// Tech-spec §3.5 (concepts), §4.1 (per-kind body shapes); ADR-0009.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

import { ulid } from 'ulid';

import { parseFrontmatter, FrontmatterError, type ParsedFrontmatter } from './frontmatter.js';

// One of the four spec kind-directories.
export type SpecKind = 'intent' | 'constraint' | 'decision' | 'concept';

const SPEC_KIND_DIRECTORIES: ReadonlyArray<readonly [SpecKind, string]> = [
  ['intent', 'intents'],
  ['constraint', 'constraints'],
  ['decision', 'decisions'],
  ['concept', 'concepts'],
];

// Insert payloads modeled after the schema (../../db/schema.ts) — match
// the column casing the Drizzle table builders use. Application body shapes
// (per tech-spec §4.1) are JSON-encoded into `body` so the SQLite TEXT
// column round-trips through the Zod schemas in @intentgraph/shared.
export interface NodeInsert {
  readonly id: string;
  readonly kind: 'intent' | 'constraint' | 'decision' | 'concept';
  readonly title: string;
  readonly body: string;
  readonly confidence: 'extracted' | 'inferred' | 'semantic' | 'asserted';
  readonly parentId: string | null;
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface EdgeInsert {
  readonly id: string;
  readonly src: string;
  readonly dst: string;
  readonly kind:
    | 'realizes'
    | 'constrains'
    | 'decides'
    | 'justifies'
    | 'supersedes'
    | 'syncs_with'
    | 'depends_on'
    | 'produced_by'
    | 'references';
  readonly weight: number;
  readonly body: string | null;
  readonly createdAt: number;
}

export interface ParseWarning {
  readonly file: string;
  readonly message: string;
}

export interface ParseError {
  readonly file: string;
  readonly message: string;
}

export interface ParseResult {
  readonly nodes: NodeInsert[];
  readonly edges: EdgeInsert[];
  readonly warnings: ParseWarning[];
  readonly errors: ParseError[];
}

export interface ParseOptions {
  /** Override the timestamp written to created_at / updated_at on new rows. */
  readonly now?: number;
}

/**
 * Walk specRoot and return node + edge inserts for every non-README .md
 * file under the four kind-directories. Files that fail frontmatter
 * validation become entries in `errors` (the file is skipped); files that
 * pass but lack recommended per-kind fields become entries in `warnings`
 * (the node is still emitted). The caller (p2-t06's build-graph.ts) is
 * responsible for halting on errors and logging warnings.
 */
export function parseSpecTree(specRoot: string, opts: ParseOptions = {}): ParseResult {
  const now = opts.now ?? Date.now();
  const nodes: NodeInsert[] = [];
  const edges: EdgeInsert[] = [];
  const warnings: ParseWarning[] = [];
  const errors: ParseError[] = [];

  for (const [kind, dir] of SPEC_KIND_DIRECTORIES) {
    const kindDir = join(specRoot, dir);
    if (!safeIsDirectory(kindDir)) {
      // A missing kind-directory is not an error — concepts/ may not exist
      // yet in some checkouts. The CI validator is the gate that requires
      // the directory to exist when files are present.
      continue;
    }

    for (const filename of readdirSync(kindDir)) {
      if (extname(filename).toLowerCase() !== '.md') continue;
      if (filename === 'README.md') continue;

      const filePath = join(kindDir, filename);
      let parsed: ParsedFrontmatter;
      try {
        const source = readFileSync(filePath, 'utf8');
        parsed = parseFrontmatter(filePath, source);
      } catch (err) {
        if (err instanceof FrontmatterError) {
          errors.push({ file: filePath, message: err.reason });
        } else {
          errors.push({ file: filePath, message: (err as Error).message });
        }
        continue;
      }

      const { minimum, raw, body } = parsed;

      // ID-prefix sanity check. Not required by ADR-0009 but cheap to
      // surface as a warning since the per-kind READMEs all show the
      // `<kind>-<slug>` pattern.
      if (!minimum.id.startsWith(`${kind}-`)) {
        warnings.push({
          file: filePath,
          message: `id "${minimum.id}" does not start with the kind prefix "${kind}-"; recommended for clarity.`,
        });
      }

      const node: NodeInsert = {
        id: minimum.id,
        kind,
        title: minimum.title,
        body: JSON.stringify(buildKindBody(kind, raw, body, warnings, filePath)),
        confidence: minimum.confidence,
        parentId: minimum.parent,
        version: 0,
        createdAt: now,
        updatedAt: now,
      };
      nodes.push(node);

      // ADR-0009: `parent` produces a `realizes` edge from this node back
      // to its parent (intent → concept, concept → enclosing concept). The
      // edge is only emitted when parent is non-null; resolution of dangling
      // parents (target node missing) is build-graph.ts's job, not ours.
      if (minimum.parent !== null) {
        edges.push({
          id: ulid(),
          src: minimum.id,
          dst: minimum.parent,
          kind: 'realizes',
          weight: 1,
          body: null,
          createdAt: now,
        });
      }
    }
  }

  return { nodes, edges, warnings, errors };
}

function safeIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Build the per-kind `body` JSON object that goes into `node.body`. Tech-spec
 * §4.1 names the shape per kind; the Zod schemas in @intentgraph/shared
 * validate it on read. Here we just project the YAML frontmatter + body
 * text into the spec-defined shape, surfacing missing recommended fields as
 * warnings rather than errors.
 */
function buildKindBody(
  kind: SpecKind,
  raw: Record<string, unknown>,
  markdownBody: string,
  warnings: ParseWarning[],
  filePath: string,
): Record<string, unknown> {
  switch (kind) {
    case 'intent': {
      const targetKinds = Array.isArray(raw['target_kinds']) ? raw['target_kinds'] : [];
      if (targetKinds.length === 0) {
        warnings.push({
          file: filePath,
          message: 'intent missing recommended `target_kinds` (per spec/intents/README.md).',
        });
      }
      return {
        description: extractDescription(markdownBody),
        owner_node: typeof raw['owner'] === 'string' ? raw['owner'] : undefined,
        target_kinds: targetKinds,
        priority: typeof raw['priority'] === 'string' ? raw['priority'] : undefined,
      };
    }
    case 'constraint': {
      const predicateKind = raw['predicate_kind'];
      const expr = raw['expr'];
      const scopeNode = raw['scope_node'];
      if (typeof predicateKind !== 'string' || typeof expr !== 'string' || typeof scopeNode !== 'string') {
        warnings.push({
          file: filePath,
          message: 'constraint missing one or more recommended fields (predicate_kind, expr, scope_node) per spec/constraints/README.md.',
        });
      }
      return {
        predicate_kind: predicateKind,
        expr,
        scope_node: scopeNode,
      };
    }
    case 'decision': {
      return {
        context: extractDescription(markdownBody),
        alternatives: Array.isArray(raw['alternatives']) ? raw['alternatives'] : [],
        chosen: typeof raw['chosen'] === 'string' ? raw['chosen'] : '',
        consequences: typeof raw['consequences'] === 'string' ? raw['consequences'] : '',
      };
    }
    case 'concept': {
      const regenerationScope = raw['regeneration_scope'];
      if (regenerationScope !== 'atomic' && regenerationScope !== 'cooperative') {
        warnings.push({
          file: filePath,
          message: 'concept missing recommended `regeneration_scope` (atomic|cooperative) per spec/concepts/README.md.',
        });
      }
      return {
        description: typeof raw['description'] === 'string'
          ? raw['description']
          : extractDescription(markdownBody),
        regeneration_scope: regenerationScope ?? 'cooperative',
      };
    }
  }
}

/** First paragraph of the markdown body, normalized to a single line. */
function extractDescription(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length === 0) return '';
  // Strip leading H1 (`# ...`) if present, then take the first paragraph.
  const lines = trimmed.split(/\r?\n/);
  const startIdx = lines[0]?.startsWith('#') ? 1 : 0;
  let endIdx = startIdx;
  while (endIdx < lines.length && lines[endIdx]?.trim().length !== 0) {
    endIdx++;
  }
  // Skip leading blank lines after the H1.
  let realStart = startIdx;
  while (realStart < lines.length && lines[realStart]?.trim().length === 0) realStart++;
  endIdx = realStart;
  while (endIdx < lines.length && lines[endIdx]?.trim().length !== 0) endIdx++;
  return lines.slice(realStart, endIdx).join(' ').trim();
}

export { FrontmatterError } from './frontmatter.js';
