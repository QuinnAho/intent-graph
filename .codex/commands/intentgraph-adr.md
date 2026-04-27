---
description: Draft a new ADR. Usage — /intentgraph-adr <title in sentence case>
argument-hint: <title>
---

Invoke the `adr-writer` subagent to draft a new ADR titled "$ARGUMENTS".

Steps:

1. **Determine the next number.** Glob `/docs/adr/[0-9]*.md`. The next ADR is `(highest + 1)`, zero-padded to 4 digits.

2. **Confirm the question being decided.** If the user only gave a title, ask one clarifying question: "What is the question this ADR answers? What alternatives are on the table?" Do not invent a decision.

3. **Identify the relevant Tech-Spec section.** Read `Tech-Spec.md` and quote the section the decision touches.

4. **Identify related ADRs.** Glob `/docs/adr/*.md` and find ADRs that touch the same area. Decide whether the new ADR extends, supersedes, or is independent.

5. **Spawn the `adr-writer` subagent** with the inputs:
   - number (from step 1)
   - title (`$ARGUMENTS`)
   - question (from step 2)
   - tech-spec section (from step 3)
   - related ADRs (from step 4)

6. **After the subagent returns**, the file at `/docs/adr/NNNN-<kebab-title>.md` should exist with status `Proposed`. Confirm by reading it. Confirm `/docs/adr/README.md` has a new row.

End with: "ADR NNNN — $ARGUMENTS drafted as `Proposed` at `docs/adr/NNNN-<kebab-title>.md`. Review and flip status to `Accepted` when ready, or push back on the draft."
