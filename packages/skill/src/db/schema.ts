// Drizzle schema-as-TS for IntentGraph. Single source of truth for all
// SQLite tables in tech-spec §4. ADR-0015 decided monolithic — all ten
// tables ship in this one file in phase 2; phase-4/5 tables (event_log,
// trace_event, retrieval, row_audit, vec0 virtuals) are defined empty until
// their wiring lands. Atlas runs in CI to lint destructive changes.
//
// Conventions (tech-spec §4):
// - STRICT mode on every table.
// - WITHOUT ROWID where the primary key is a stable TEXT ULID.
// - ULIDs as TEXT (not BLOB).
// - JSON columns as TEXT — the application layer parses through Zod schemas
//   in @intentgraph/shared/schemas/ (per-table mapping in the comments).
// - Timestamps as INTEGER epoch ms.
//
// Drizzle's better-sqlite3 driver does not natively emit `STRICT` or
// `WITHOUT ROWID` — those modifiers ride out via raw `sql\`\`` table-options
// or via the migration files that drizzle-kit generates. The schema
// definitions below model the column types Drizzle needs; the migration
// generator picks up the intent. Some objects in §4 (the task_active VIEW,
// vec0 virtual tables, partial indices, JSON-extract indices, AFTER triggers
// for row_audit) are not first-class in Drizzle's table builder — those are
// emitted as raw SQL in the migration p2-t02 produces.

import { sql } from 'drizzle-orm';
import {
  blob,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  sqliteView,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// §4.1 — node (heterogeneous, 9 kinds + task)

export const node = sqliteTable(
  'node',
  {
    id: text('id').primaryKey().notNull(),
    kind: text('kind', {
      enum: [
        'intent',
        'constraint',
        'rationale',
        'decision',
        'concept',
        'code_module',
        'code_symbol',
        'counterexample',
        'task',
      ],
    }).notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    confidence: text('confidence', {
      enum: ['extracted', 'inferred', 'semantic', 'asserted'],
    }).notNull(),
    parentId: text('parent_id').references((): AnySQLiteColumn => node.id),
    version: integer('version').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    nodeKindUpdated: index('node_kind_updated').on(t.kind, t.updatedAt),
    nodeParent: index('node_parent').on(t.parentId),
  }),
);

// ---------------------------------------------------------------------------
// §4.2 — edge (9 typed)

export const edge = sqliteTable(
  'edge',
  {
    id: text('id').primaryKey().notNull(),
    src: text('src')
      .notNull()
      .references(() => node.id),
    dst: text('dst')
      .notNull()
      .references(() => node.id),
    kind: text('kind', {
      enum: [
        'realizes',
        'constrains',
        'decides',
        'justifies',
        'supersedes',
        'syncs_with',
        'depends_on',
        'produced_by',
        'references',
      ],
    }).notNull(),
    weight: real('weight').notNull().default(1.0),
    body: text('body'),
    createdAt: integer('created_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    // §4.2 — UNIQUE INDEX edge_unique ON edge(src, dst, kind) WHERE deleted_at IS NULL.
    edgeUnique: uniqueIndex('edge_unique')
      .on(t.src, t.dst, t.kind)
      .where(sql`${t.deletedAt} IS NULL`),
    edgeSrc: index('edge_src').on(t.src, t.kind),
    edgeDst: index('edge_dst').on(t.dst, t.kind),
  }),
);

// ---------------------------------------------------------------------------
// §4.3 — obligation. ADR-0016 pins the `kind` enum so the Verifier interface
// can reference it without a follow-up migration.

export const obligation = sqliteTable(
  'obligation',
  {
    id: text('id').primaryKey().notNull(),
    intentNodeId: text('intent_node_id')
      .notNull()
      .references(() => node.id),
    kind: text('kind', {
      enum: ['property', 'typecheck', 'formal', 'example', 'metamorphic'],
    }).notNull(),
    source: text('source', { enum: ['llm', 'human', 'mined'] }).notNull(),
    testCode: text('test_code').notNull(),
    rationale: text('rationale'),
    status: text('status', {
      enum: ['pending', 'verified', 'failed', 'rejected'],
    })
      .notNull()
      .default('pending'),
    filtersPassed: text('filters_passed').notNull().default('[]'),
    counterexampleNodeId: text('counterexample_node_id').references(() => node.id),
    lastRunAt: integer('last_run_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    obligationIntent: index('obligation_intent').on(t.intentNodeId),
  }),
);

// ---------------------------------------------------------------------------
// §4.4 — lease (advisory reservation + fence_seq monotonic counter)

