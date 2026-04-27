# Constraints

Constraints narrow the space of valid implementations for one or more intents. Each constraint is a Markdown file with YAML frontmatter.

## Frontmatter schema

```yaml
---
id: constraint-<kebab-case-stable-id>   # required, immutable
title: Short summary                    # required
predicate_kind: property | type | logical | example   # required
expr: |                                 # required, free-form expression in the predicate's language
  forall x: User. x.email != null
scope_node: intent-<id> | concept-<id>  # required, the node this constraint binds to
verifier_id: fast-check | tsc | verus | dafny | dmypy | mcp:<plugin-name>   # required
status: draft | active | retired        # required
created: YYYY-MM-DD                     # required
updated: YYYY-MM-DD                     # required
---
```

## Body conventions

- Plain-language restatement for humans who don't read the predicate language.
- A failing example, if known.
- Notes on counterexample shrinking strategy if the verifier supports it.

## File naming

`<id-without-prefix>.md`, e.g. `constraints/email-not-null.md`.
