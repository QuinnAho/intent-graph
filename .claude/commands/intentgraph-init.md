---
description: Bootstrap a new IntentGraph development session. Reads CLAUDE.md, lists the dogfooding gates, identifies the current phase, surfaces open ADRs.
---

You are starting a new development session on IntentGraph. Bootstrap by doing the following, in order, and then summarize for the user.

1. Read `CLAUDE.md` at the repo root in full. Note the five hard rules and the dogfooding ladder.
2. Read `Tech-Spec.md` §6 (phase-by-phase build plan) — at least the table at the bottom.
3. Use Glob to list `/docs/adr/`. Read the README, then any ADR whose status is not `Accepted` (grep for `Status` fields).
4. Use Glob to list `/spec/intents/`, `/spec/constraints/`, `/spec/decisions/`. Note the count in each folder.
5. Run `git status --short` and `git log --oneline -5` to surface in-flight work.
6. Identify the current phase by looking at which packages have implementation under `packages/*/src/` versus only scaffolding.

Then output a single summary, in this shape:

```
IntentGraph session bootstrap

Current phase: <Phase N — name>
Next dogfooding gate: <L0 | L1 | L2 | L3> — <one-line gate criterion>
In-flight (git): <branch name>, <N modified, M untracked>

Open ADRs (Proposed/superseding):
- NNNN <title>
- ...

Spec inventory:
- intents: <count> | constraints: <count> | decisions: <count>

Reminders:
- AgentRunner-only model calls
- No JSON-as-storage
- ADRs are immutable after acceptance
- /intentgraph-verify before marking work complete

Available skills: intentgraph-{architect, implementer, claudemap-lifter, spec-writer, verifier-author}
Available subagents: intent-extractor, drift-reconciler, code-generator, monitor, adr-writer
```

Then ask: "What are we working on this session?"
