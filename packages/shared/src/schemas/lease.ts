// Zod schema for `lease` — advisory (node_id, scope) reservation with TTL.
// Pairs with the FenceToken type from ../ids.

import { z } from 'zod';

export const LeaseSchemaPlaceholder = z
  .object({})
  .describe('lease row — schema TBD in Phase 0');
