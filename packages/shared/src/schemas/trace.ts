// Zod schema for `trace_event` (tech-spec §4.7) and `event_log` (§4.6) and
// `retrieval` (§4.8) and `row_audit` (§4.9). These four tables form the
// faithfulness substrate (ADR-0005) — every model call records concrete
// artifacts here, the hash-chained event_log is canonical, row_audit and
// retrieval are projections.

import { z } from 'zod';

// JSON-bearing TEXT columns are stored as serialized JSON on disk; app-layer
// reads parse them through this helper, which fails the row's parse with a
// typed error rather than throwing. Writes JSON.stringify before insert.
function jsonColumn<T extends z.ZodTypeAny>(inner: T): z.ZodPipeline<
  z.ZodEffects<z.ZodString, unknown, string>,
  T
> {
  return z
    .string()
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch (e) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `column is not valid JSON: ${(e as Error).message}`,
        });
        return z.NEVER;
      }
    })
    .pipe(inner);
}

export const TraceEventKindSchema = z.enum([
  'model_call',
  'tool_call',
  'retrieval',
  'verifier',
  'monitor',
  'mutation',
]);
export type TraceEventKind = z.infer<typeof TraceEventKindSchema>;

export const TraceEventStatusSchema = z.enum(['ok', 'error', 'guardrail_tripped']);
export type TraceEventStatus = z.infer<typeof TraceEventStatusSchema>;

export const MonitorVerdictCategorySchema = z.enum([
  'reward_hack',
  'intent_drift',
  'hallucinated_spec',
  'capability_misuse',
  'obfuscation',
]);
export type MonitorVerdictCategory = z.infer<typeof MonitorVerdictCategorySchema>;

export const MonitorRecommendedActionSchema = z.enum([
  'allow',
  'require_human_review',
  'block',
]);
export type MonitorRecommendedAction = z.infer<typeof MonitorRecommendedActionSchema>;

export const MonitorVerdictSchema = z.object({
  flagged: z.boolean(),
  score: z.number(),
  categories: z.array(MonitorVerdictCategorySchema),
  evidence: z.string(),
  recommended_action: MonitorRecommendedActionSchema,
  monitor_model: z.string(),
});
export type MonitorVerdict = z.infer<typeof MonitorVerdictSchema>;

export const TraceUsageSchema = z.object({
  in: z.number().int().nonnegative(),
  out: z.number().int().nonnegative(),
  reasoning_tokens: z.number().int().nonnegative().optional(),
  cached_in: z.number().int().nonnegative().optional(),
});
export type TraceUsage = z.infer<typeof TraceUsageSchema>;

export const TraceToolCallSchema = z.object({
  name: z.string(),
  args_hash: z.string(),
  args: z.unknown().optional(),
  result_hash: z.string(),
  result: z.unknown().optional(),
  ts: z.number().int(),
});
export type TraceToolCall = z.infer<typeof TraceToolCallSchema>;

export const TraceEventRowSchema = z.object({
  trace_id: z.string(),
  parent_trace_id: z.string().nullable(),
  task_node_id: z.string(),
  agent_id: z.string(),
  capability_id: z.string(),
  kind: TraceEventKindSchema,
  model: z.string().nullable(),
  model_version: z.string().nullable(),
  provider: z.string().nullable(),
  prompt_hash: z.string().nullable(),
  prompt_text: z.string().nullable(),
  reasoning_hash: z.string().nullable(),
  reasoning_text: z.string().nullable(),
  tool_calls: jsonColumn(z.array(TraceToolCallSchema)).nullable(),
  // The shapes for retrieved_node_ids / produced_mutations / verifier_outcomes
  // / probe_results are not fully specified in tech-spec §4.7 — leaving these
  // as opaque JSON-encoded strings until the producing subsystems land
  // (retrieval in phase 5, mutations in phase 4, verifiers in phase 4-5,
  // Goodfire Ember probes in v2+) and pin their schemas. Every row still
  // round-trips JSON; we just don't validate the shape yet.
  retrieved_node_ids: z.string().nullable(),
  produced_mutations: z.string().nullable(),
  verifier_outcomes: z.string().nullable(),
  monitor_verdict: jsonColumn(MonitorVerdictSchema).nullable(),
  probe_results: z.string().nullable(),
  usage: jsonColumn(TraceUsageSchema),
  cost_usd: z.number(),
  latency_ms: z.number().int().nonnegative(),
  ttft_ms: z.number().int().nonnegative().nullable(),
  status: TraceEventStatusSchema,
  error: z.string().nullable(),
  started_at: z.number().int(),
  ended_at: z.number().int(),
});
export type TraceEventRow = z.infer<typeof TraceEventRowSchema>;

// Tech-spec §4.6 — semantic, hash-chained event log. payload + prev_hash + hash
// are stored as BLOB on disk; the row schema models the raw byte arrays.
export const EventLogRowSchema = z.object({
  id: z.number().int(),
  ts: z.number().int(),
  actor: z.string(),
  kind: z.string(),
  task_id: z.string().nullable(),
  trace_id: z.string().nullable(),
  payload: z.instanceof(Uint8Array),
  prev_hash: z.instanceof(Uint8Array).nullable(),
  hash: z.instanceof(Uint8Array),
});
export type EventLogRow = z.infer<typeof EventLogRowSchema>;

// Tech-spec §4.8 — PPR retrieval cache.
export const RetrievalAlgorithmSchema = z.enum(['vec_only', 'vec+ppr', 'bm25', 'hybrid']);
export type RetrievalAlgorithm = z.infer<typeof RetrievalAlgorithmSchema>;

// Per tech-spec §4.8 the JSON shape of seed_node_ids is `[{node_id, similarity}]`
// and ppr_top_k is `[{node_id, score}]`.
export const RetrievalSeedSchema = z.object({
  node_id: z.string(),
  similarity: z.number(),
});
export type RetrievalSeed = z.infer<typeof RetrievalSeedSchema>;

export const RetrievalScoredNodeSchema = z.object({
  node_id: z.string(),
  score: z.number(),
});
export type RetrievalScoredNode = z.infer<typeof RetrievalScoredNodeSchema>;

export const RetrievalRowSchema = z.object({
  id: z.string(),
  trace_id: z.string().nullable(),
  query_hash: z.string(),
  query_text: z.string().nullable(),
  seed_node_ids: jsonColumn(z.array(RetrievalSeedSchema)),
  ppr_top_k: jsonColumn(z.array(RetrievalScoredNodeSchema)),
  algorithm: RetrievalAlgorithmSchema,
  embedding_model: z.string().nullable(),
  k: z.number().int().nonnegative(),
  latency_ms: z.number().int().nonnegative(),
  created_at: z.number().int(),
});
export type RetrievalRow = z.infer<typeof RetrievalRowSchema>;

// Tech-spec §4.9 — CDC audit log written by AFTER triggers on tracked tables.
export const RowAuditOpSchema = z.enum(['I', 'U', 'D']);
export type RowAuditOp = z.infer<typeof RowAuditOpSchema>;

export const RowAuditRowSchema = z.object({
  id: z.number().int(),
  ts: z.number().int(),
  tx_id: z.number().int().nullable(),
  tbl: z.string(),
  op: RowAuditOpSchema,
  rowid: z.number().int().nullable(),
  before: z.string().nullable(),
  after: z.string().nullable(),
});
export type RowAuditRow = z.infer<typeof RowAuditRowSchema>;
