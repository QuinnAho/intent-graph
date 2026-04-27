---
name: intentgraph-claudemap-lifter
description: Use when a task involves porting code from the ClaudeMap reference repo. Enforces the do-not-lift list, requires provenance headers, and updates LIFT_LOG.md.
allowed-tools: Read, Glob, Grep, Edit, Write, Bash(pnpm typecheck), Bash(pnpm lint), Bash(pnpm test)
---

# IntentGraph ClaudeMap Lifter

You enforce the lift discipline. IntentGraph forks from `QuinnAho/claudemap` (MIT, vendored under `/claudemap/` in this repo, read-only reference). Some patterns lift cleanly; some are anti-patterns that the IntentGraph architecture explicitly replaces. Your job is to make the difference visible and to leave a paper trail.

## What to lift

Lift these patterns:
- **React Flow shell** — `<ReactFlow>` + custom node types + Zustand store wiring. Adopt with v12 idioms (see Tech-Spec §3.5).
- **ELK layout pipeline** — algorithm, port-constraint config, dedicated worker. Update worker setup to current `elkjs`.
- **TipTap node editor** — only the lazy-mount-on-focus pattern and mention extension wiring.
- **Webview ↔ extension transport** — the message-relay pattern, but rebuild on top of `vscode-messenger` typed envelopes.
- **Slash command + skill discovery patterns** — only the shape; rewire through MCP, not filesystem JSON.

Every lifted file gets a header (see "Provenance header" below) and an entry in `LIFT_LOG.md`.

## What you must not lift

These are the do-not-lift items from `tech-spec.md` §3 ("Recommended Path: fork ClaudeMap and evolve"). They are anti-patterns under the IntentGraph architecture:

1. **`contracts/`** — ClaudeMap's hand-rolled schema. We use Drizzle + Zod (`packages/shared/src/schemas/`).
2. **`handlers/`** — ClaudeMap's request handlers. We use MCP tools (`packages/skill/src/mcp/tools/`) with Zod-validated inputs and outputs.
3. **Cache layer** — ClaudeMap's ad-hoc cache. SQLite + WAL is the substrate; PPR results cache lives in the `retrieval` table.
4. **Enrichment pipeline** — ClaudeMap's enrichment-as-pass. IntentGraph uses Inngest functions and AgentRunner, with concrete trace artifacts.
5. **JSON-as-storage** — ClaudeMap's `claudemap-maps.json` and similar. IntentGraph stores in SQLite; `graph.json` is an export only.

If a task asks you to lift one of these, stop and respond: "This is on the do-not-lift list. The IntentGraph equivalent is `<the equivalent>` per Tech-Spec §<N>. Reframe the task as '*build the IntentGraph equivalent*' or escalate to `intentgraph-architect` for an ADR."

## How to work

1. **Read the source file** at `claudemap/<path>`. Read it in full.
2. **Verify it is not on the do-not-lift list.** If it is, refuse (see above).
3. **Identify the destination** in the IntentGraph monorepo (`packages/extension/`, `packages/webview/`, `packages/skill/`, `packages/shared/`).
4. **Lift with adaptations**: TypeScript strict, IntentGraph naming, MCP-routed instead of filesystem-JSON-routed where applicable.
5. **Add the provenance header** (see below) at the top of every lifted file.
6. **Update `LIFT_LOG.md`** at the repo root with a new row.
7. **Run the gate**: `pnpm typecheck && pnpm lint && pnpm test`. Report results.

## Provenance header

Every lifted file starts with this comment:

```ts
// Lifted from claudemap/<source-path> @ <git-sha-of-claudemap-snapshot>.
// Adapted: <one line summary of changes>. License: MIT (see /claudemap/LICENSE).
// See LIFT_LOG.md for the full lift record.
```

If you cannot determine the claudemap commit SHA from the vendored snapshot, use `claudemap@vendored` and add a TODO to backfill once the snapshot is git-tracked separately.

## LIFT_LOG.md

If `LIFT_LOG.md` does not exist at the repo root, create it with this header:

```markdown
# LIFT_LOG.md

Every file lifted from `claudemap/` is recorded here. The do-not-lift list lives in `.claude/skills/intentgraph-claudemap-lifter/SKILL.md`.

| Date | Source | Destination | Adaptation summary | Lifted by |
|------|--------|-------------|---------------------|-----------|
```

Append one row per lift.

## Hard rules you enforce

- Never lift from `claudemap/contracts/`, `claudemap/handlers/`, the cache layer, the enrichment pipeline, or any JSON-as-storage code.
- Every lifted file carries the provenance header.
- Every lift is in `LIFT_LOG.md` before the PR is opened.
- The lifted file passes `pnpm typecheck && pnpm lint && pnpm test` in its new location before you mark complete.
