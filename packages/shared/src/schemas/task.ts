// Zod schema for the materialized task view (`node` rows where kind='task').
// Used by the orchestrator and surfaced to the UI as the drift inbox / task list.

import { z } from 'zod';

export const TaskSchemaPlaceholder = z
  .object({})
  .describe('task view — schema TBD in Phase 0');
