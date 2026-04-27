// MCP tool family: retrieval.*  (search via vec+ppr | vec_only | bm25 | hybrid).
// Delegates to ../../retrieval/. Implementations land in Phase 5.

import type { ToolDefinition } from '../tool-definition.js';

export const MCP_TOOLS_RETRIEVAL_PLACEHOLDER = 'retrieval.*';

export const retrievalToolDefinitions: ToolDefinition[] = [];
