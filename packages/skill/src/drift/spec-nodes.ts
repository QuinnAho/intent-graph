// Read spec nodes and their `realized_by` anchors from a spec tree, optionally
// overlaid with an anchors file (so real nodes can be bound without editing /spec).
// Read-only: this module never writes a file.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

import { parseFrontmatter } from '../parser/spec-md/frontmatter.js';
import { parseAnchor, type Anchor } from './anchors.js';
import type { SpecNode } from './link.js';

const KIND_DIRS = ['intents', 'constraints', 'decisions', 'concepts'];

export interface SpecLoadResult {
  readonly nodes: SpecNode[];
  readonly errors: { file: string; message: string }[];
}

/** Overlay file shape: `{ "<node id>": ["path#Symbol", ...] }`. Replaces the node's own realized_by. */
export type AnchorOverlay = Record<string, string[]>;

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function toAnchors(raw: unknown, file: string, errors: SpecLoadResult['errors']): Anchor[] {
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out: Anchor[] = [];
  for (const item of list) {
    const a = typeof item === 'string' ? parseAnchor(item) : null;
    if (a) out.push(a);
    else errors.push({ file, message: `bad realized_by target: ${JSON.stringify(item)}` });
  }
  return out;
}

export function loadSpecNodes(specRoot: string, overlay?: AnchorOverlay): SpecLoadResult {
  const nodes: SpecNode[] = [];
  const errors: SpecLoadResult['errors'] = [];
  for (const dir of KIND_DIRS) {
    const kindDir = join(specRoot, dir);
    if (!isDir(kindDir)) continue;
    for (const name of readdirSync(kindDir).sort()) {
      if (extname(name).toLowerCase() !== '.md' || name === 'README.md') continue;
      const file = join(kindDir, name);
      try {
        const parsed = parseFrontmatter(file, readFileSync(file, 'utf8'));
        const id = parsed.minimum.id;
        const own = toAnchors(parsed.raw['realized_by'], file, errors);
        const extra = overlay?.[id];
        const realizedBy = extra ? toAnchors(extra, file, errors) : own;
        nodes.push({
          id,
          title: parsed.minimum.title,
          text: `${parsed.minimum.title}\n\n${parsed.body.trim()}`,
          file,
          realizedBy,
        });
      } catch (err) {
        errors.push({ file, message: (err as Error).message });
      }
    }
  }
  if (overlay) {
    for (const id of Object.keys(overlay)) {
      if (!nodes.some((n) => n.id === id)) errors.push({ file: '<anchors overlay>', message: `no spec node with id ${id}` });
    }
  }
  return { nodes, errors };
}
