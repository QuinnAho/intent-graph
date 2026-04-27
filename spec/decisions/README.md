# Decisions

In-spec decision records — distinct from `/docs/adr/` which holds architectural decisions about IntentGraph itself. These decisions live inside the dogfooded spec graph and are referenced by intents and constraints.

## Frontmatter schema

```yaml
---
id: decision-<kebab-case-stable-id>     # required, immutable
title: Short summary                    # required
status: proposed | accepted | rejected | superseded   # required
deciders:                               # required, ≥1
  - github-handle
context_node:                           # optional, intent or concept this decision is about
  - intent-<id>
supersedes: decision-<id>               # optional
created: YYYY-MM-DD                     # required
updated: YYYY-MM-DD                     # required
---
```

## Body conventions

- **Context** — what forced the decision.
- **Decision** — one paragraph, declarative.
- **Alternatives considered** — bullet list with one-line trade-off each.
- **Consequences** — what becomes true (and what becomes hard) once accepted.

## File naming

`<id-without-prefix>.md`.
