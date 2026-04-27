// Zod schema for `lease` — advisory (node_id, scope) reservation with TTL.
// Tech-Spec §4.4 pins the four scopes and the (node_id, scope) primary key;
// the fence_token is a monotonically-increasing integer drawn from `fence_seq`.

import { z } from 'zod';

export const LeaseScopeSchema = z.enum(['mutate', 'drift-fix', 'verify', 'plan']);
export type LeaseScope = z.infer<typeof LeaseScopeSchema>;

export const LeaseRowSchema = z.object({
  node_id: z.string(),
  scope: LeaseScopeSchema,
  holder: z.string(),
  reason: z.string().nullable(),
  expires_at: z.number().int(),
  acquired_at: z.number().int(),
  fence_token: z.number().int().nonnegative(),
});
export type LeaseRow = z.infer<typeof LeaseRowSchema>;

export const FenceSeqRowSchema = z.object({
  next: z.number().int().nonnegative(),
});
export type FenceSeqRow = z.infer<typeof FenceSeqRowSchema>;
