// Derived TS type for an obligation.

import type { z } from 'zod';
import type { ObligationSchemaPlaceholder } from '../schemas/obligation.js';

export type Obligation = z.infer<typeof ObligationSchemaPlaceholder>;
