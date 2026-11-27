---
updated: 2026-11-27
---
# IntentGraph: Start Here

This vault is the project's memory. Every session reads this note and [[Board]] first, and writes back what it learns. Open anything else only when the task touches it.

## Status right now (2026-11-27)

| | |
|---|---|
| Direction | Slim to the wedge, visual first. Decided by the owner on 2026-11-27, recorded in [[0029-slim-to-the-wedge]]. |
| Built | The static graph (L0): a tree-sitter walk of the code plus the `/spec` markdown, stored in SQLite, shown with React Flow and ELK. Signed off 2026-05-04. |
| On `night-1`, not yet on `main` | Six lanes of 2026-11-27: the live graph with status marks from linked tests, the drift check, editing on the canvas, Blueprint-style wires and pins ([[0031-the-graph-follows-blueprint-conventions]]), drift marks on the graph, and editing polish. Each was gated by script and checked by an independent verifier. 304 tests. |
| See it | Double-click `open-graph.cmd` to view this repo's graph, or `open-graph-edit.cmd` to edit it. A small example with marks and wires to code: `node tools/e2e-live.mjs --serve`. Drift check: `node tools/drift.mjs`. Frames with verdicts: `docs/05 - Log/Frames/2026-11-27 Night 1/README.md`. |
| Parked | The May 2026 plan's plumbing: Inngest, AgentRunner, leases, Yjs, retrieval, the VS Code extension. See the ADR for the list. |
| Repo | `github.com/QuinnAho/intent-graph`. Lanes build in `.wt/<lane>`. Work lands on an integration branch before `main`. |
| Gate | `node tools/verify.mjs all`, then the end-to-end scripts `tools/e2e-live.mjs`, `e2e-edit.mjs`, `e2e-wires.mjs` and `e2e-drift-marks.mjs`. Frames: `node tools/frames.mjs`. |
| Before the overhaul | Everything as it was on 2026-05-20 is tagged `pre-overhaul-2026-11-27`, including the old Ralph loop and the Codex mirror. |

## Map of the vault

- **01 - Product**: [[Tech Spec]] (the May 2026 plan, now partly parked), [[Architecture]], [[Glossary]], [[Structure]], [[Code Map]] (read this instead of the source tree).
- **02 - Decisions**: the ADRs. [[0029-slim-to-the-wedge]] says which earlier ones are parked.
- **03 - Research**: the November 2026 research ([[2026-11-27 Direction - Approaches]] first), the UX synthesis, open questions, spikes.
- **04 - Workflow**: [[How We Work]], the lift log and audit from the ClaudeMap fork.
- **05 - Log**: [[Devlog]], QA reports and signoffs from the May work, frames.
- **06 - Tasks**: [[Board]], the Phase 4 backlog, and the archived May task lists.

## Rules for whoever writes here

- One fact, one place. Link to it instead of copying it.
- Absolute dates. Say what was verified on this machine and what was only read.
- A decision goes in an ADR with its reason. A changed decision gets a new ADR. The old one is marked superseded, never deleted.
- The Board holds open work only. Finished items move to the Devlog in the same turn.
- No secrets, keys or tokens anywhere in the repo.

## Session start and end

1. Start: this note, then [[Board]].
2. End: update the Board, add a few Devlog lines, and fix the status table above if it changed.
