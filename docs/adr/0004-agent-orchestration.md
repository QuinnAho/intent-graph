# ADR 0004 — Agent orchestration is first-class

## Status

Accepted.

## Context

Multi-agent frameworks (LangGraph, Mastra, CrewAI, AutoGen) impose their own task graph models. Cognition's "Don't build multi-agents" thesis warns against agents-as-collaborators in a single trace. Our agents are specialized task-runners over a shared persistent graph; the graph IS the shared context.

## Decision

- **Inngest as durable runner.** The orchestrator's task graph IS the IntentGraph task subgraph (`node.kind = 'task'`). We refuse a second graph model.
- **AgentRunner over Vercel AI SDK v6** as the single chokepoint to model providers. The custom ESLint rule `intentgraph/agent-runner-only` blocks `import { generateText, streamText, generateObject } from 'ai'` outside `packages/skill/src/agent-runner`. Trace recording happens inside AgentRunner — there is no other path.
- **Three-tier model routing** (T0 hot / T1 warm / T2 frontier). Deterministic by `task.kind` for T0; classifier between T1 ↔ T2.
- **Capability matching.** Static declared table → embedding fallback over capability descriptors → bandit later. Static-first keeps routing human-readable.
- **Lease primitives.** Advisory `(node_id, scope)` lease with TTL + monotonic fence token + per-row OCC version on `node`. Fence tokens close the Kleppmann gap; CAS makes lost-update impossible even on lease bugs.

## Consequences

- New code paths that need to call an LLM must add an AgentRunner method, not import from `ai` directly. The lint rule is the gate.
- Concurrency policy on Inngest: `concurrency: { key: "event.data.intentNodeId", limit: 1 }` per node. A fairness policy keeps drift-checkers from being starved by long generation runs.
