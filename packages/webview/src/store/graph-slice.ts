// Zustand slice: nodes, edges, selection, viewport. Mutations go through
// narrow setters so React Flow can subscribe without re-rendering on
// unrelated changes.

export const STORE_GRAPH_SLICE_PLACEHOLDER = 'store-graph-slice';
