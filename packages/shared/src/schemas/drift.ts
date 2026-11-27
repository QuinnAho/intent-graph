// Drift check verdicts and report rows (lane 2 prototype, ADR-0030 binding status `drift`).
// Field names follow the monitor verdict in .claude/agents/monitor.md where they fit:
// `evidence` is a quote, the action is one line. Confidence is a category (ADR-0022).

import { z } from 'zod';

export const DriftVerdictSchema = z.enum(['aligned', 'drift', 'unclear']);
export type DriftVerdict = z.infer<typeof DriftVerdictSchema>;

// how sure the judge is of its own verdict. a category, never a number (ADR-0022).
export const DriftJudgeConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type DriftJudgeConfidence = z.infer<typeof DriftJudgeConfidenceSchema>;

/** What the judge model must return, one object per (node, change) pair. */
export const DriftJudgeOutputSchema = z.object({
  node_id: z.string().min(1),
  verdict: DriftVerdictSchema,
  confidence: DriftJudgeConfidenceSchema,
  evidence: z.string(),
  suggested_action: z.string(),
});
export type DriftJudgeOutput = z.infer<typeof DriftJudgeOutputSchema>;

// who settled the pair: the model, the normalised hash (no logic change), or nobody.
export const DriftDecidedBySchema = z.enum(['judge', 'hash', 'budget', 'error']);
export type DriftDecidedBy = z.infer<typeof DriftDecidedBySchema>;

export const DriftTargetStateSchema = z.object({
  anchor: z.string(),
  path: z.string(),
  symbol: z.string().nullable(),
  before_hash: z.string().nullable(),
  after_hash: z.string().nullable(),
  changed: z.boolean(),
  missing: z.boolean(),
});
export type DriftTargetState = z.infer<typeof DriftTargetStateSchema>;

/** One report row per (commit, node) pair. */
export const DriftPairReportSchema = z.object({
  commit: z.string(),
  node_id: z.string(),
  targets: z.array(DriftTargetStateSchema),
  decided_by: DriftDecidedBySchema,
  verdict: DriftVerdictSchema,
  confidence: DriftJudgeConfidenceSchema.nullable(),
  evidence: z.string(),
  /** False when the judge's quote is not found in the diff it was shown. */
  evidence_in_diff: z.boolean().nullable(),
  suggested_action: z.string(),
  truncated: z.boolean(),
  diff_chars: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative(),
  seconds: z.number().nonnegative(),
  judge_model: z.string().nullable(),
  error: z.string().nullable(),
});
export type DriftPairReport = z.infer<typeof DriftPairReportSchema>;
