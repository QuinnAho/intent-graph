---
id: intent-code-changes-raise-drift
title: Code changes that diverge from intent surface as drift events the user can resolve
parent: concept-spec-driven-loop
confidence: asserted
owner: intentgraph-team
priority: P0
target_kinds:
  - module
status: draft
related:
  - intent-intent-edits-propose-code
created: 2026-04-29
updated: 2026-04-29
---

# Code changes that diverge from intent surface as drift events the user can resolve

When a developer saves a file, IntentGraph reparses, runs the 4-tier semantic diff (signature hash → body hash → GumTree → LLM classifier), and emits drift events for any divergence that crosses a tier-2 boundary. Drift events appear in the inbox; the user can accept the drift (updating the relevant intent), reject it (proposing a code revert), or snooze.

This intent fails if a meaningful code change does not raise a drift event when the corresponding intent has not changed. It fails if the user has no surfaced way to resolve the drift — a drift event with no resolution path is noise. It fails if the diff is too noisy (every formatting edit raises drift) or too quiet (architectural changes go undetected).

Acceptance signals:
- The L2 dogfood gate (≥80% drift auto-detected, ≥50% suggestions accepted) is met on the team's own repo.
- Every drift event carries a proposer-anchored explanation (which intent, which symbol, which diff tier).
- The inbox UX (per ADR-0021) presents drift events as observations, not audit findings.
