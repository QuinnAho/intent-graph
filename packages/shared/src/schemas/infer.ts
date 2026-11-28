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
  /** the script keeps a proposal while one anchor survives its check, so a row can hold 1 to 8 (the model is asked for 2 to 8) */
  anchors: z.array(z.string().min(1)).min(1).max(8),
  id: z.string().min(1),
  folder: z.string().min(1),
  /** True when every file the anchors cite is a placeholder. Set from the code, never by the model. */
  planned: z.boolean(),
  code_hash: z.string().min(1),
});
export type InferProposalRow = z.infer<typeof InferProposalRowSchema>;

/** What the live graph carries on an inferred node (lane 10): the proposal, ready to accept or dismiss. */
export const LiveInferredSchema = z.object({
  proposal_id: z.string().min(1),
  folder: z.string().min(1),
  anchors: z.array(z.string().min(1)),
  confidence: InferConfidenceSchema,
  planned: z.boolean(),
  /** a declared intent the model says this restates, and its title when it is in the graph */
  restates: z.string().nullable(),
  restates_title: z.string().nullable(),
  belongs_under: z.string().nullable(),
  code_hash: z.string().min(1),
});
export type LiveInferred = z.infer<typeof LiveInferredSchema>;