export const lease = sqliteTable(
  'lease',
  {
    nodeId: text('node_id')
      .notNull()
      .references(() => node.id),
    scope: text('scope', {
      enum: ['mutate', 'drift-fix', 'verify', 'plan'],
    }).notNull(),
    holder: text('holder').notNull(),
    reason: text('reason'),
    expiresAt: integer('expires_at').notNull(),
    acquiredAt: integer('acquired_at').notNull(),
    fenceToken: integer('fence_token').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.nodeId, t.scope] }),
    leaseExpiry: index('lease_expiry').on(t.expiresAt),
  }),
);

export const fenceSeq = sqliteTable('fence_seq', {
  next: integer('next').notNull(),
});

// ---------------------------------------------------------------------------
// §4.5 — task_active is a deterministic projection over `node` rows where
// `kind='task'`, filtered to schedulable statuses. Drizzle's sqliteView
// builder records the SELECT body so drizzle-kit emits CREATE VIEW in the
// initial migration.
//
// The view's status enum (TaskActiveStatusSchema in @intentgraph/shared)
// widens to include 'monitor_pending' per ADR-0017, but the SELECT body
// below only PROJECTS the storage status from `node.body.status`. The
// `monitor_pending` value is only emitted once phase 4 lands the LEFT JOIN
// against trace_event + CASE promotion logic that ADR-0017 §Consequences
// describes ("CASE WHEN trace_event.kind='monitor' AND
// monitor_verdict IS NULL THEN 'monitor_pending' ELSE base_status"). Until
// then, this view returns at most the four storage values that overlap
// with the §4.5 WHERE clause (`proposed | leased | running | produced`);
// `committed | rejected | rolled_back` are filtered out by the WHERE, and
// `monitor_pending` is a zero-row case until the join lands.

export const taskActive = sqliteView('task_active').as((qb) =>
  qb
    .select({
      id: node.id,
      status: sql<string>`json_extract(${node.body}, '$.status')`.as('status'),
      capabilityId: sql<string>`json_extract(${node.body}, '$.capability_id')`.as('capability_id'),
      parentTaskId: sql<string | null>`json_extract(${node.body}, '$.parent_task_id')`.as(
        'parent_task_id',
      ),
      updatedAt: node.updatedAt,
    })
    .from(node)
    .where(
      sql`${node.kind} = 'task' AND ${node.deletedAt} IS NULL AND json_extract(${node.body}, '$.status') IN ('proposed','leased','running','produced','monitor_pending')`,
    ),
);

// ---------------------------------------------------------------------------
// §4.6 — event_log (semantic, hash-chained). Phase-4 wiring; defined empty
// for phase 2 per ADR-0015. payload + prev_hash + hash are BLOB on disk
// because the hash chain integrity relies on byte-exact
// `sha256(prev_hash || canonical(payload))`; storing payload as JSON-text
// would lose byte-exactness across whitespace/key-order normalization.
// Drizzle's `blob(..., { mode: 'buffer' })` surfaces these as Node Buffer
// (a Uint8Array subclass); the app-layer Zod schema (EventLogRowSchema in
// @intentgraph/shared) types them as Uint8Array.

export const eventLog = sqliteTable(
  'event_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ts: integer('ts').notNull(),
    actor: text('actor').notNull(),
    kind: text('kind').notNull(),
    taskId: text('task_id').references(() => node.id),
    traceId: text('trace_id'),
    payload: blob('payload', { mode: 'buffer' }).notNull(),
    prevHash: blob('prev_hash', { mode: 'buffer' }),
    hash: blob('hash', { mode: 'buffer' }).notNull(),
  },
  (t) => ({
    eventLogTs: index('event_log_ts').on(t.ts),
    eventLogTask: index('event_log_task').on(t.taskId),
  }),
);

// ---------------------------------------------------------------------------
// §4.7 — trace_event (AgentRunner faithfulness substrate, ADR-0005).
// Phase-4 wiring; defined empty for phase 2 per ADR-0015.

