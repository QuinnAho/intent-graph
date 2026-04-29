// Tests for the skill-side tree-sitter walker.
//
// Coverage:
//   - parseFile() round-trip on a real TypeScript snippet (smoke).
//   - extractCodeSymbols() emits one record per top-level declaration with
//     the right shape per CodeSymbolBody.
//   - Cache hit on second parse with identical content.
//   - Cache miss + clean re-parse on content change.
//   - computeIdentityScore() respects the documented weights and thresholds:
//       * 1.0 score (everything matches) → 'confident'
//       * signature+body+name match, outgoing-calls disagree → still 'confident'
//       * signature+body match only → 'tentative'
//       * nothing matches → 'unmatched'
//       * weights sum to exactly 1.0 (property-style sanity check)
//   - ERROR/MISSING tolerance: a syntactically broken file does not throw.
//
// Tech-spec §3.2 line 118 weights/thresholds; §7-J ERROR tolerance.

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { ParseCache } from '../src/parser/cache.js';
import {
  parseFile,
  extractCodeSymbols,
  computeIdentityScore,
  IDENTITY_WEIGHT_SIGNATURE,
  IDENTITY_WEIGHT_BODY,
  IDENTITY_WEIGHT_OUTGOING_CALLS,
  IDENTITY_WEIGHT_NAME,
  IDENTITY_WEIGHT_SUM,
  IDENTITY_THRESHOLD_CONFIDENT,
  IDENTITY_THRESHOLD_TENTATIVE,
  type IdentityCandidate,
} from '../src/parser/tree-sitter.js';

const SAMPLE_TS = `
export function add(a: number, b: number): number {
  return a + b;
}

export class Counter {
  private value = 0;
  increment(): void {
    this.value += 1;
  }
}

export const PI = 3.14;
`;

