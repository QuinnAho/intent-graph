// Tests for the skill-side parse cache.
//
// The load-bearing property is invalidation: a cache that doesn't invalidate
// cleanly produces silent staleness that's hard to debug downstream. The
// tests below pin the rules from cache.ts:
//   1. Same content hash → cache hit, returns the prior tree object identity.
//   2. Different content hash → cache miss, prior entry is evicted.
//   3. Eviction stats account for hash-change evictions separately from
//      explicit evict()/clear() calls.
//   4. computeContentHash is deterministic and content-only (not path-aware).

import { describe, expect, it } from 'vitest';

import { ParseCache, computeContentHash, type ParseCacheEntry } from '../src/parser/cache.js';

function fakeEntry(contentHash: string): ParseCacheEntry {
  return {
    tree: { sentinel: contentHash } as unknown,
    contentHash,
    byteSize: contentHash.length,
    parsedAt: 1700000000000,
  };
}

describe('computeContentHash', () => {
  it('is deterministic for the same input', () => {
    const a = computeContentHash('export const x = 1;\n');
    const b = computeContentHash('export const x = 1;\n');
    expect(a).toBe(b);
  });

  it('changes when the input changes by a single byte', () => {
    const a = computeContentHash('export const x = 1;\n');
    const b = computeContentHash('export const x = 2;\n');
    expect(a).not.toBe(b);
  });

  it('produces a hex SHA-256 of the documented length', () => {
    const hash = computeContentHash('anything');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('ParseCache get/set basic behavior', () => {
  it('returns null on first lookup and counts a miss', () => {
    const cache = new ParseCache();
    expect(cache.get('foo.ts', 'hash-A')).toBeNull();
    expect(cache.stats().misses).toBe(1);
    expect(cache.stats().hits).toBe(0);
  });

  it('returns the entry on a matching-hash lookup and counts a hit', () => {
    const cache = new ParseCache();
    const entry = fakeEntry('hash-A');
    cache.set('foo.ts', entry);
    const got = cache.get('foo.ts', 'hash-A');
    expect(got).toBe(entry);
    expect(cache.stats().hits).toBe(1);
    expect(cache.stats().misses).toBe(0);
  });
});

describe('ParseCache invalidation discipline (load-bearing)', () => {
  it('evicts the prior entry when the content hash changes', () => {
    const cache = new ParseCache();
    const stale = fakeEntry('hash-A');
    cache.set('foo.ts', stale);

    // Lookup with the new hash must miss AND drop the stale entry.
    const result = cache.get('foo.ts', 'hash-B');
    expect(result).toBeNull();

    // Subsequent lookup with the OLD hash must also miss — the stale entry
    // was evicted, not just hidden behind the new hash.
    const oldLookup = cache.get('foo.ts', 'hash-A');
    expect(oldLookup).toBeNull();

    expect(cache.stats().evictionsByHashChange).toBe(1);
    expect(cache.stats().entries).toBe(0);
  });

  it('does NOT consult mtime or any field other than the content hash', () => {
    // A future contributor might be tempted to add an mtime check. This test
    // pins the invariant: only the content hash invalidates. Two entries with
    // the same content hash are interchangeable regardless of parsedAt.
    const cache = new ParseCache();
    cache.set('foo.ts', {
      tree: { id: 'first' } as unknown,
      contentHash: 'hash-A',
      byteSize: 100,
      parsedAt: 1,
    });

    const got = cache.get('foo.ts', 'hash-A');
    expect(got).not.toBeNull();
    // Different parsedAt would not have made the cache miss; it's diagnostic.
    expect(got?.contentHash).toBe('hash-A');
  });

  it('treats two distinct paths as independent even with identical hashes', () => {
    const cache = new ParseCache();
    cache.set('foo.ts', fakeEntry('shared-hash'));
    cache.set('bar.ts', fakeEntry('shared-hash'));

    expect(cache.get('foo.ts', 'shared-hash')).not.toBeNull();
    expect(cache.get('bar.ts', 'shared-hash')).not.toBeNull();
    expect(cache.stats().entries).toBe(2);
  });

  it('replaces a same-path entry on set() and counts an explicit eviction', () => {
    const cache = new ParseCache();
    cache.set('foo.ts', fakeEntry('hash-A'));
    cache.set('foo.ts', fakeEntry('hash-B'));

    // Replacement happened: the new entry is now resident.
    expect(cache.get('foo.ts', 'hash-B')).not.toBeNull();
    // Probing with the old hash misses (it would also evict, per the
    // invalidation rule — but we already proved the new entry is there).
    expect(cache.stats().evictionsExplicit).toBeGreaterThanOrEqual(1);
  });
});

describe('ParseCache explicit eviction', () => {
  it('evict() drops a single path and reports whether it existed', () => {
    const cache = new ParseCache();
    cache.set('foo.ts', fakeEntry('hash-A'));
    expect(cache.evict('foo.ts')).toBe(true);
    expect(cache.evict('foo.ts')).toBe(false);
    expect(cache.get('foo.ts', 'hash-A')).toBeNull();
  });

  it('clear() drops everything and counts evictions for each cleared entry', () => {
    const cache = new ParseCache();
    cache.set('a.ts', fakeEntry('hash-A'));
    cache.set('b.ts', fakeEntry('hash-B'));
    cache.set('c.ts', fakeEntry('hash-C'));
    cache.clear();
    expect(cache.stats().entries).toBe(0);
    expect(cache.stats().evictionsExplicit).toBe(3);
  });
});

describe('ParseCache stats accounting', () => {
  it('separates hash-change evictions from explicit evictions', () => {
    const cache = new ParseCache();
    cache.set('foo.ts', fakeEntry('hash-A'));
    cache.get('foo.ts', 'hash-B'); // hash-change eviction (+1 evictionsByHashChange)
    cache.set('bar.ts', fakeEntry('hash-X'));
    cache.evict('bar.ts'); // explicit eviction (+1 evictionsExplicit)

    const stats = cache.stats();
    expect(stats.evictionsByHashChange).toBe(1);
    expect(stats.evictionsExplicit).toBe(1);
  });
});
