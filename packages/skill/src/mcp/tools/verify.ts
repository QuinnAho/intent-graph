// MCP tool family: verify.*  (run obligations, list verifiers, register MCP
// verifier plugins). Delegates to ../../verifiers/. Implementations land in Phase 4.

import type { ToolDefinition } from '../tool-definition.js';

export const MCP_TOOLS_VERIFY_PLACEHOLDER = 'verify.*';

export const verifyToolDefinitions: ToolDefinition[] = [];
