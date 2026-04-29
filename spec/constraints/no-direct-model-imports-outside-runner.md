---
id: constraint-no-direct-model-imports-outside-runner
title: No file outside packages/skill/src/agent-runner/ may import generateText/streamText/embed from the ai package
parent: intent-agent-runs-are-traceable
confidence: asserted
predicate_kind: logical
expr: |
  forall file f in packages/**.
    f imports any of {generateText, streamText, generateObject, streamObject, embed, embedMany} from 'ai'
    => f.path startsWith 'packages/skill/src/agent-runner/'
scope_node: intent-agent-runs-are-traceable
verifier_id: mcp:eslint-intentgraph-agent-runner-only
status: draft
created: 2026-04-29
updated: 2026-04-29
---

# No direct model imports outside the AgentRunner module

The faithfulness-by-architecture story hinges on every model call traversing AgentRunner so a `trace_event` row is recorded. The chokepoint is enforced statically — by ESLint, not runtime. Any file outside `packages/skill/src/agent-runner/` that imports a model-call symbol from the `ai` package is a violation of the intent's contract.

The constraint is `predicate_kind: logical` because the check is structural over file paths and import statements; no property-based fuzzing is meaningful here. The verifier is the existing ESLint rule `intentgraph/agent-runner-only` defined in `eslint.config.mjs`.

Counterexample, if the rule were ever disabled: a contributor adds `import { generateText } from 'ai'` directly into `packages/extension/src/controllers/intent-graph-controller.ts`. The graph mutation produced by that call would have no `trace_event` row, breaking the intent.
