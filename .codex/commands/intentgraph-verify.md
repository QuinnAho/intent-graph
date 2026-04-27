---
description: Run pnpm typecheck && pnpm lint && pnpm test in sequence. Refuse to continue on any failure.
---

Run the IntentGraph local verification gate. All three steps must pass before any task is marked complete.

Run in sequence (not parallel — the failure mode of one invalidates the next):

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`

If the work touched DB schema (`packages/skill/src/db/`), also run:

4. `pnpm migrate:lint`

If the work touched `.claude/`, `.codex/`, `CLAUDE.md`, `AGENTS.md`, `/spec/`, or `/docs/adr/`, also run:

5. `pnpm tsx scripts/check-agent-config.ts`

**Reporting.** After each step:
- If green: print `✓ <step>` and continue.
- If red: print `✗ <step>` with the first 30 lines of error output, then **stop**. Do not run the remaining steps. Do not "try to fix" without the user's permission.

After all required steps pass: print `Gate clean — safe to mark complete.`

After any failure: print `Gate red at <step>. Fix before marking complete or proposing a PR.` and **stop**.

Do not auto-fix. The verify command is read-only on the codebase by design — its job is to give the user a trustworthy signal, not to silently mutate state.
