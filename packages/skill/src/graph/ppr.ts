// Personalized PageRank in-process via graphology + graphology-metrics.
// Seeded by sqlite-vec top-K with weights = similarity. ~10 iters × ~10ms/iter
// at 100k nodes. No Python sidecar, no recursive CTEs.

export const GRAPH_PPR_PLACEHOLDER = 'graph-ppr';