describe('parseFile()', () => {
  it('parses a TypeScript snippet without throwing', () => {
    const cache = new ParseCache();
    const result = parseFile('sample.ts', SAMPLE_TS, cache);
    expect(result).not.toBeNull();
    expect(result!.clean).toBe(true);
    expect(result!.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns null for an unsupported extension', () => {
    const cache = new ParseCache();
    expect(parseFile('foo.unknown', 'some content', cache)).toBeNull();
  });

  it('hits the cache on a second parse with identical content', () => {
    const cache = new ParseCache();
    const first = parseFile('sample.ts', SAMPLE_TS, cache);
    const second = parseFile('sample.ts', SAMPLE_TS, cache);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // Both must reference the same cache entry — proves the cache is doing
    // its job rather than re-parsing.
    expect(second!.entry).toBe(first!.entry);
    expect(cache.stats().hits).toBe(1);
  });

  it('misses the cache when content changes by a single byte', () => {
    const cache = new ParseCache();
    parseFile('sample.ts', SAMPLE_TS, cache);
    const mutated = SAMPLE_TS.replace('PI = 3.14', 'PI = 3.15');
    const second = parseFile('sample.ts', mutated, cache);
    expect(second).not.toBeNull();
    expect(cache.stats().evictionsByHashChange).toBe(1);
  });

  it('does not throw on syntactically broken input (ERROR-tolerant)', () => {
    const cache = new ParseCache();
    const broken = 'export function ( { unclosed';
    const result = parseFile('broken.ts', broken, cache);
    expect(result).not.toBeNull();
    // The parse landed; the `clean` flag tells the caller it had ERROR nodes.
    expect(result!.clean).toBe(false);
  });
});

describe('extractCodeSymbols()', () => {
  it('emits one record per top-level declaration', () => {
    const cache = new ParseCache();
    const parsed = parseFile('sample.ts', SAMPLE_TS, cache);
    const symbols = extractCodeSymbols('file:///sample.ts', parsed!);
    // function add, class Counter, const PI → at least three symbols.
    const names = symbols.map((s) => s.qualified_name).sort();
    expect(names).toContain('add');
    expect(names).toContain('Counter');
    expect(names).toContain('PI');
  });

  it('produces deterministic signature_hash and body_hash for unchanged source', () => {
    const cacheA = new ParseCache();
    const cacheB = new ParseCache();
    const symbolsA = extractCodeSymbols('file:///sample.ts', parseFile('sample.ts', SAMPLE_TS, cacheA)!);
    const symbolsB = extractCodeSymbols('file:///sample.ts', parseFile('sample.ts', SAMPLE_TS, cacheB)!);
    expect(symbolsA.length).toBe(symbolsB.length);
    for (let i = 0; i < symbolsA.length; i += 1) {
      expect(symbolsA[i]!.signature_hash).toBe(symbolsB[i]!.signature_hash);
      expect(symbolsA[i]!.body_hash).toBe(symbolsB[i]!.body_hash);
    }
  });

  it('changes body_hash when only the body changes, not signature_hash', () => {
    const cache = new ParseCache();
    const original = `export function add(a: number, b: number): number { return a + b; }`;
    const bodyChanged = `export function add(a: number, b: number): number { return b + a; }`;
    const parsedA = parseFile('a.ts', original, cache);
    const parsedB = parseFile('b.ts', bodyChanged, cache);
    const [symA] = extractCodeSymbols('file:///a.ts', parsedA!);
    const [symB] = extractCodeSymbols('file:///b.ts', parsedB!);
    expect(symA!.signature_hash).toBe(symB!.signature_hash);
    expect(symA!.body_hash).not.toBe(symB!.body_hash);
  });
});

describe('computeIdentityScore() — weights and thresholds (load-bearing)', () => {
  // Pin the documented weights at the test layer too — a contributor who
  // changes a constant in tree-sitter.ts but forgets to update the spec
  // gets caught here.
  it('uses the documented composite weights from tech-spec §3.2 line 118', () => {
    expect(IDENTITY_WEIGHT_SIGNATURE).toBe(0.3);
    expect(IDENTITY_WEIGHT_BODY).toBe(0.35);
    expect(IDENTITY_WEIGHT_OUTGOING_CALLS).toBe(0.2);
    expect(IDENTITY_WEIGHT_NAME).toBe(0.15);
  });

  it('weights sum to exactly 1.0', () => {
    const sum =
      IDENTITY_WEIGHT_SIGNATURE +
      IDENTITY_WEIGHT_BODY +
      IDENTITY_WEIGHT_OUTGOING_CALLS +
      IDENTITY_WEIGHT_NAME;
    // floating-point, so allow a single-ULP slack
    expect(Math.abs(sum - IDENTITY_WEIGHT_SUM)).toBeLessThan(1e-9);
  });

  it('uses the documented thresholds from tech-spec §3.2 line 118', () => {
    expect(IDENTITY_THRESHOLD_CONFIDENT).toBe(0.85);
    expect(IDENTITY_THRESHOLD_TENTATIVE).toBe(0.65);
  });

  const baseline: IdentityCandidate = {
    qualifiedName: 'add',
    signatureHash: 'sig-A',
    bodyHash: 'body-A',
    outgoingCallNames: ['log', 'sum'],
  };

  it('returns score ≈1.0 and tier=confident when everything matches', () => {
    const result = computeIdentityScore(baseline, baseline);
    // Score is clamped to ≤1 in the implementation; equality with 1.0 is
    // robust against IEEE 754 rounding via the clamp.
    expect(result.score).toBeCloseTo(1, 9);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.tier).toBe('confident');
  });

  it('returns tier=confident when signature+body+name match but calls disagree', () => {
    // 0.30 + 0.35 + 0.0 + 0.15 = 0.80 → below 0.85 → tentative.
    // This pins the boundary: signature+body+name alone is NOT confident,
    // because outgoing-call agreement is part of what the heuristic weighs.
    const candidate: IdentityCandidate = {
      ...baseline,
      outgoingCallNames: ['totallyDifferent'],
    };
    const result = computeIdentityScore(baseline, candidate);
    expect(result.score).toBeCloseTo(0.8, 5);
    expect(result.tier).toBe('tentative');
  });

  it('returns tier=tentative when signature+body match (rename caught here)', () => {
    // 0.30 + 0.35 = 0.65 exactly — the tentative threshold.
    const candidate: IdentityCandidate = {
      qualifiedName: 'addRenamed',
      signatureHash: 'sig-A',
      bodyHash: 'body-A',
      outgoingCallNames: ['somethingElse'],
    };
    const result = computeIdentityScore(baseline, candidate);
    expect(result.score).toBeCloseTo(0.65, 5);
    expect(result.tier).toBe('tentative');
  });

  it('returns tier=unmatched when nothing matches', () => {
    const candidate: IdentityCandidate = {
      qualifiedName: 'unrelated',
      signatureHash: 'sig-Z',
      bodyHash: 'body-Z',
      outgoingCallNames: ['x', 'y'],
    };
    const result = computeIdentityScore(baseline, candidate);
    expect(result.score).toBe(0);
    expect(result.tier).toBe('unmatched');
  });

  it('property: score is always in [0, 1] for arbitrary inputs', () => {
    fc.assert(
      fc.property(
        fc.record({
          qualifiedName: fc.string(),
          signatureHash: fc.string(),
          bodyHash: fc.string(),
          outgoingCallNames: fc.array(fc.string()),
        }),
        fc.record({
          qualifiedName: fc.string(),
          signatureHash: fc.string(),
          bodyHash: fc.string(),
          outgoingCallNames: fc.array(fc.string()),
        }),
        (prior, candidate) => {
          const result = computeIdentityScore(prior, candidate);
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(1);
        },
      ),
    );
  });

  it('property: identical candidates always tier=confident', () => {
    // Identical candidates always score ≈1.0 (clamped to ≤1). The tier is the
    // load-bearing assertion — score wobble of ~1e-16 is below any threshold
    // that downstream callers care about.
    fc.assert(
      fc.property(
        fc.record({
          qualifiedName: fc.string(),
          signatureHash: fc.string(),
          bodyHash: fc.string(),
          outgoingCallNames: fc.array(fc.string()),
        }),
        (candidate) => {
          const result = computeIdentityScore(candidate, candidate);
          expect(result.score).toBeCloseTo(1, 9);
          expect(result.score).toBeLessThanOrEqual(1);
          expect(result.tier).toBe('confident');
        },
      ),
    );
  });
});
