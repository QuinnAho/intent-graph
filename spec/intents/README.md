# Intents

We dogfood IntentGraph by writing the team's own intents here from day one. Each intent is a Markdown file with YAML frontmatter and a free-form body.

## Frontmatter schema

```yaml
---
id: intent-<kebab-case-stable-id>      # required, immutable, used as foreign key
title: Short imperative summary         # required
owner: github-handle | team-name        # required
priority: P0 | P1 | P2 | P3             # required
target_kinds:                           # required, ≥1
  - module                              # which substrate kinds this intent shapes
  - api
status: draft | active | satisfied | superseded   # required
supersedes: intent-<id>                 # optional
related:                                # optional, list of node ids
  - constraint-<id>
  - decision-<id>
created: YYYY-MM-DD                     # required, ISO-8601
updated: YYYY-MM-DD                     # required
---
```

## Body conventions

- One paragraph stating WHY the intent exists (the user-visible value).
- Optional bullet list of acceptance signals that a verifier could plausibly turn into obligations.
- Reference constraints with `@constraint-<id>` mention syntax — the TipTap editor and the spec parser both resolve these.

## File naming

`<id-without-prefix>.md`, e.g. an intent with `id: intent-graph-is-truth` lives at `intents/graph-is-truth.md`.
