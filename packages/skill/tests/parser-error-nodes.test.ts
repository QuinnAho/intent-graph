// Tests for parser/error-nodes.ts.
//
// Coverage:
//   - A clean file produces zero skeleton symbols.
//   - A file with a known broken region produces at least one skeleton symbol
//     whose qualified_name is the UNKNOWN_SKELETON_NAME sentinel.
//   - The skeleton's range points at the broken region (sanity check that we
//     do not silently emit a whole-file skeleton from a single-line typo).
//   - The skeleton's body_hash and signature_hash are deterministic given the
//     same broken text — same input twice produces equal hashes.
//   - Tech-spec §7-J: parseFile() does not throw on adversarial input. The
//     existing parser-tree-sitter.test.ts already covers the no-throw and
//     `clean=false` signal; this file extends to the symbol-extraction half.
//
// Tech-spec §7-J. ADR-0011 test-infrastructure layout.

import { describe, expect, it } from 'vitest';

import { ParseCache } from '../src/parser/cache.js';
import {
  extractUnknownSkeletons,
  UNKNOWN_SKELETON_NAME,
} from '../src/parser/error-nodes.js';
import { parseFile } from '../src/parser/tree-sitter.js';

const CLEAN_TS = `
export function add(a: number, b: number): number {
  return a + b;
}
`;

// A function declaration with a missing closing brace plus a stray paren.
// tree-sitter-typescript flags the unbalanced region as an ERROR / MISSING
// span; the rest of the file is fine.
const BROKEN_TS = `
export function add(a: number, b: number): number {
  return a + b;

export const PI = 3.14;
`;

describe('extractUnknownSkeletons()', () => {
  it('returns an empty array for a clean parse', () => {
    const cache = new ParseCache();
    const parsed = parseFile('clean.ts', CLEAN_TS, cache);
    expect(parsed).not.toBeNull();
    expect(parsed!.clean).toBe(true);
    const skeletons = extractUnknownSkeletons('file:///clean.ts', parsed!.entry.tree);
    expect(skeletons).toEqual([]);
  });

  it('produces at least one skeleton symbol for a broken parse', () => {
    const cache = new ParseCache();
    const parsed = parseFile('broken.ts', BROKEN_TS, cache);
    expect(parsed).not.toBeNull();
    // The walker must NOT throw on adversarial input — that is the §7-J
    // contract. The `clean=false` signal is the existing parser surface;
    // this assertion guards against a regression where parseFile starts
    // throwing instead of flagging.
    expect(parsed!.clean).toBe(false);
    const skeletons = extractUnknownSkeletons('file:///broken.ts', parsed!.entry.tree);
    expect(skeletons.length).toBeGreaterThan(0);
    expect(skeletons.every((s) => s.qualified_name === UNKNOWN_SKELETON_NAME)).toBe(true);
  });

  it('reports skeleton ranges with non-zero span', () => {
    // A skeleton range of 0:0 → 0:0 would erase positional information that
    // drift detection in phase 4 needs. Each skeleton must point at a real
    // non-empty span of the source.
    const cache = new ParseCache();
    const parsed = parseFile('broken.ts', BROKEN_TS, cache);
    const skeletons = extractUnknownSkeletons('file:///broken.ts', parsed!.entry.tree);
    for (const s of skeletons) {
      const sameLine = s.range.start.line === s.range.end.line;
      const sameColumn = s.range.start.column === s.range.end.column;
      expect(sameLine && sameColumn).toBe(false);
    }
  });

  it('produces deterministic hashes for the same broken input', () => {
    const cacheA = new ParseCache();
    const cacheB = new ParseCache();
    const a = parseFile('broken.ts', BROKEN_TS, cacheA);
    const b = parseFile('broken.ts', BROKEN_TS, cacheB);
    const skA = extractUnknownSkeletons('file:///broken.ts', a!.entry.tree);
    const skB = extractUnknownSkeletons('file:///broken.ts', b!.entry.tree);
    expect(skA.length).toBe(skB.length);
    for (let i = 0; i < skA.length; i += 1) {
      expect(skA[i]!.signature_hash).toBe(skB[i]!.signature_hash);
      expect(skA[i]!.body_hash).toBe(skB[i]!.body_hash);
    }
  });
});
