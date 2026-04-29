---
id: intent-intent-edits-propose-code
title: Editing an intent surfaces a code patch proposal the user reviews before applying
parent: concept-spec-driven-loop
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

# Editing an intent surfaces a code patch proposal the user reviews before applying

When a developer edits an intent's text or constraints, IntentGraph runs the forward sync: AI proposes a code patch in a `git worktree` shadow workspace, the user previews the diff, and on accept the patch lands in the working tree. On reject or timeout the shadow is discarded. There is a 5s undo window after apply.

The user-visible value is that intent authoring becomes a real lever on code, not a documentation exercise. The architectural commitment is that the patch never reaches the live tree without an explicit accept — the shadow workspace is non-negotiable.

This intent fails if a forward-sync patch can land without a preview (silent application). It fails if the preview shows a stale or incomplete diff. It fails if "accept" applies to a different patch than the one previewed.

Acceptance signals:
- An accepted patch is reversible within 5 seconds via a single undo action.
- Rejected patches leave the shadow workspace clean and the live tree untouched.
