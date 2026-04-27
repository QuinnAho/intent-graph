// Three-tier model routing:
//   T0 (hot)      — Gemini 2.5 Flash-Lite default; Groq Llama 3.3 70B for
//                   <500ms latency budgets; Cerebras Llama 3.1 8B reserved
//                   for the monitor LLM.
//   T1 (warm)     — Claude Haiku 4.5 default; GPT-5.4 mini fallback.
//   T2 (frontier) — Sonnet 4.6 default; Opus 4.6 / GPT-5.5 escalation.
//
// Routing is deterministic by task.kind for T0 and a RouteLLM-style
// classifier between T1 ↔ T2.

export const AGENT_RUNNER_TIER_ROUTING_PLACEHOLDER = 'tier-routing';
