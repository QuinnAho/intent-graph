---
description: Open or create an intent markdown file with frontmatter prefilled and ADR links. Usage — /intentgraph-spec <intent-id>
argument-hint: <intent-id>
---

Open or create the intent file `/spec/intents/$ARGUMENTS.md`. Invoke the `intentgraph-spec-writer` skill to enforce frontmatter discipline.

Steps:

1. **Check existence.** Read `/spec/intents/$ARGUMENTS.md`. If it exists, open it for editing and stop here.

2. **Validate the id.** `$ARGUMENTS` must be kebab-case, ≤4 words, stable. If it doesn't fit, ask the user to rename.

3. **Identify the parent.** Glob `/spec/intents/*.md` and read frontmatter to surface candidate parent ids. Ask the user which concept this intent belongs under. If a new top-level concept is needed, that's an architect call — escalate to `intentgraph-architect` and stop.

4. **Identify governing ADRs.** Glob `/docs/adr/*.md` and surface ADRs that mention the parent concept. The user picks the relevant numbers.

5. **Activate the spec-writer skill.** Use the Skill tool to invoke `intentgraph-spec-writer` with:
   - id = `$ARGUMENTS`
   - parent = (from step 3)
   - adrs = (from step 4)
   - confidence = `inferred` (default; user can override)
   - verified_by = `[]` (the user will add via `intentgraph-verifier-author` later)

6. **Write the file** with the prefilled frontmatter and a body skeleton:

```markdown
---
id: $ARGUMENTS
title: <human-readable title>
parent: <parent-id>
verified_by: []
confidence: inferred
adrs: [<numbers>]
---

<one paragraph: outcome-focused intent statement>

Realizes: `intent: <parent-id>`. Verified by: (none yet — invoke `intentgraph-verifier-author` to add obligations).
```

7. **Run** `pnpm tsx scripts/check-agent-config.ts` to validate frontmatter. Report results.

End with: "Created `/spec/intents/$ARGUMENTS.md` with confidence `inferred`. Next: invoke `intentgraph-verifier-author` to attach at least one obligation before promoting to `asserted`."
