// Tiny query DSL parser for graph.query — accepts {dsl} or {sql} or a
// structured filter ({kind?, parent?, limit?, cursor?}). Compiles to
// parameterized SQL against the Drizzle client.

export const GRAPH_QUERY_DSL_PLACEHOLDER = 'graph-query-dsl';
