# ADR 0005 — Faithfulness via architecture, not training

## Status

Accepted.

## Context

CoT reveal-rate sits below 20% in 2025 frontier models (Anthropic 2505.05410). A weaker monitor LLM detects reward hacking on a stronger reasoner (Baker 2503.11926). CoT-as-computation is monitorable when reasoning is *necessary* (Emmons 2507.05246). Monitorability is fragile and architecture-dependent (Korbak et al. 2507.11473). Pretty rationales are not evidence; concrete artifacts are.

## Decision

- **Concrete recording, not pretty rationales.** Every agent action stores tool calls, retrieved node IDs, model and version, prompt hash, reasoning text in a separate TTL-bounded low-trust column, verifier outcomes, downstream mutations, monitor verdict, usage, latency, cost.
- **Monitor-LLM gate** runs on every commit-phase action, on a 5% sample of model calls, and always on `safety_critical` mutations. Default: Llama 3.3 70B on Groq.
- **Monitor output** is JSON: `{flagged, score, categories[reward_hack|intent_drift|hallucinated_spec|capability_misuse|obfuscation], evidence, recommended_action[allow|require_human_review|block]}`. Each verdict becomes a graph node edged from the trace and the task.
- **Hard rule.** Never train any IntentGraph component against the monitor's signal. This is the obfuscation tax Baker et al. specifically warn about.
- `trace_event.probe_results` is reserved for Goodfire Ember integration in v2+, gated on having ≥10K labeled verdicts.

## Consequences

- Reasoning text lives in a separate column with a 30-day default TTL and full opt-in. Prompt text is hashed by default.
- The monitor's flag is a graph node — it is queryable, edge-traceable, and replayable like everything else.
- No model fine-tunes against monitor verdicts, ever. Enforced by team norm and code review.
