// The code a declared spec node is bound to (lane 13): one entry per realized_by anchor, in the
// file's order, as the live server sends it. Paths are always from the served root, never absolute.

import { z } from 'zod';

export const LiveCodeRefSchema = z.object({
  /** the anchor as written in the spec file */
  raw: z.string().min(1),
  /** the file, a path from the root with forward slashes */
  path: z.string().min(1),
  /** the symbol after #, when the anchor names one */
  name: z.string().min(1).optional(),
  /** the id of the code node the anchor resolved to, null when nothing in the graph matches */
  target: z.string().min(1).nullable(),
  /** the symbol's first line, counted from 1, set only when it resolved to a symbol */
  line: z.number().int().positive().optional(),
  /** the anchor names a symbol that is not there, so the file was linked instead */
  symbol_missing: z.boolean(),
});
export type LiveCodeRef = z.infer<typeof LiveCodeRefSchema>;
