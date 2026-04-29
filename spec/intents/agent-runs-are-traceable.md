---
id: intent-agent-runs-are-traceable
title: Every agent action that touches the graph leaves a trace_event row with concrete artifacts
parent: concept-agent-orchestration
confidence: asserted
owner: intentgraph-team
priority: P0
target_kinds:
  - module
  - api
status: draft
created: 2026-04-29
updated: 2026-04-29
---

# Every agent action that touches the graph leaves a trace_event row with concrete artifacts

When an AI agent runs — proposing a patch, classifying a drift, suggesting an intent stub — the substrate records a `trace_event` row with the concrete artifacts of that run: the model and version called, the retrieved node ids, the verifier outcomes, the monitor verdict (when applicable), and a hash of the prompt. The row exists *before* the action's effect lands in the graph. There is no out-of-band model call.

This intent fails if any model call reaches a provider without traversing AgentRunner. It fails if a trace_event is recorded with placeholder artifacts (e.g. an empty node-id list when retrieval ran). It fails if a trace_event references a model version that does not exist in the configured provider catalog at the time of the call.

Acceptance signals:
- The ESLint chokepoint rule `intentgraph/agent-runner-only` blocks model imports outside `packages/skill/src/agent-runner/`.
- A grep for `generateText|streamText|generateObject|streamObject|embed|embedMany` from the `ai` package returns hits only inside the AgentRunner module.
- The audit/replay tool can answer "what artifacts did this agent run produce" from trace_event alone.
