// Zod schema for `obligation` — the verifier-resolvable claim attached to an
// intent or constraint. Tech-Spec §4.3 pins the columns; ADR-0016 pins the
// `kind` enum so the Verifier interface can reference it without a follow-up
// schema migration.

import { z } from 'zod';

export const ObligationKindSchema = z.enum([
  'property',
  'typecheck',
  'formal',
  'example',
  'metamorphic',
]);
export type ObligationKind = z.infer<typeof ObligationKindSchema>;

export const ObligationSourceSchema = z.enum(['llm', 'human', 'mined']);
export type ObligationSource = z.infer<typeof ObligationSourceSchema>;

export const ObligationStatusSchema = z.enum(['pending', 'verified', 'failed', 'rejected']);
export type ObligationStatus = z.infer<typeof ObligationStatusSchema>;

// `filters_passed` is stored as a JSON-encoded string array on disk (TEXT
// column, default '[]') per tech-spec §4.3. App-layer reads parse it through
// this schema; writes are responsible for JSON.stringify before insert.
export const ObligationFiltersPassedSchema = z
  .string()
  .transform((s, ctx) => {
    try {
      return JSON.parse(s) as unknown;
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `filters_passed is not valid JSON: ${(e as Error).message}`,
      });
      return z.NEVER;
    }
  })
  .pipe(z.array(z.string()));

export const ObligationRowSchema = z.object({
  id: z.string(),
  intent_node_id: z.string(),
  kind: ObligationKindSchema,
  source: ObligationSourceSchema,
  test_code: z.string(),
  rationale: z.string().nullable(),
  status: ObligationStatusSchema,
  filters_passed: ObligationFiltersPassedSchema,
  counterexample_node_id: z.string().nullable(),
  last_run_at: z.number().int().nullable(),
  created_at: z.number().int(),
});
export type ObligationRow = z.infer<typeof ObligationRowSchema>;
