---
updated: 2026-11-27
---
# Board

Open work only. A finished lane moves to the [[Devlog]] in the same turn. Rules: [[How We Work]].

Integration branch: `night-1`. `main` is still at the May state until the owner says merge. Green and verified lanes merge into `night-1`, visual ones too (the owner's call of 2026-11-27).

## Lanes with a go (given by the owner on 2026-11-27)

They run one after another, because all three touch the node components.

| Lane | What | Branch | Status | Evidence |
|---|---|---|---|---|
| 4 Blueprint wires and pins | Step one of ADR 0031: pins on the sides, smooth wires, left to right, no wire through a label. Lane note: [[blueprint-wires]] | `blueprint-wires` | building | |
| 5 drift on the graph | The drift check's verdict as a mark on each node, next to the test status | `drift-marks` | waits for lane 4 | |
| 6 editing polish | Highlight the selected node, keep the panel off the canvas, make read-only look read-only, new intents get their target kinds from the form, a double-click launcher | `edit-polish` | waits for lane 5 | |

## Waiting on the owner

1. **Merge `night-1` to `main`?** After a look at the frames. Recommended: yes, as one squashed commit.
2. **ADR 0030, the anchor format.** Accept it? Until then anchors live only on fixtures, so every node of this repo shows pending.
3. **A real gap found by the drift check.** `intent-concurrent-agents-stay-consistent` promises a version on every node and edge, and the `edge` table has none (commit `b38e2cd`, still true). Park the intent with the rest of the May plan, or keep it as a debt?
4. **Three spec files still name Codex as a client** (`spec/intents/one-skill-three-clients.md` and two concepts). A spec changes only with a human yes.
5. **Which Blueprint step comes next** (ADR 0031, steps 5 to 7): one pin per relation kind, editing by wire, or levels of detail.
6. **Public repo hygiene.** One small call, written up in the owner's private notes.

## Next, not started (each needs a go)

1. The next Blueprint step (call 5).
2. Anchors on this repo's real spec nodes (needs call 2), so the graph says something true about this codebase.
3. Package as a Claude Code plugin: a skill, hooks and a small MCP server for graph queries.
4. Capture intent from agent chats as proposed nodes, confirmed by a human.
5. Decide what happens to the parked scaffolds in `packages/skill/src` (orchestrator, agent-runner, retrieval).
6. React Flow 13 migration. Only if the v12 pin starts to hurt.

## Known

- Anchors are parsed twice: `packages/skill/src/parser/spec-md/anchors.ts` and inside `packages/skill/src/drift/`. One of them should go.
- The drift judge answers "unclear" on about a third of real commits, mostly when a large diff is cut at 12k characters.
- ELK layout runs on the main thread today (see [[Code Map]]).
- The ESLint guard and the two edit hooks still enforce the AgentRunner rule from the May plan. Harmless, but tied to parked code.
- `claudemap/` is an empty link to the fork source. Nothing can be lifted until it is restored.
