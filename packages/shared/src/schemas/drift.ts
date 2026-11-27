// Drift check verdicts and report rows (lane 2 prototype, ADR-0030 binding status `drift`).
// Field names follow the monitor verdict in .claude/agents/monitor.md where they fit:
// `evidence` is a quote, the action is one line. Confidence is a category (ADR-0022).

import { z } from 'zod';

import { NodeConfidenceSchema } from './node.js';

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

// who settled the pair: the model, the normalised hash (no logic change), a target
// that does not exist, or nobody (budget spent, or the judge or parser failed).
export const DriftDecidedBySchema = z.enum(['judge', 'hash', 'missing', 'budget', 'error']);
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
  /** ADR-0022 provenance: extracted (hash, missing target), inferred (judge), semantic (nobody decided). */
  confidence: NodeConfidenceSchema,
  /** How sure the decider is: the judge's own word, high for a hash or a missing target, low when nobody decided. */
  certainty: DriftJudgeConfidenceSchema,
  /** A quote from the diff for a judge row, a plain sentence saying why for every other row. Never empty. */
  evidence: z.string().min(1),
  /** True only when a judge quote was found in the diff it was shown. */
  evidence_in_diff: z.boolean(),
  suggested_action: z.string().min(1),
  truncated: z.boolean(),
  diff_chars: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative(),
  seconds: z.number().nonnegative(),
  judge_model: z.string().nullable(),
  error: z.string().nullable(),
});
export type DriftPairReport = z.infer<typeof DriftPairReportSchema>;

/** The drift mark on a live graph node: the worst verdict the newest report holds for it. */
export const LiveDriftSchema = z.object({
  verdict: DriftVerdictSchema,
  evidence: z.string(),
  suggested_action: z.string(),
  commit: z.string(),
  decided_by: DriftDecidedBySchema,
  /** ISO time the report was written */
  reported_at: z.string(),
  /** how many report entries this node has */
  entries: z.number().int().positive(),
  /** a bound source file changed after the report was written */
  stale: z.boolean(),
});
export type LiveDrift = z.infer<typeof LiveDriftSchema>;
