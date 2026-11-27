---
updated: 2026-11-27
---
# Board

Open work only. A finished lane moves to the [[Devlog]] in the same turn. Rules: [[How We Work]].

Integration branch: `night-1`. `main` is still at the May state until Quinn says merge.

## Night 1 (go given by Quinn on 2026-11-27)

| Lane | What | Branch | Status | Evidence |
|---|---|---|---|---|
| 1 live graph | Edit a `/spec` file and the graph updates in about 2 s. Nodes show verified, failed or pending from their linked tests. Lane note: [[live-graph]] | `live-graph` | building | |
| 2 drift check | Prototype: a commit, its linked spec nodes, and a verdict from a model that did not write the change. Lane note: [[drift-check]] | `drift-check` | building | |
| 3 visual editing | First cut: create and edit an intent on the canvas, saved as clean markdown. Frames to Quinn before any merge | `visual-edit` | waiting on lane 1 | |

## Waiting on Quinn

- Merge `night-1` to `main`, after the morning report.
- ADR 0030 (the anchor format) is proposed. Lanes use it on fixtures only until Quinn says yes.
- Frames for lane 3, and lane 1's status marks.
- Three spec files still name Codex as a client (`spec/intents/one-skill-three-clients.md` and two concepts). A spec changes only with a human yes.

## Next, not started (needs a go)

- Package as a Claude Code plugin: a skill, hooks and a small MCP server for graph queries.
- Capture intent from agent chats as proposed nodes, confirmed by a human.
- Decide what happens to the parked scaffolds in `packages/skill/src` (orchestrator, agent-runner, retrieval).
- React Flow 13 migration. Only if the v12 pin starts to hurt.

## Known

- The graph's "fit" view shows about 83 of 749 nodes, all code. Lane 1 makes the spec nodes visible first.
- ELK layout runs on the main thread today (see [[Code Map]]).
- The ESLint guard and the two edit hooks still enforce the AgentRunner rule from the May plan. Harmless, but tied to parked code.
- `claudemap/` is an empty link to the fork source. Nothing can be lifted until it is restored.
