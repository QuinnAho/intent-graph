# Concepts

Concepts are the Daniel Jackson-style boundary nodes that group intents and constraints into navigable, regenerable units (tech-spec §3.5, §4.1). An intent is a *thing the team wants to be true*; a concept is *the surface that thing belongs to* — e.g. the auth surface, the spec-driven loop, the task state machine. React Flow renders concepts as sub-flows with `extent: 'parent'` so the user can collapse / expand the concept's contents (p2-t09).

## Frontmatter schema

```yaml
---
id: concept-<kebab-case-stable-id>      # required, immutable, used as foreign key
title: Short noun phrase                # required, names the surface
parent:                                 # required (per ADR-0009)
                                        # — set to null for top-level concepts.
                                        # When non-null, points at the enclosing
                                        # concept's id (concepts can nest).
confidence: extracted | inferred | semantic | asserted   # required (per ADR-0009)
regeneration_scope: atomic | cooperative                 # required
                                                         # atomic: the whole concept regenerates as one unit
                                                         # cooperative: regeneration coordinates with siblings
description: |                          # required
  One paragraph naming the surface and what it constrains.
created: YYYY-MM-DD                     # required
updated: YYYY-MM-DD                     # required
---
```

## Body conventions

- Plain-language description of what *belongs* to this concept and what does not. Boundaries are the point.
- Optional list of intents and constraints that this concept groups (the parser also derives this from the inverse direction — every intent with `parent: concept-X` gets a `realizes` edge to concept-X).
- Optional notes on regeneration strategy (how the AI should reason about updating this concept's contents).

## File naming

`<id-without-prefix>.md`, e.g. a concept with `id: concept-spec-driven-loop` lives at `concepts/spec-driven-loop.md`.

## Required fields per ADR-0009

`id`, `title`, `parent`, `confidence`. The validator at `scripts/check-agent-config.ts` enforces these four; the per-kind fields above (`regeneration_scope`, `description`, `created`, `updated`) are recommended-but-not-required, and the spec-md parser tolerates their absence with a warning rather than a parse error.
