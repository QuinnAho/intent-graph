// Zod schema for `trace_event` — the concrete-artifact recording for every
// agent action. Reasoning text lives in a separate TTL-bounded low-trust column.

import { z } from 'zod';

export const TraceEventSchemaPlaceholder = z
  .object({})
  .describe('trace_event row — schema TBD in Phase 0');
