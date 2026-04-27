// MCP tool family: trace.*  (query trace events, replay a task, fetch
// monitor verdicts). Delegates to ../../trace/. Implementations land in Phase 4.

import type { ToolDefinition } from '../tool-definition.js';

export const MCP_TOOLS_TRACE_PLACEHOLDER = 'trace.*';

export const traceToolDefinitions: ToolDefinition[] = [];
