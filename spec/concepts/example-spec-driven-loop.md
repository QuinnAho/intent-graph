---
id: concept-example-spec-driven-loop
title: Spec-driven loop
parent: null
confidence: asserted
regeneration_scope: cooperative
description: |
  The loop where an intent edit triggers a code patch proposal in a shadow
  workspace, the user reviews, and on accept the patch lands. This is the
  forward direction of tech-spec §3 Pillar 3.
created: 2026-04-27
updated: 2026-04-27
---

# Example concept: spec-driven loop

This is a parser-fixture concept — used by `packages/skill/src/parser/spec-md/`
tests so the parser has a real shaped file to walk. The L0 dogfood payload
authored by `p2-t11` is what carries actual project content; this file just
exercises the schema.

The spec-driven loop concept groups intents that talk about *intent → code*
flow direction. Constraints that bind to this concept narrow what the loop
is allowed to do (e.g. patch proposals must traverse a `git worktree` shadow,
the 5s undo window must be enforced, etc.).
