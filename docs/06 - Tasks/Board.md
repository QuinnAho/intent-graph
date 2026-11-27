---
updated: 2026-11-27
---
# Board

Open work only. A finished lane moves to the [[Devlog]] in the same turn. Rules: [[How We Work]].

Integration branch: `night-1`. `main` is at the May state plus nothing, until Quinn says merge.

## Night 1 (go given by Quinn on 2026-11-27)

| Lane | What | Branch | Status | Evidence |
|---|---|---|---|---|
| 0a overhaul | Vault layout, Codex removed, old loop removed, build fixed | `brain-overhaul` | building | |
| 0b harness | `tools/verify.mjs` and `tools/frames.mjs`, proven with deliberate failures | `harness` | building | |
| 0c notes | Slim CLAUDE.md, this vault's new notes, ADR 0029 | `vault-notes` | writing | |
| 1 live graph | Edit a `/spec` file and the graph updates in about 2 s. Nodes show verified, failed or pending from their linked tests. Starts with a 30-minute codegraph test | `live-graph` | waiting on 0a, 0b | |
| 2 drift check | Prototype: a commit, its linked spec nodes, and a verdict from a model that did not write the change. Run on our own last 20 commits | `drift-check` | waiting on 0a, 0b | |
| 3 visual editing | First cut: create and edit an intent on the canvas, saved as clean markdown. Frames to Quinn before any merge | `visual-edit` | waiting on lane 1 | |

## Waiting on Quinn

- Merge `night-1` to `main`, after the morning report.
- Frames for lane 3 (and lane 1's status colours).

## Next, not started (needs a go)

- Package as a Claude Code plugin: a skill, hooks and a small MCP server for graph queries.
- Capture intent from agent chats as proposed nodes, confirmed by a human.
- Decide what happens to the parked scaffolds in `packages/skill/src` (orchestrator, agent-runner, retrieval).
- React Flow 13 migration. Only if the v12 pin starts to hurt.

## Known

- The ESLint guard and the two edit hooks still enforce the AgentRunner rule from the May plan. Harmless, but tied to parked code.
- `claudemap/` is an empty link to the fork source. Nothing can be lifted until it is restored.
