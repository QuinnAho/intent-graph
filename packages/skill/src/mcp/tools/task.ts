// MCP tool family: task.*  (create, lease, heartbeat, release,
// propose_patch, accept_patch, reject_patch). Lease-bearing tools
// require a fence token from @intentgraph/shared/ids.
// Implementations land in Phase 4.

import type { ToolDefinition } from '../tool-definition.js';

export const MCP_TOOLS_TASK_PLACEHOLDER = 'task.*';

export const taskToolDefinitions: ToolDefinition[] = [];
