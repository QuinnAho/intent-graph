// Derived TS type for a lease row.

import type { z } from 'zod';
import type { LeaseSchemaPlaceholder } from '../schemas/lease.js';

export type Lease = z.infer<typeof LeaseSchemaPlaceholder>;
