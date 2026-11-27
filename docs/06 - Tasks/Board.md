---
updated: 2026-11-27
---
# Board

Open work only. A finished lane moves to the [[Devlog]] in the same turn. Rules: [[How We Work]].

Integration branch: `night-1`. `main` is still at the May state until the owner says merge. What the first night did: [[2026-11-27 Night 1 Report]].

## Lanes with a go

| Lane | What | Branch | Status | Evidence |
|---|---|---|---|---|
| 3 visual editing | First cut: edit a node's title and body in a side panel and create an intent on the canvas, saved as clean markdown. Lane note: [[visual-edit]] | `visual-edit` | Built and verified. Not merged: it waits for the owner's eyes | Gate, end-to-end script and an independent verifier (13 of 13). Pass lines and frames are in the report |

Nothing else has a go. The loop of 2026-11-27 ended here.

## Waiting on the owner

1. **Merge `night-1` to `main`?** Recommended: yes, as one squashed commit.
2. **Visual editing.** Look at the frames in the report, or run `node tools/e2e-edit.mjs --serve` inside `.wt/visual-edit`. Merge it into `night-1`, or change something first?
3. **ADR 0030, the anchor format.** Accept it? Until then anchors live only on fixtures, so every node of this repo shows pending.
4. **New intents from the canvas have no `target_kinds`.** `spec/intents/README.md` requires it, so each new intent shows as a problem. Recommended: the form asks for the kinds, with one preselected. Other options: a draft is exempt, or leave it.
5. **A real gap found by the drift check.** `intent-concurrent-agents-stay-consistent` promises a version on every node and edge, and the `edge` table has none (commit `b38e2cd`, still true). Park the intent with the rest of the May plan, or keep it as a debt?
6. **Three spec files still name Codex as a client** (`spec/intents/one-skill-three-clients.md` and two concepts). A spec changes only with a human yes.
7. **Public repo hygiene.** Two small calls, written up in the owner's private notes.

## Next, not started (each needs a go)

In the order recommended:

1. Edge routing. Edges are drawn through boxes and labels, and edges to hidden code nodes leave loose lines. It is the first thing the eye lands on.
2. Show drift on the graph: a node mark from the drift check's verdict, next to the test status.
3. Anchors on this repo's real spec nodes (needs call 3), so the graph says something true about this codebase.
4. Polish for visual editing once the owner has seen it: highlight the selected node, keep the panel off the canvas, make read-only look read-only.
5. Package as a Claude Code plugin: a skill, hooks and a small MCP server for graph queries.
6. Capture intent from agent chats as proposed nodes, confirmed by a human.
7. Decide what happens to the parked scaffolds in `packages/skill/src` (orchestrator, agent-runner, retrieval).
8. React Flow 13 migration. Only if the v12 pin starts to hurt.

## Known

- Anchors are parsed twice: `packages/skill/src/parser/spec-md/anchors.ts` and inside `packages/skill/src/drift/`. One of them should go.
- The drift judge answers "unclear" on about a third of real commits, mostly when a large diff is cut at 12k characters.
- ELK layout runs on the main thread today (see [[Code Map]]).
- The ESLint guard and the two edit hooks still enforce the AgentRunner rule from the May plan. Harmless, but tied to parked code.
- `claudemap/` is an empty link to the fork source. Nothing can be lifted until it is restored.