export const traceEvent = sqliteTable(
  'trace_event',
  {
    traceId: text('trace_id').primaryKey().notNull(),
    parentTraceId: text('parent_trace_id').references((): AnySQLiteColumn => traceEvent.traceId),
    taskNodeId: text('task_node_id')
      .notNull()
      .references(() => node.id),
    agentId: text('agent_id').notNull(),
    capabilityId: text('capability_id').notNull(),
    kind: text('kind', {
      enum: ['model_call', 'tool_call', 'retrieval', 'verifier', 'monitor', 'mutation'],
    }).notNull(),
    model: text('model'),
    modelVersion: text('model_version'),
    provider: text('provider'),
    promptHash: text('prompt_hash'),
    promptText: text('prompt_text'),
    reasoningHash: text('reasoning_hash'),
    reasoningText: text('reasoning_text'),
    toolCalls: text('tool_calls'),
    retrievedNodeIds: text('retrieved_node_ids'),
    producedMutations: text('produced_mutations'),
    verifierOutcomes: text('verifier_outcomes'),
    monitorVerdict: text('monitor_verdict'),
    probeResults: text('probe_results'),
    usage: text('usage').notNull(),
    costUsd: real('cost_usd').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    ttftMs: integer('ttft_ms'),
    status: text('status', { enum: ['ok', 'error', 'guardrail_tripped'] }).notNull(),
    error: text('error'),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at').notNull(),
  },
  (t) => ({
    teTask: index('te_task').on(t.taskNodeId, t.startedAt),
    teParent: index('te_parent').on(t.parentTraceId),
    // §4.7 te_flagged: index on json_extract(monitor_verdict,'$.flagged') so
    // monitor-flagged trace events can be queried without a full scan.
    // Drizzle accepts an SQL expression on .on().
    teFlagged: index('te_flagged').on(
      sql`json_extract(${t.monitorVerdict}, '$.flagged')`,
    ),
  }),
);

// ---------------------------------------------------------------------------
// §4.8 — retrieval (PPR query cache). Phase-5 wiring; defined empty for
// phase 2 per ADR-0015.

export const retrieval = sqliteTable(
  'retrieval',
  {
    id: text('id').primaryKey().notNull(),
    traceId: text('trace_id').references(() => traceEvent.traceId),
    queryHash: text('query_hash').notNull(),
    queryText: text('query_text'),
    seedNodeIds: text('seed_node_ids').notNull(),
    pprTopK: text('ppr_top_k').notNull(),
    algorithm: text('algorithm', {
      enum: ['vec_only', 'vec+ppr', 'bm25', 'hybrid'],
    }).notNull(),
    embeddingModel: text('embedding_model'),
    k: integer('k').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    retrievalQueryHash: index('retrieval_query_hash').on(t.queryHash),
  }),
);

// ---------------------------------------------------------------------------
// §4.9 — row_audit (CDC). Phase-4 wiring; defined empty for phase 2 per
// ADR-0015. AFTER triggers on tracked tables are emitted by migrations.

export const rowAudit = sqliteTable('row_audit', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ts: integer('ts').notNull(),
  txId: integer('tx_id'),
  tbl: text('tbl').notNull(),
  op: text('op', { enum: ['I', 'U', 'D'] }).notNull(),
  rowid: integer('rowid'),
  before: text('before'),
  after: text('after'),
});

// ---------------------------------------------------------------------------
// §4.10 — vec0 virtual tables (sqlite-vec). One per embedding-bearing kind,
// joined to `node.rowid`. Drizzle has no first-class VIRTUAL-table builder;
// per ADR-0015:28 the DDL lives in the initial migration but the
// `sqlite-vec` extension load is gated by phase-5 wiring. p2-t02 picks up
// the SQL statements below from this file; nothing else loads them at
// runtime in phase 2.

export const VEC_INTENT_TABLE = 'vec_intent' as const;
export const VEC_CODE_TABLE = 'vec_code' as const;
export const VEC_EMBEDDING_DIM = 1024 as const;

export const createVecIntentTable = sql`
  CREATE VIRTUAL TABLE IF NOT EXISTS vec_intent USING vec0(
    node_rowid INTEGER PRIMARY KEY,
    embedding  FLOAT[1024] DISTANCE_METRIC=cosine
  )
`;

export const createVecCodeTable = sql`
  CREATE VIRTUAL TABLE IF NOT EXISTS vec_code USING vec0(
    node_rowid INTEGER PRIMARY KEY,
    embedding  FLOAT[1024] DISTANCE_METRIC=cosine
  )
`;

// ---------------------------------------------------------------------------
// §4.9 AFTER triggers — CDC capture for the four tracked tables. Per
// ADR-0015:29 these ship in the initial migration even though they are
// inert until phase 4 (when AgentRunner mutations correlate `tx_id` with
// `event_log.id`). Drizzle has no row-level trigger builder; p2-t02 emits
// CREATE TRIGGER statements directly into the initial migration. The
// constant below is the contract — the list of (table, operation) pairs
// for which p2-t02 must produce a row_audit trigger. The trigger body
// serializes the row via `json_object(<concrete column list>)`, which is
// table-specific and therefore generated in the migration file rather than
// here.

export const ROW_AUDIT_TRACKED = [
  { table: 'node', ops: ['I', 'U', 'D'] as const },
  { table: 'edge', ops: ['I', 'U', 'D'] as const },
  { table: 'obligation', ops: ['I', 'U', 'D'] as const },
  { table: 'lease', ops: ['I', 'U', 'D'] as const },
] as const;
