// Composes vec_only / bm25 / vec+ppr / hybrid retrieval modes. PPR seeds come
// from this module then run through ../graph/ppr.ts. Persists every search to
// retrieval_event for the eval harness.

export const RETRIEVAL_HYBRID_SEARCH_PLACEHOLDER = 'retrieval-hybrid-search';
