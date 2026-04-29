---
id: constraint-shadow-workspace-required-for-patches
title: A forward-sync code patch must traverse a git worktree shadow before it can be applied
parent: intent-intent-edits-propose-code
confidence: asserted
predicate_kind: logical
expr: |
  forall (patch p produced by forward_sync).
    p.applied_to_live_tree = true
    => exists (worktree w). p.was_staged_in(w) and w.was_previewed_by_user(p)
scope_node: intent-intent-edits-propose-code
verifier_id: mcp:patch-flow-audit
status: draft
blocked_on:
  - mcp:patch-flow-audit verifier (phase 4, alongside drift detection)
  - forward_sync state machine in the orchestrator (phase 4)
created: 2026-04-29
updated: 2026-04-29
---

# Shadow workspace required for forward-sync patches

The architectural commitment in the spec-driven loop is that AI-proposed code never reaches the live tree without a shadow-workspace round-trip. The constraint encodes that contract as a structural rule on patch flow: every forward-sync patch that is `applied_to_live_tree` must have been staged in a `git worktree` shadow first, and that shadow must have been surfaced to the user for preview.

The constraint is `predicate_kind: logical` because the check is on the orchestrator's patch-flow state machine, not on a numeric property. Both the verifier (`mcp:patch-flow-audit`) and the system under test (the forward_sync state machine) land in Phase 4; the explicit `blocked_on` frontmatter records that. `status: draft` here means "documented contract, not yet runnable" rather than "needs author review."

Counterexample, if the rule were ever circumvented: AgentRunner produces a patch and the controller writes it to the live tree directly, bypassing the worktree-stage path. The patch would land without preview, breaking the 5s undo invariant and the user's ability to reject. This is the failure mode the constraint exists to prevent.
