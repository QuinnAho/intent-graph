---
updated: 2026-11-27
---
# Board

Open work only. A finished lane moves to the [[Devlog]] in the same turn. Rules: [[How We Work]].

Integration branch: `night-1`. `main` is still at the May state until Quinn says merge.

## Night 1 (go given by Quinn on 2026-11-27)

| Lane | What | Branch | Status | Evidence |
|---|---|---|---|---|
| 3 visual editing | First cut: create and edit an intent on the canvas, saved as clean markdown. Frames to Quinn before any merge. Lane note: [[visual-edit]] | `visual-edit` | building | |

Lanes 1 (live graph with status) and 2 (drift check prototype) merged to `night-1` on 2026-11-27. See the [[Devlog]].

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

## Found by the drift check on our own history (for Quinn to judge)

- `intent-concurrent-agents-stay-consistent` promises a per-row version on every node and edge. The `edge` table has no `version` column (commit `b38e2cd`, still true today). Either the intent or the table is wrong. The code in question belongs to the parked plan, so this may simply mean the intent is parked too.

## Known

- Anchors are parsed twice: `packages/skill/src/parser/spec-md/anchors.ts` (lane 1) and inside `packages/skill/src/drift/` (lane 2). One of them should go.
- The drift judge answers "unclear" on about a third of real commits, mostly when a large diff is cut at 12k characters.
- Edges are drawn through node labels.
- ELK layout runs on the main thread today (see [[Code Map]]).
- The ESLint guard and the two edit hooks still enforce the AgentRunner rule from the May plan. Harmless, but tied to parked code.
- `claudemap/` is an empty link to the fork source. Nothing can be lifted until it is restored.
