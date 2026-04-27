---
description: Report current build state — which phase, which gate is next, what's blocking, what's in flight. Use after a break.
---

Report the current state of the IntentGraph build. This is for resuming after time away. Do the following, then output the status report.

1. Run `git status --short` and `git log --oneline -10`.
2. Glob `/docs/adr/*.md`; read the Status field on each. Count Proposed vs Accepted.
3. Glob `/spec/intents/*.md`, `/spec/constraints/*.md`. Identify any with `confidence: extracted` or `inferred` (those are the ones that need promotion).
4. Glob `packages/*/src/**/*.ts`. Identify which packages have substantive implementation (>5 source files) vs scaffolding (≤5 files).
5. Identify the current phase from package implementation depth + presence of MCP tools + presence of AgentRunner module:
   - Phase 0–1: scaffolding only.
   - Phase 2 (L0): static graph build script + JSON output.
   - Phase 3 (L1): MCP server + bidirectional markdown sync + extension v0.1.
   - Phase 4 (L2): drift detection + AgentRunner + monitor.
   - Phase 5 (L3): retrieval + eval harness.
6. Run `pnpm typecheck && pnpm lint && pnpm test` and report pass/fail without fixing. If anything fails, that's a blocker.

Output:

```
IntentGraph status — <today's date>

Phase: <N — name> (gate: <L0|L1|L2|L3>)
  Gate criterion: <quote from CLAUDE.md>
  Gate status: <met | not met> — <one-line evidence>

Build:
  typecheck: <ok|fail>
  lint:      <ok|fail>
  test:      <ok|fail>

In flight:
  branch: <name>
  uncommitted: <N modified, M untracked>
  recent commits:
    <sha> <subject>
    ...

ADRs:
  Accepted: <count> | Proposed: <count> | Superseded: <count>
  Proposed list:
    - NNNN <title>

Specs needing promotion:
  - <spec id> (confidence: <extracted|inferred>)

Blockers:
  - <one-line per blocker; "none" if clean>

Recommended next action:
  <one sentence>
```
