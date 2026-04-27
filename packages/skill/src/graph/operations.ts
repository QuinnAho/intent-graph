// Read/write operations against the graph: upsert node/edge, delete with OCC
// version check, diff against code. All writes funnel through here so the
// trace store sees every mutation.

export const GRAPH_OPERATIONS_PLACEHOLDER = 'graph-operations';
