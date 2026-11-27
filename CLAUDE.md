# IntentGraph

A tool where a developer works in a living graph of intents, constraints, decisions and concepts, and AI keeps the code in line with it. Visual first: the graph is how Quinn reads and edits the spec.

Direction since 2026-11-27 (ADR-0029): slim to the wedge. Typed markdown under `/spec` is the source of truth, and the graph is its view and editor. We build the two things nobody ships: obligations tied to real checks, and an intent-level drift check. Everything else comes from Claude Code or open source.

## Memory

The vault is `docs/`. Read `docs/00 - Start Here.md`, then `docs/06 - Tasks/Board.md`. Open another note only when the task touches it.

- Decisions are ADRs in `docs/02 - Decisions/`. Numbered, never edited after acceptance, superseded by a new one.
- Write back in the same turn: Board status, and a few lines in `docs/05 - Log/Devlog.md` per milestone.
- How lanes, gates and reviews run: `docs/04 - Workflow/How We Work.md`.

## Hard rules

- Files under `/spec` are contracts with YAML frontmatter. Use the `intentgraph-spec-writer` skill to add or change them.
- SQLite is a projection of the spec files and the code. JSON is for export only, never storage.
- TypeScript strict. No `any`, and no `@ts-ignore` without an ADR number beside it.
- Reuse before writing. Check open source first and record adopt, borrow or skip in the lane note. Quinn: "use the best things of open source stuff rather than rewrite from scratch".
- An agent never changes a spec by itself. A proposed spec change waits for a human yes.
- Anything visual goes past Quinn as frames before it merges.
- Parked, not to be extended without a new ADR: Inngest, AgentRunner and model tiers, leases, Yjs, vector retrieval, the VS Code extension. The ESLint rule that keeps model-call imports inside `packages/skill/src/agent-runner` stays on.

## Checks

`node tools/verify.mjs all` is the only gate: typecheck, lint, tests, build. It prints one PASS or FAIL line and exits 0 only on pass.
`node tools/frames.mjs` takes frames of the graph.

## Git

- Commits: all lowercase, casual, two sentences at most, no co-author line.
- A lane works in `.wt/<lane>` on its own branch and pushes it. Green lanes merge to the integration branch. `main` moves only with Quinn's OK.
