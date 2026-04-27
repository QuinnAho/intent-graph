// Drizzle schema-as-TS. The single source of truth for all SQLite tables
// (node, edge, obligation, lease, trace_event, monitor_verdict, eval_runs,
// row_audit, event_log, ...). Atlas runs in CI to lint destructive changes.
// See Tech-Spec §4 for the full DDL.

export const DB_SCHEMA_PLACEHOLDER = 'db-schema';
