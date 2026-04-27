// Derived TS type for a graph node, inferred from the matching Zod schema.

import type { z } from 'zod';
import type { NodeSchemaPlaceholder } from '../schemas/node.js';

export type Node = z.infer<typeof NodeSchemaPlaceholder>;
