---
id: intent-never-train-against-monitor
title: No IntentGraph component is fine-tuned against the monitor's signal
parent: concept-faithfulness-by-architecture
confidence: asserted
owner: intentgraph-team
priority: P0
target_kinds:
  - module
status: draft
related:
  - intent-monitor-gates-every-commit
created: 2026-04-29
updated: 2026-04-29
---

# No IntentGraph component is fine-tuned against the monitor's signal

The monitor's verdicts are inputs to human review and to the trace store. They are never used as a training target for any IntentGraph model — not the proposer, not the classifier, not the embedding model, not a future fine-tune. This is the load-bearing rule from Baker et al. (2503.11926): training against a monitor optimizes for evading the monitor, not for being honest. The whole faithfulness-by-architecture thesis collapses if this rule is violated.

This intent fails the moment any fine-tune script reads from `trace_event.monitor_verdict`. It fails if a self-distillation pipeline picks up monitor signal indirectly (e.g. via a "good run" filter that uses the verdict). It fails if a researcher writes a training set conditioned on monitor outcomes for a benchmark.

Acceptance signals:
- A CI check (deferred to ADR-0012, lands when the first fine-tune script does) refuses to run a fine-tune whose data pipeline touches `monitor_verdict`.
- The trace store schema makes `monitor_verdict` queryable for audit and analytics, but the access is logged so any future training pipeline can be reviewed.
- Documentation (CLAUDE.md hard rules, AGENTS.md) names this rule explicitly so contributors do not need to discover it from the ADR.
- The first fine-tune script (when it lands) ships with a test that demonstrates its data pipeline excludes monitor_verdict.
