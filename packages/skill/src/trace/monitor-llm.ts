// The cheap-monitor LLM. Runs on every commit-phase action, on a 5% sample of
// model calls, and always on safety_critical mutations. Default: Llama 3.3 70B
// on Groq. Output JSON: {flagged, score, categories[], evidence,
// recommended_action}. Verdicts become first-class graph nodes.
//
// HARD RULE: never train any IntentGraph component against this signal.

export const TRACE_MONITOR_LLM_PLACEHOLDER = 'monitor-llm';
