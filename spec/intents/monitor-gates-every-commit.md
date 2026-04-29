---
id: intent-monitor-gates-every-commit
title: A cheap monitor LLM verdict gates every commit and is sampled on every other action
parent: concept-faithfulness-by-architecture
confidence: asserted
owner: intentgraph-team
priority: P0
target_kinds:
  - module
  - api
status: draft
related:
  - intent-agent-runs-are-traceable
created: 2026-04-29
updated: 2026-04-29
---

# A cheap monitor LLM verdict gates every commit and is sampled on every other action

Every commit triggers a monitor LLM (Llama 3.3 70B on Groq, per the v1 stack decision) to read the trace_event of the agent run that produced it and emit a verdict — `allow`, `require_human_review`, or `block`. A 5% random sample of non-commit actions and 100% of `safety_critical`-tagged actions are also gated. The verdict is recorded back on the same trace_event row.

This intent fails if a commit lands in the graph without a monitor verdict. It fails if a `block` verdict does not actually block. It fails if the monitor's input is anything other than the trace_event — e.g. the model is allowed to see the working tree directly, breaking the cheap-monitor pattern.

Acceptance signals:
- A `block` verdict prevents the run's mutation from landing and surfaces a `require_human_review` inbox item.
- Monitor latency stays within the budget (typically 1–3s on Groq) — committing does not feel slow.
- The sample rate (5% non-critical + 100% safety_critical) is observable and tunable per workspace setting.
