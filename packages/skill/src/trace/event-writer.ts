// Append-only writer for trace_event. Hash-chains entries so audit replay
// can detect tampering. Called from src/agent-runner/trace-recorder and from
// the orchestrator on tool/verifier completions.

export const TRACE_EVENT_WRITER_PLACEHOLDER = 'trace-event-writer';
