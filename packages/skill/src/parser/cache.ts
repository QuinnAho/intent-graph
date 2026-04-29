// Skill-side incremental parse cache.
//
// Tech-Spec §3.2 line 116: "Two parsers, one source of truth. Extension owns
// the live CST per open file (incremental `tree.edit`); skill owns project-wide
// CST cache for non-open files. Avoid double-parsing." This module is the
// skill's half — whole-file caching keyed by content hash. The extension's
// `tree.edit` path is intentionally not implemented here.
//
// ## Invalidation discipline (load-bearing)
//
// The cache key is (path, contentHash). A cache entry is valid iff the file's
// SHA-256 content hash matches the entry's stored hash. Whenever the cache is
// queried with a new content hash for an existing path, the prior entry is
// evicted before the new one is inserted. This is the only invalidation path.
//
// What this means for callers:
//
// 1. The cache MUST be queried with a fresh `contentHash` computed from the
//    current file bytes. Re-using a stale hash is a caller bug, not a cache
//    bug. The walker computes the hash once per file per pass and threads it
//    through.
// 2. mtime is NOT used for invalidation. mtime can lie (touch with no content
//    change, restored backups with old mtime, content-change with same
//    mtime due to fs precision), and the silent-staleness failure mode is
//    exactly what tree-sitter caches get wrong elsewhere. Content hash is
//    the only honest answer.
// 3. There is no LRU bound in v1. The skill subprocess restarts on workspace
//    open per tech-spec §6 phase 3 line 450 ("activation event lazy-starts
//    skill subprocess"); the cache lives for the session. Phase 6 hardening
//    (tech-spec.md:478, "performance hardening") may add an LRU bound when
//    we have telemetry on cache size in real workspaces.
// 4. A `tree` reference in the cache holds native memory through the
//    tree-sitter binding. `evict(path)` and `clear()` drop the reference so
//    the GC can reclaim the native tree. Long-running sessions that mutate
//    many files therefore see memory recovered as files change.
//
// The deliberate non-feature: this cache does not call `tree.edit()`. The
// skill never has the prior-edit information needed to do an incremental
// reparse correctly — that information lives in the extension host where the
// user is typing. Trying to fake it here would be the failure mode the
// two-parser split exists to prevent.

import { createHash } from 'node:crypto';

export interface ParseCacheEntry {
  /** Native tree-sitter tree (opaque to TypeScript). */
  readonly tree: unknown;
  /** SHA-256 of the file bytes that produced this tree. */
  readonly contentHash: string;
  /** Bytes of the source content; surfaces in walker telemetry. */
  readonly byteSize: number;
  /** Wall-clock time the parse landed. Diagnostic only. */
  readonly parsedAt: number;
}

export interface ParseCacheStats {
  readonly entries: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictionsByHashChange: number;
  readonly evictionsExplicit: number;
}

/**
 * Compute the canonical content hash used as the invalidation key. Callers
 * should use this helper rather than rolling their own — keeping the hash
 * algorithm in one place ensures the cache and the producer agree.
 */
export function computeContentHash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export class ParseCache {
  private readonly entries = new Map<string, ParseCacheEntry>();
  private hits = 0;
  private misses = 0;
  private evictionsByHashChange = 0;
  private evictionsExplicit = 0;

  /**
   * Look up a cached parse. Returns the entry only if the stored content hash
   * matches the supplied hash. Mismatches evict the stale entry as a side
   * effect — this is the load-bearing invalidation rule.
   */
  get(path: string, contentHash: string): ParseCacheEntry | null {
    const entry = this.entries.get(path);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (entry.contentHash !== contentHash) {
      // Stale — drop it now so the caller does not have to. The next set()
      // call will land the fresh tree.
      this.entries.delete(path);
      this.evictionsByHashChange += 1;
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    return entry;
  }

  /**
   * Insert or replace a cached parse. Replacing an existing entry counts as
   * an explicit eviction — callers who replace without first calling get()
   * with the new hash are correct, but the stats still account for the prior
   * entry being dropped so memory accounting stays honest.
   */
  set(path: string, entry: ParseCacheEntry): void {
    if (this.entries.has(path)) {
      this.evictionsExplicit += 1;
    }
    this.entries.set(path, entry);
  }

  /** Drop a single path. Callers use this when a file is deleted on disk. */
  evict(path: string): boolean {
    const existed = this.entries.delete(path);
    if (existed) {
      this.evictionsExplicit += 1;
    }
    return existed;
  }

  /** Drop everything. Used at the end of a full-walk pass for tests. */
  clear(): void {
    this.evictionsExplicit += this.entries.size;
    this.entries.clear();
  }

  /** Diagnostic snapshot. */
  stats(): ParseCacheStats {
    return {
      entries: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      evictionsByHashChange: this.evictionsByHashChange,
      evictionsExplicit: this.evictionsExplicit,
    };
  }

  /** Test seam: zero out hit/miss counters without dropping entries. */
  _resetStatsForTests(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictionsByHashChange = 0;
    this.evictionsExplicit = 0;
  }
}
