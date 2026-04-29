---
id: concept-agent-orchestration
title: Agent orchestration is first-class
parent: null
confidence: asserted
regeneration_scope: cooperative
description: |
  Inngest is the durable runner; AgentRunner over Vercel AI SDK v6 is the
  *only* path to model providers; three-tier routing (T0 hot / T1 warm / T2
  frontier); leases with fence tokens + per-row OCC make state causally
  consistent. Pillar 4 in CLAUDE.md.

  Cooperative per ADR-0018: AgentRunner changes affect every pillar that
  reaches a model — the loop's forward-sync state machine, the monitor's
  trace shape, retrieval's embedding pipeline. syncs_with neighbors include
  concept-spec-driven-loop and concept-faithfulness-by-architecture.
created: 2026-04-29
updated: 2026-04-29
---

# Agent orchestration is first-class

Agent runs are first-class entities, not invocations. Tasks are graph nodes; their state machine is durable; their model calls go through one chokepoint (`AgentRunner`); their consistency story is OCC + fenced leases. The Inngest task graph IS the IntentGraph task subgraph — there is no second graph model.

The hard rule from CLAUDE.md: every model call traverses AgentRunner so a `trace_event` row is recorded. ESLint enforces this in `eslint.config.mjs`. A task that mutates graph state without holding a lease, or that bypasses the runner, is a violation.

This concept groups intents about *how AI work is scheduled, traced, and made consistent*.

References:
- ADR-0004 (agent orchestration)
- tech-spec.md §2 Pillar 4, §3.6 Orchestrator
- CLAUDE.md "five architectural pillars" §4
- CLAUDE.md hard rule: AgentRunner-only model calls
