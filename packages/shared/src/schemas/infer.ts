// Inferred intent (lane 9): what the model must return for one source folder.
// Limits mirror tuning in packages/skill/src/infer/tuning.ts. Confidence uses the
// ADR-0022 words: `inferred` when the code states its purpose plainly, `semantic`
// when the purpose is a heuristic reading.

import { z } from 'zod';

export const InferConfidenceSchema = z.enum(['inferred', 'semantic']);
export type InferConfidence = z.infer<typeof InferConfidenceSchema>;

export const InferProposalSchema = z.object({
  title: z.string().min(1).max(90),
  body: z.string().min(1).max(400),
  anchors: z.array(z.string().min(1)).min(2).max(8),
  belongs_under: z.string().nullable(),
  restates: z.string().nullable(),
  confidence: InferConfidenceSchema,
});
export type InferProposal = z.infer<typeof InferProposalSchema>;

export const InferReplySchema = z.object({
  proposals: z.array(InferProposalSchema).min(1).max(3),
});
export type InferReply = z.infer<typeof InferReplySchema>;

/** A proposal as the report carries it: the model's reading plus what the script works out. */
export const InferProposalRowSchema = InferProposalSchema.extend({
  id: z.string().min(1),
  folder: z.string().min(1),
  /** True when every file the anchors cite is a placeholder. Set from the code, never by the model. */
  planned: z.boolean(),
  code_hash: z.string().min(1),
});
export type InferProposalRow = z.infer<typeof InferProposalRowSchema>;
