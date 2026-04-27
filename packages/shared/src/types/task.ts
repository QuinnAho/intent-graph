// Derived TS type for the materialized task view.

import type { z } from 'zod';
import type { TaskSchemaPlaceholder } from '../schemas/task.js';

export type Task = z.infer<typeof TaskSchemaPlaceholder>;
