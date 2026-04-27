// Zod schema for `obligation` — the verifier-resolvable claim attached to an
// intent or constraint. Status enum: pending | verified | failed | rejected.

import { z } from 'zod';

export const ObligationSchemaPlaceholder = z
  .object({})
  .describe('obligation row — schema TBD in Phase 0');
