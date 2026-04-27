// Writes every model call into trace_event with the full concrete-artifact
// payload. Reasoning text goes into the separate TTL-bounded low-trust column.
// Prompt text is SHA-256 hashed by default; full text opt-in per workspace.

export const AGENT_RUNNER_TRACE_RECORDER_PLACEHOLDER = 'trace-recorder';
