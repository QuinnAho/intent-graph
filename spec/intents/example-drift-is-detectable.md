---
id: intent-example-drift-is-detectable
title: Symbol-vs-intent drift is detected automatically and surfaced for review
parent: concept-example-spec-driven-loop
confidence: asserted
owner: intentgraph-team
priority: P1
target_kinds:
  - module
  - api
status: active
created: 2026-04-27
updated: 2026-04-27
---

# Example intent: drift is detectable

Parser-fixture intent. The L0 dogfood payload authored by `p2-t11` carries
the actual project intents.

When code changes diverge from the intent's stated outcome — a new exported
function with no realizing intent, a constraint whose verifier no longer
passes, a renamed symbol that breaks a `realizes` edge — the loop must
detect it and surface a drift event for human review. Phase 4 is where the
detection lands; this intent shapes that work.
