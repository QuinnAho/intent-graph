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
| On `main` since 2026-11-27 | Six lanes, squashed into one commit: the live graph with status marks from linked tests, the drift check, editing on the canvas, Blueprint-style wires and pins ([[0031-the-graph-follows-blueprint-conventions]]), drift marks on the graph, and editing polish. Each was gated by script and checked by an independent verifier. Added the same day: direct editing and editing by wire (lanes 7 and 8), the inference script (lane 9), and inferred intents on the graph (lane 10). Then the data behind "which agent is working on what": the live server reads the git worktrees and the run log into `/graph.json` (lane 14, first half, nothing drawn yet), and the graph at a glance: a state bar that counts every state, a legend, the robot on what a model said (lane 11). 535 tests. |
| Not right yet | Many proposals on a real graph: on this repo 66 of them crowd the first view and one wire runs through proposal boxes. See the [[Board]]. |
| See it | Double-click `open-graph.cmd` to view this repo's graph, or `open-graph-edit.cmd` to edit it. A small example with marks and wires to code: `node tools/e2e-live.mjs --serve`. Drift check: `node tools/drift.mjs`. Proposals show on the graph when a report exists under `.runs/infer`, and `node tools/infer.mjs` writes one (it calls a model, a few cents for this repo). Frames with verdicts: `docs/05 - Log/Frames/2026-11-27 Night 1/README.md` and `2026-11-27 Day 2/README.md`. |
| Parked | The May 2026 plan's plumbing: Inngest, AgentRunner, leases, Yjs, retrieval, the VS Code extension. See the ADR for the list. |
| Repo | `github.com/QuinnAho/intent-graph`. Lanes build in `.wt/<lane>`. Work lands on an integration branch (`day-2` now) before `main`. |
| Gate | `node tools/verify.mjs all`, then the end-to-end scripts `tools/e2e-live.mjs`, `e2e-edit.mjs`, `e2e-wires.mjs`, `e2e-drift-marks.mjs`, `e2e-inferred.mjs`, `e2e-agents.mjs` and `e2e-glance.mjs`. Frames: `node tools/frames.mjs`. |
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
