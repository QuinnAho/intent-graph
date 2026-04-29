---
id: concept-spec-driven-loop
title: Spec-driven loop is the backbone
parent: null
confidence: asserted
regeneration_scope: cooperative
description: |
  Forward sync (intent edit → patch proposal in git worktree shadow → preview
  → apply) and backward sync (onDidSaveTextDocument → tree-sitter reparse →
  4-tier semantic diff → drift events). The verification backplane attaches
  obligations to intent nodes. Pillar 3 in CLAUDE.md.

  Cooperative per ADR-0018: the loop is coupled to concept-agent-orchestration
  (every loop iteration runs inside an AgentRunner-traced run) and to
  concept-faithfulness-by-architecture (every iteration emits a trace_event
  the monitor reads). A regenerator changing the loop must plan staged
  regeneration with those neighbors via syncs_with edges.
created: 2026-04-29
updated: 2026-04-29
---

# Spec-driven loop is the backbone

The product wedge is bidirectional: editing an intent proposes code, editing code raises drift events. Both directions traverse a shadow workspace (`git worktree`) so nothing applies to the user's tree without explicit accept. The 5s undo window is part of the contract.

This is the loop that makes IntentGraph feel different from a chatbot. The graph and the code stay in sync because the substrate enforces the sync — not because the model is asked nicely.

This concept groups intents about *how intent and code stay aligned*. Constraints attached to this concept narrow what the loop is allowed to do (no direct file writes outside the shadow, the patch must traverse a verifier before commit, etc.).

The user-in-the-loop posture (preview-before-apply, the 5s undo, the drift inbox accept/reject) lives here as a downstream consequence of the loop's structural commitments — not as a freestanding HITL concept. The shadow workspace and the inbox are how the loop *implements* user control; promoting HITL to its own concept would conflate substrate (this concept) with UX commitment (a future concept gated on its own ADR). ADR-0023 and ADR-0021 are the closest current statements of HITL UX; if they grow into something the existing pillars can't carry, that's the trigger for a new concept.

References:
- ADR-0003 (spec-driven loop)
- tech-spec.md §2 Pillar 3, §3.1 Forward sync, §3.2 Backward sync
- CLAUDE.md "five architectural pillars" §3
