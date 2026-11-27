// anchors bind a spec node to code (realized_by) and to checks (verified_by).
// format from adr 0030: repo-relative path, optional #Name, optional @sig.
// adr 0030 is proposed, so only fixture specs carry anchors for now.
// a bad anchor becomes a warning on its node, never a throw.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

import { parseFrontmatter } from './frontmatter.js';

export interface Anchor {
  readonly raw: string;
  readonly path: string;
  readonly name?: string;
  readonly sig?: string;
}

export type AnchorParse = { readonly ok: true; readonly anchor: Anchor } | { readonly ok: false; readonly reason: string };

export interface NodeAnchors {
  readonly realizedBy: ReadonlyArray<Anchor>;
  readonly verifiedBy: ReadonlyArray<Anchor>;
  readonly warnings: ReadonlyArray<string>;
}

// eight or more hex chars after the last @, per adr 0030 rule 2
const SIG_RE = /@([0-9a-f]{8,})$/i;

export function parseAnchor(value: string): AnchorParse {
  let rest = value.trim();
  if (rest.length === 0) return { ok: false, reason: 'empty anchor' };
  let sig: string | undefined;
  const sigMatch = SIG_RE.exec(rest);
  if (sigMatch) {
    sig = sigMatch[1];
    rest = rest.slice(0, sigMatch.index);
  }
  const hash = rest.indexOf('#');
  const path = hash >= 0 ? rest.slice(0, hash) : rest;
  const name = hash >= 0 ? rest.slice(hash + 1).trim() : undefined;
  if (path.length === 0) return { ok: false, reason: `"${value}" has no path` };
  if (path.includes('\\')) return { ok: false, reason: `"${value}" uses backslashes, use forward slashes` };
  if (path.startsWith('/') || /^[a-z]:/i.test(path)) return { ok: false, reason: `"${value}" is absolute, use a repo-relative path` };
  if (path.split('/').includes('..')) return { ok: false, reason: `"${value}" leaves the repo with ..` };
  if (name !== undefined && name.length === 0) return { ok: false, reason: `"${value}" has an empty name after #` };
  const anchor: Anchor = {
    raw: value,
    path,
    ...(name !== undefined ? { name } : {}),
    ...(sig !== undefined ? { sig } : {}),
  };
  return { ok: true, anchor };
}

export function parseAnchorField(value: unknown, field: string): { anchors: Anchor[]; warnings: string[] } {
  const anchors: Anchor[] = [];
  const warnings: string[] = [];
  if (value === undefined || value === null) return { anchors, warnings };
  const items: unknown[] = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  if (typeof value !== 'string' && !Array.isArray(value)) {
    warnings.push(`${field} should be a list of anchors, got ${typeof value}`);
    return { anchors, warnings };
  }
  for (const item of items) {
    if (typeof item !== 'string') {
      warnings.push(`${field} entry ${JSON.stringify(item)} is not a string`);
      continue;
    }
    const r = parseAnchor(item);
    if (r.ok) anchors.push(r.anchor);
    else warnings.push(`${field}: ${r.reason}`);
  }
  return { anchors, warnings };
}

export function readAnchors(raw: Record<string, unknown>): NodeAnchors {
  const realized = parseAnchorField(raw['realized_by'], 'realized_by');
  const verified = parseAnchorField(raw['verified_by'], 'verified_by');
  return {
    realizedBy: realized.anchors,
    verifiedBy: verified.anchors,
    warnings: [...realized.warnings, ...verified.warnings],
  };
}

// same four folders parseSpecTree walks. files that fail frontmatter are left
// to parseSpecTree to report, here they are skipped.
const SPEC_DIRS = ['intents', 'constraints', 'decisions', 'concepts'] as const;

export function readSpecAnchors(specRoot: string): Map<string, NodeAnchors & { readonly file: string }> {
  const out = new Map<string, NodeAnchors & { readonly file: string }>();
  for (const dir of SPEC_DIRS) {
    const kindDir = join(specRoot, dir);
    let names: string[];
    try {
      if (!statSync(kindDir).isDirectory()) continue;
      names = readdirSync(kindDir);
    } catch {
      continue;
    }
    for (const filename of names) {
      if (extname(filename).toLowerCase() !== '.md' || filename === 'README.md') continue;
      const file = join(kindDir, filename);
      try {
        const parsed = parseFrontmatter(file, readFileSync(file, 'utf8'));
        out.set(parsed.minimum.id, { file, ...readAnchors(parsed.raw) });
      } catch {
        // parseSpecTree reports this file as an error
      }
    }
  }
  return out;
}
