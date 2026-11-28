---
updated: 2026-11-27
---
# Board

Open work only. A finished lane moves to the [[Devlog]] in the same turn. Rules: [[How We Work]].

`main` holds everything through lane 8 (the owner's two OKs of 2026-11-27). New lanes branch from `day-2`, which is level with `main`. Green and verified lanes stack on `day-2`, the same rule the owner set for `night-1`. `main` moves when the owner has seen the frames.

## Lanes with a go

The owner on 2026-11-27, paraphrased: editing on the graph has to be easy and intuitive, and every lane ends with polish.

None is building. Lane 7 (direct editing: rename in place, a right-click menu, a plus in the concept header) and lane 8 (editing by wire: connect, disconnect, move, undo) are on `main`. See the [[Devlog]]. Frames with a verdict each: `docs/05 - Log/Frames/2026-11-27 Day 2/README.md`.

## An experiment, kept or dropped after a look

Declared and inferred intent: the owner said go on 2026-11-27. Options and the recommendation: [[2026-11-27 Layers - Approaches]].

| Lane | What | Branch | Status |
|---|---|---|---|
| 10 inferred on the graph | The proposals drawn dashed, with the word "inferred". Enter accepts and writes a spec file tied to that code, a double-click edits first, Delete dismisses, undo takes any of it back. Lane note: [[inferred-graph]] | `inferred-graph` at `13c4655`, worktree `.wt/inferred-graph` | built, pushed, **not merged**. See below |

Lane 9 (the inference script, `node tools/infer.mjs`) is merged into `day-2`. See the [[Devlog]].

### Where lane 10 stands (handoff of 2026-11-27, 6:35 PM)

- The builder reports all eleven scope steps done.
- The orchestrator's own gate on `13c4655`: `PASS all - 4 steps, 491 tests` and `PASS e2e-inferred`. Scope is clean: no file outside the list, no test removed.
- Two reds, not yet told apart from machine load. `tools/e2e-edit.mjs` timed out on a click (30 s). `tools/e2e-wires.mjs` fails its layout-time check, on `day-2` too: 3.2 to 3.7 s against a fixed limit of 2.86 s that was measured on the first night. Both were measured while the dev PC ran at 93% CPU from another program, and the whole gate took twice as long as usual.
- No independent verifier has seen lane 10 yet. Its held-back checks are written, in the local run folder (`.runs/night-1/held-out/inferred-graph.md`, not in git).

Next, in order:
1. On a quiet machine, run `node tools/e2e-wires.mjs` and `node tools/e2e-edit.mjs` three times each on `day-2`, then on the lane. If they pass, the reds were load. Either way the wires script's time check should stop comparing with a number from another day: make it a generous cap, or a ratio measured in the same run.
2. Send a fresh verifier with the held-back checks. Fix what it finds with a fresh small agent.
3. Merge into `day-2`, gate there, take frames for the owner. Then the lane after it: open an intent and see its code nested inside.

## Waiting on the owner

1. **ADR 0030, the anchor format.** Accept it? Until then anchors live only on fixtures, so every node of this repo shows pending, no wire runs from a spec node to code, and nesting has nothing real to show.
2. **Which words are target kinds?** `spec/intents/README.md` and all 12 intents of this repo use `module` and `api`. The code schema (`packages/shared/src/schemas/node.ts:31`) only knows node kinds such as `code_module`, and the new-intent form offers those nine. Recommended: the README's words.
3. **A real gap found by the drift check.** `intent-concurrent-agents-stay-consistent` promises a version on every node and edge, and the `edge` table has none (commit `b38e2cd`, still true). Park the intent with the rest of the May plan, or keep it as a debt?
4. **Three spec files still name Codex as a client** (`spec/intents/one-skill-three-clients.md` and two concepts). A spec changes only with a human yes.
5. **Public repo hygiene.** One small call, written up in the owner's private notes.

## Next, not started (each needs a go)

1. Proposed anchors on the graph: a lane proposes which code and tests each intent maps to, shows them dashed, and the owner confirms each one on the canvas (needs call 2).
2. One pin per relation kind, and levels of detail when zoomed out (ADR 0031, steps 5 and 7).
3. Run the drift check from the page, with a spending cap, instead of from the command line.
4. Package as a Claude Code plugin: a skill, hooks and a small MCP server for graph queries.
5. Capture intent from agent chats as proposed nodes, confirmed by a human.
6. Decide what happens to the parked scaffolds in `packages/skill/src` (orchestrator, agent-runner, retrieval).
7. React Flow 13 migration. Only if the v12 pin starts to hurt.

## Known

- A spec file can hold one relation today, `parent`. Connecting, disconnecting and moving a node all write that one field. Other relations (constrains, supersedes, depends on) would need a change to the spec format first.
- A spec file with no `parent` key at all is not a node (ADR 0009 requires the key), so it cannot be given a parent from the canvas.
- Two constraint wires cross each other on this repo's first view. One pin per node gives the layout nothing to order them by.
- The new-intent form lists nine raw kind names. See call 3.
- Anchors are parsed twice: `packages/skill/src/parser/spec-md/anchors.ts` and inside `packages/skill/src/drift/`. One of them should go.
- The drift judge answers "unclear" on about a third of real commits, mostly when a large diff is cut at 12k characters.
- The drift report is found by a 400 ms poll, not by a file watcher.
- ELK layout runs on the main thread today (see [[Code Map]]).
- The ESLint guard and the two edit hooks still enforce the AgentRunner rule from the May plan. Harmless, but tied to parked code.
- `claudemap/` is an empty link to the fork source. Nothing can be lifted until it is restored.
- The two launcher files were tested through their script with no browser window.
