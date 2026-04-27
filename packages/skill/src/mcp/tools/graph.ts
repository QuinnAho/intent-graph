// MCP tool family: graph.*  (query, get_node, upsert_node, upsert_edge,
// delete, diff_against_code). Inputs and outputs validated against Zod
// schemas from @intentgraph/shared/schemas. Implementations land in Phase 2/3.

import type { ToolDefinition } from '../tool-definition.js';

export const MCP_TOOLS_GRAPH_PLACEHOLDER = 'graph.*';

export const graphToolDefinitions: ToolDefinition[] = [];
