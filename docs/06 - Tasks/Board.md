---
updated: 2026-11-27
---
# Board

Open work only. A finished lane moves to the [[Devlog]] in the same turn. Rules: [[How We Work]].

`main` holds everything through lane 10 (the owner's three OKs of 2026-11-27). New lanes branch from `day-2`, which is level with `main`. Green and verified lanes stack on `day-2`, the same rule the owner set for `night-1`. `main` moves when the owner has seen the frames.

## Lanes with a go

The owner on 2026-11-27, paraphrased: editing on the graph has to be easy and intuitive, and every lane ends with polish.

None is building. Lane 7 (direct editing: rename in place, a right-click menu, a plus in the concept header) and lane 8 (editing by wire: connect, disconnect, move, undo) are on `main`. See the [[Devlog]]. Frames with a verdict each: `docs/05 - Log/Frames/2026-11-27 Day 2/README.md`.

## An experiment, kept or dropped after a look

Declared and inferred intent: the owner said go on 2026-11-27. Options and the recommendation: [[2026-11-27 Layers - Approaches]].

Lane 9 (the inference script, `node tools/infer.mjs`) and lane 10 (the proposals on the graph, with accept, edit first, dismiss and undo) are on `main`. See the [[Devlog]]. Frames with a verdict each: `docs/05 - Log/Frames/2026-11-27 Day 2/README.md`, frames `10a` to `10h`.

### Not right yet: many proposals on a real graph

On this repo with its real report (66 proposals beside 12 declared intents), frame `10g`:

- The first view no longer fits the graph. The zoom stops at 0.5 and part of the graph is off screen.
- The wire from one constraint runs through two proposal boxes. ADR 0031 says no wire through a box.
- `node tools/e2e-wires.mjs` fails in a checkout that holds a real report under `.runs/infer`: 1 of 3 wires crosses a box, one wire ends off screen, and the hover check times out. In a checkout with no report it passes. The script has no case with many proposals, so nothing in git catches this yet.

It waits for the owner's pick, call 1 below.

### Next, in order

1. The owner's pick on how many proposals sit on a real graph (call 1). Then a small lane for it, with a case in the wires script that has many proposals in a concept with a wire coming in.
2. The lane after it: open an intent and see its code nested inside. The owner said go on 2026-11-27. The variant is call 2. Its held-back checks are written, in the local run folder (`.runs/night-1/held-out/nested-code.md`, not in git).

## Waiting on the owner

1. **Many proposals on a real graph.** Recommended: fold them. Each concept shows one dashed chip such as "9 inferred", and a click on it or on the strip count opens them. The declared graph stays as it was until a person asks. The other way: keep all of them drawn and change the layout so no wire crosses a box.
2. **How an intent opens.** Recommended: in place. The node grows into a box that holds its code, the way a concept holds intents. The other way: step inside on a double-click, with a way back.
3. **ADR 0030, the anchor format.** Accept it? Until then anchors live only on fixtures, so every node of this repo shows pending, no wire runs from a spec node to code, and nesting has nothing real to show.
4. **Which words are target kinds?** `spec/intents/README.md` and all 12 intents of this repo use `module` and `api`. The code schema (`packages/shared/src/schemas/node.ts:31`) only knows node kinds such as `code_module`, and the new-intent form offers those nine. Recommended: the README's words.
5. **A real gap found by the drift check.** `intent-concurrent-agents-stay-consistent` promises a version on every node and edge, and the `edge` table has none (commit `b38e2cd`, still true). Park the intent with the rest of the May plan, or keep it as a debt?
6. **Three spec files still name Codex as a client** (`spec/intents/one-skill-three-clients.md` and two concepts). A spec changes only with a human yes.
7. **Public repo hygiene.** One small call, written up in the owner's private notes.

## Next, not started (each needs a go)

1. Proposed anchors on the graph: a lane proposes which code and tests each intent maps to, shows them dashed, and the owner confirms each one on the canvas (needs call 4).
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
- The new-intent form lists nine raw kind names. See call 4.
- Anchors are parsed twice: `packages/skill/src/parser/spec-md/anchors.ts` and inside `packages/skill/src/drift/`. One of them should go.
- The drift judge answers "unclear" on about a third of real commits, mostly when a large diff is cut at 12k characters.
- The drift report is found by a 400 ms poll, not by a file watcher.
- ELK layout runs on the main thread today (see [[Code Map]]).
- The ESLint guard and the two edit hooks still enforce the AgentRunner rule from the May plan. Harmless, but tied to parked code.
- `claudemap/` is an empty link to the fork source. Nothing can be lifted until it is restored.
- The two launcher files were tested through their script with no browser window.
- The right-click menu may be drawn under the side panel when it opens near the right edge with the panel open. Seen once in a test log, where the panel took the click meant for a menu entry. Not confirmed by eye.
- On the calculator example the wires script draws 0 of 8 wires, because all of them run between the spec block and the code block. Its crossing check proves nothing there.
- The settled list under `.runs/infer` keeps its "accepted" entries after an undo. Harmless: an accepted proposal is hidden only while its intent file exists.
- An inferred node shows no key hint until it is selected.
- A run that dies with "out of memory" or "no space left on device" is the dev machine, not the code. Both happened on the evening of 2026-11-27 while other programs were open.
