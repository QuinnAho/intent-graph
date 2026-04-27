---
description: Lift a file from the ClaudeMap reference repo with the lift rules pre-loaded. Usage — /intentgraph-lift <claudemap-relative-path>
argument-hint: <claudemap-path>
---

Invoke the `intentgraph-claudemap-lifter` skill against the file at `claudemap/$ARGUMENTS`. The skill enforces the do-not-lift list and writes a provenance header + LIFT_LOG.md row.

Steps:

1. **Verify the source exists.** Read `claudemap/$ARGUMENTS`. If not found, stop and tell the user the path is wrong.
2. **Check the do-not-lift list.** From `.claude/skills/intentgraph-claudemap-lifter/SKILL.md`:
   - `claudemap/contracts/`
   - `claudemap/handlers/`
   - cache layer files
   - enrichment pipeline files
   - any JSON-as-storage code (e.g., `claudemap-maps.json` and similar)

   If `$ARGUMENTS` is on the list, refuse and respond with the IntentGraph equivalent from Tech-Spec.

3. **Identify the destination** in the IntentGraph monorepo:
   - React Flow / webview UI → `packages/webview/src/`
   - VS Code extension → `packages/extension/src/`
   - Skill / MCP / DB → `packages/skill/src/`
   - Shared schemas → `packages/shared/src/`

   Ask the user to confirm the destination before writing.

4. **Activate the lifter skill.** Use the Skill tool to invoke `intentgraph-claudemap-lifter` with the source and destination as inputs.

5. **After the lift completes:**
   - Confirm the provenance header is at the top of the new file.
   - Confirm `LIFT_LOG.md` has a new row.
   - Run `pnpm typecheck && pnpm lint && pnpm test`. Report results.

End with: "Lift complete: `claudemap/$ARGUMENTS` → `<destination>`. LIFT_LOG.md updated. Gate: <pass|fail>."
