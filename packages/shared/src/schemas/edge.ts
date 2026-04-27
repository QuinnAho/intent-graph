// Zod schema for the `edge` row. Tech-Spec §4.2 pins the nine edge kinds and
// the unique-when-live constraint on (src, dst, kind).

import { z } from 'zod';

export const EdgeKindSchema = z.enum([
  'realizes',
  'constrains',
  'decides',
  'justifies',
  'supersedes',
  'syncs_with',
  'depends_on',
  'produced_by',
  'references',
]);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const EdgeRowSchema = z.object({
  id: z.string(),
  src: z.string(),
  dst: z.string(),
  kind: EdgeKindSchema,
  weight: z.number(),
  body: z.string().nullable(),
  created_at: z.number().int(),
  deleted_at: z.number().int().nullable(),
});
export type EdgeRow = z.infer<typeof EdgeRowSchema>;
