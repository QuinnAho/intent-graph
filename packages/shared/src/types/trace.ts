// Derived TS type for a trace_event row.

import type { z } from 'zod';
import type { TraceEventSchemaPlaceholder } from '../schemas/trace.js';

export type TraceEvent = z.infer<typeof TraceEventSchemaPlaceholder>;
