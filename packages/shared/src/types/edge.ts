// Derived TS type for a graph edge.

import type { z } from 'zod';
import type { EdgeSchemaPlaceholder } from '../schemas/edge.js';

export type Edge = z.infer<typeof EdgeSchemaPlaceholder>;
