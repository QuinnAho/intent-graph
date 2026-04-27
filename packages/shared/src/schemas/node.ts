// Zod schema for the `node` row — the universal vertex in the IntentGraph.
// Tech-Spec §4.1 pins the row columns and the per-kind `body` JSON shapes.
// Drizzle owns the on-disk column types in packages/skill/src/db/schema.ts;
// this module owns the application-layer Zod validation, including the
// per-kind body discriminator.

import { z } from 'zod';

export const NodeKindSchema = z.enum([
  'intent',
  'constraint',
  'rationale',
  'decision',
  'concept',
  'code_module',
  'code_symbol',
  'counterexample',
  'task',
]);
export type NodeKind = z.infer<typeof NodeKindSchema>;

export const NodeConfidenceSchema = z.enum(['extracted', 'inferred', 'semantic', 'asserted']);
export type NodeConfidence = z.infer<typeof NodeConfidenceSchema>;

// Per-kind body shapes — one Zod object per node kind, listed in the same
// order as tech-spec §4.1's `body` comment block.

export const IntentBodySchema = z.object({
  description: z.string(),
  owner_node: z.string().optional(),
  target_kinds: z.array(NodeKindSchema),
  priority: z.number().optional(),
});
export type IntentBody = z.infer<typeof IntentBodySchema>;

export const ConstraintBodySchema = z.object({
  predicate_kind: z.enum(['property', 'type', 'logical', 'example']),
  expr: z.string(),
  scope_node: z.string(),
});
export type ConstraintBody = z.infer<typeof ConstraintBodySchema>;

export const RationaleBodySchema = z.object({
  text: z.string(),
  references_node: z.array(z.string()),
});
export type RationaleBody = z.infer<typeof RationaleBodySchema>;

export const DecisionBodySchema = z.object({
  context: z.string(),
  alternatives: z.array(z.string()),
  chosen: z.string(),
  consequences: z.string(),
});
export type DecisionBody = z.infer<typeof DecisionBodySchema>;

export const ConceptBodySchema = z.object({
  description: z.string(),
  regeneration_scope: z.enum(['atomic', 'cooperative']),
});
export type ConceptBody = z.infer<typeof ConceptBodySchema>;

export const CodeModuleBodySchema = z.object({
  uri: z.string(),
  language: z.string(),
  file_hash: z.string(),
  scip_symbol: z.string().optional(),
});
export type CodeModuleBody = z.infer<typeof CodeModuleBodySchema>;

export const CodeSymbolBodySchema = z.object({
  uri: z.string(),
  range: z.object({
    start: z.object({ line: z.number().int(), column: z.number().int() }),
    end: z.object({ line: z.number().int(), column: z.number().int() }),
  }),
  qualified_name: z.string(),
  signature_hash: z.string(),
  body_hash: z.string(),
  scip_symbol: z.string().optional(),
});
export type CodeSymbolBody = z.infer<typeof CodeSymbolBodySchema>;

export const CounterexampleBodySchema = z.object({
  obligation_id: z.string(),
  input_repr: z.string(),
  input_hash: z.string(),
  shrink_steps: z.number().int().nonnegative(),
  shrinker: z.enum(['fast-check', 'hypothesis', 'hdd']),
  reproducer: z.string(),
  observed: z.string(),
  expected: z.string().optional(),
});
export type CounterexampleBody = z.infer<typeof CounterexampleBodySchema>;

// Storage-layer status enum from tech-spec §4.1. The `task_active` view
// (§4.5) also surfaces 'monitor_pending' in its WHERE clause — that is a
// view-only value the orchestrator computes from observed state, not a
// persisted task.status. The view's wider enum is TaskActiveStatusSchema in
// ./trace.ts? No — it lives here next to the storage enum (see
// TaskActiveStatusSchema below) so callers see both shapes in one place.
export const TaskStatusSchema = z.enum([
  'proposed',
  'leased',
  'running',
  'produced',
  'committed',
  'rejected',
  'rolled_back',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// View-layer status enum from tech-spec §4.5. The `task_active` view's WHERE
// clause filters on these statuses; 'monitor_pending' is the only value that
// exists in the projection and not on disk.
export const TaskActiveStatusSchema = z.enum([
  'proposed',
  'leased',
  'running',
  'produced',
  'monitor_pending',
]);
export type TaskActiveStatus = z.infer<typeof TaskActiveStatusSchema>;

export const TaskBodySchema = z.object({
  goal: z.string(),
  status: TaskStatusSchema,
  capability_id: z.string(),
  parent_task_id: z.string().optional(),
  budget: z.unknown().optional(),
});
export type TaskBody = z.infer<typeof TaskBodySchema>;

// Discriminated union over `kind`. Each variant pairs a NodeKind literal with
// the matching body shape. Drizzle stores the body as JSON text; the API
// layer parses it through this union.
export const NodeBodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('intent'), body: IntentBodySchema }),
  z.object({ kind: z.literal('constraint'), body: ConstraintBodySchema }),
  z.object({ kind: z.literal('rationale'), body: RationaleBodySchema }),
  z.object({ kind: z.literal('decision'), body: DecisionBodySchema }),
  z.object({ kind: z.literal('concept'), body: ConceptBodySchema }),
  z.object({ kind: z.literal('code_module'), body: CodeModuleBodySchema }),
  z.object({ kind: z.literal('code_symbol'), body: CodeSymbolBodySchema }),
  z.object({ kind: z.literal('counterexample'), body: CounterexampleBodySchema }),
  z.object({ kind: z.literal('task'), body: TaskBodySchema }),
]);
export type NodeBody = z.infer<typeof NodeBodySchema>;

export const NodeRowSchema = z.object({
  id: z.string(),
  kind: NodeKindSchema,
  title: z.string(),
  body: z.string(),
  confidence: NodeConfidenceSchema,
  parent_id: z.string().nullable(),
  version: z.number().int().nonnegative(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  deleted_at: z.number().int().nullable(),
});
export type NodeRow = z.infer<typeof NodeRowSchema>;
