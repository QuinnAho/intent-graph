// Derived TS types for trace_event + event_log + retrieval + row_audit.
// Tech-spec §4.6–§4.9.

export type {
  TraceEventKind,
  TraceEventStatus,
  TraceEventRow,
  TraceUsage,
  TraceToolCall,
  MonitorVerdict,
  MonitorVerdictCategory,
  MonitorRecommendedAction,
  EventLogRow,
  RetrievalAlgorithm,
  RetrievalSeed,
  RetrievalScoredNode,
  RetrievalRow,
  RowAuditOp,
  RowAuditRow,
} from '../schemas/trace.js';

import type { TraceEventRow } from '../schemas/trace.js';

export type TraceEvent = TraceEventRow;
