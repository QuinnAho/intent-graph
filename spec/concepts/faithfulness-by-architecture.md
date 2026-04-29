---
id: concept-faithfulness-by-architecture
title: Faithfulness via architecture, not training
parent: null
confidence: asserted
regeneration_scope: cooperative
description: |
  Every agent action records concrete artifacts (tool calls, retrieved node
  IDs, model+version, verifier outcomes, monitor verdict). A cheap monitor
  LLM gates every commit + 5% sample + always on safety_critical. Never
  train any IntentGraph component against the monitor's signal. Pillar 5.

  Cooperative per ADR-0018: the trace store is coupled to AgentRunner (every
  model call writes a trace_event) and to the spec-driven loop (loop commits
  trigger monitor verdicts). Trace-shape changes require the producer
  (AgentRunner) and consumers (monitor, audit/replay) to regenerate together.
created: 2026-04-29
updated: 2026-04-29
---

# Faithfulness via architecture, not training

We don't make the model honest by training prettier reasoning. We make it honest by recording what it did. Every agent action emits a `trace_event` row with concrete artifacts: which nodes it retrieved, which model and version it called, which verifiers ran, what the monitor LLM said. The faithfulness story is in the substrate.

The monitor LLM (Llama 3.3 70B on Groq) reads each trace event and emits a verdict. Verdicts gate every commit, plus a 5% random sample, plus everything tagged `safety_critical`. The hard rule — the thesis collapses without it — is that no IntentGraph component is ever fine-tuned against the monitor's signal. Doing so would optimize for evading the monitor instead of being honest, which is the obfuscation-tax failure mode Baker et al. warn about.

This concept groups intents about *how IntentGraph stays honest*. Constraints binding to it narrow what the trace must contain and how the monitor is allowed to be used.

The monitor's `require_human_review` verdict and the safety_critical-tagged human-review path live here as downstream consequences of the trace + monitor architecture, not as freestanding HITL primitives. The trace is the substrate; human review is what the substrate *enables* on flagged runs. ADR-0021 (monitor LLM presentation framing) is the closest UX statement; the substrate commitment lives in this concept.

References:
- ADR-0005 (faithfulness via architecture)
- ADR-0012 (defer monitor-training CI check until first fine-tune script lands)
- tech-spec.md §2 Pillar 5, §3.8 Trace store
- CLAUDE.md "five architectural pillars" §5
- CLAUDE.md hard rule: never fine-tune against monitor signal
