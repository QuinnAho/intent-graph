// Zod schemas for MCP tool inputs and outputs. One pair per tool, grouped
// by family (graph.*, retrieval.*, task.*, verify.*, trace.*).
// See Tech-Spec §3.x for tool surfaces. Filled in during Phase 1.

import { z } from 'zod';

export const McpToolIoPlaceholder = z
  .object({})
  .describe('MCP tool input/output envelopes — schema TBD in Phase 1');
