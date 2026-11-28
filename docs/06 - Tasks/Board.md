---
updated: 2026-11-27
---
# Board

Open work only. A finished lane moves to the [[Devlog]] in the same turn. Rules: [[How We Work]].

`main` holds everything through lane 10 (the owner's three OKs of 2026-11-27). New lanes branch from `day-2`, which is level with `main`. Green and verified lanes stack on `day-2`, the same rule the owner set for `night-1`. `main` moves when the owner has seen the frames.

## Lanes with a go

The owner on 2026-11-27, paraphrased: editing on the graph has to be easy and intuitive, and every lane ends with polish.

The owner on 2026-11-27, in the evening, paraphrased: this should be a tool for every day. It should show the state of the project at all times, the high-level implementation behind each intent, the status of the spec, and more of what the AI is thinking. What a model inferred carries a robot icon, and the graph shows which agent is working on what. Today it is hard to tell at first sight what is what.

| Lane | What | Status |
|---|---|---|
| 11 at a glance | The robot icon on everything a model said, a project state bar that is always there, a legend, key hints. No new data. Lane note: [[glance]] | built, gated and pushed at `73aa83f`, worktree `.wt/glance`. **Not verified, not merged.** See below |
| 12 fold the proposals | One dashed chip per concept such as "9 inferred" that opens on a click, so many proposals stop crowding a real graph. Fixes the fault below. Call 1, the recommended way unless the owner picks the other | next |
| 13 open an intent | Its code nested inside, in place. Call 2, the recommended way unless the owner picks the other. Held-back checks are written (`.runs/night-1/held-out/nested-code.md`, not in git) | after 12 |
| 14 agents on the graph | Which lane or agent is changing which code, and which intents that touches. First read from git worktrees and the run log, with no install. Live detail from editor hooks later, and a hook needs the owner's yes | first half (the data) built, gated and pushed at `a45172b`, worktree `.wt/agents`. **Not verified, not merged.** The second half, drawing it, waits for lane 11 to merge |
| 15 what the AI is thinking | For a proposal: what the model was shown and why it said so. For drift: the judge's reasons. For an agent at work: its task | after 14 |

### Where lanes 11 and 14 stand (handoff of 2026-11-27, 9:30 PM)

Both are built, pushed and gated by the orchestrator on the committed head. No independent verifier has seen either one, and nothing is merged.

- **Lane 11, at a glance, `glance` at `73aa83f`.** `PASS all (53.9s) - 4 steps, 510 tests`, and PASS for `e2e-glance`, `e2e-edit`, `e2e-inferred`, `e2e-live`, `e2e-drift-marks` and `e2e-wires`. All nine scope steps are reported done. Scope: the page, the new `tools/e2e-glance.mjs`, and two lines of `tools/e2e-edit.mjs` (a right-click point moved below the new bar, and one wheel step now zooms in, because with the bar the canvas is shorter and the fit already sits at the smallest zoom). The orchestrator looked at the frames: the bar, the legend and the robot read well. Frames are in the worktree under `.runs/e2e-glance/` and `.runs/e2e-glance-frames/`. Not done: the builder did not fill its sections of the lane note, and its frames of this repo had no drift report.
- **Lane 14, first half, `agents` at `a45172b`.** `PASS all (115.1s) - 4 steps, 516 tests`, and PASS for `e2e-agents`, `e2e-edit`, `e2e-inferred`, `e2e-live`, `e2e-drift-marks` and `e2e-wires`. Scope is clean: ten files, nothing under the page, no dependency. Git is called with fixed arguments, no shell, a time limit and no optional locks. Not verified: what a git call that runs out of time leaves behind on Windows.

Next, in order:

1. A fresh verifier (sonnet, medium) for each lane, with the held-back checks in the local run folder (`.runs/night-1/held-out/glance.md` and `agents.md`, not in git). Fix what they find with a fresh small agent, not the builder.
2. Lane 11 is visual: frames with a verdict each go to the owner before it merges. Lane 14's first half has nothing to look at and merges to `day-2` once verified. Merge lane 11 first, then lane 14. They share no file.
3. Then lane 12 (fold the proposals), lane 13 (open an intent), the second half of lane 14 (draw who is on what), lane 15 (what the AI is thinking). One page lane at a time: they all touch the same page files.

Lane 7 (direct editing: rename in place, a right-click menu, a plus in the concept header) and lane 8 (editing by wire: connect, disconnect, move, undo) are on `main`. See the [[Devlog]]. Frames with a verdict each: `docs/05 - Log/Frames/2026-11-27 Day 2/README.md`.

## An experiment, kept or dropped after a look

Declared and inferred intent: the owner said go on 2026-11-27. Options and the recommendation: [[2026-11-27 Layers - Approaches]].

Lane 9 (the inference script, `node tools/infer.mjs`) and lane 10 (the proposals on the graph, with accept, edit first, dismiss and undo) are on `main`. See the [[Devlog]]. Frames with a verdict each: `docs/05 - Log/Frames/2026-11-27 Day 2/README.md`, frames `10a` to `10h`.

### Not right yet: many proposals on a real graph

On this repo with its real report (66 proposals beside 12 declared intents), frame `10g`:

- The first view no longer fits the graph. The zoom stops at 0.5 and part of the graph is off screen.
- The wire from one constraint runs through two proposal boxes. ADR 0031 says no wire through a box.
- `node tools/e2e-wires.mjs` fails in a checkout that holds a real report under `.runs/infer`: 1 of 3 wires crosses a box, one wire ends off screen, and the hover check times out. In a checkout with no report it passes. The script has no case with many proposals, so nothing in git catches this yet.

Lane 12 above is the fix. It adds a case to the wires script with many proposals in a concept that has a wire coming in.

## Waiting on the owner

1. **Many proposals on a real graph.** Recommended: fold them. Each concept shows one dashed chip such as "9 inferred", and a click on it or on the strip count opens them. The declared graph stays as it was until a person asks. The other way: keep all of them drawn and change the layout so no wire crosses a box.
2. **How an intent opens.** Recommended: in place. The node grows into a box that holds its code, the way a concept holds intents. The other way: step inside on a double-click, with a way back.
3. **ADR 0030, the anchor format.** Accept it? Until then anchors live only on fixtures, so every node of this repo shows pending, no wire runs from a spec node to code, and nesting has nothing real to show.
4. **Which words are target kinds?** `spec/intents/README.md` and all 12 intents of this repo use `module` and `api`. The code schema (`packages/shared/src/schemas/node.ts:31`) only knows node kinds such as `code_module`, and the new-intent form offers those nine. Recommended: the README's words.
5. **A real gap found by the drift check.** `intent-concurrent-agents-stay-consistent` promises a version on every node and edge, and the `edge` table has none (commit `b38e2cd`, still true). Park the intent with the rest of the May plan, or keep it as a debt?
6. **Three spec files still name Codex as a client** (`spec/intents/one-skill-three-clients.md` and two concepts). A spec changes only with a human yes.
7. **Public repo hygiene.** One small call, written up in the owner's private notes.
8. **The interface: a VS Code extension?** The owner now leans to one as the main interface, with the three layers linked and one memory. Options and the recommendation: [[2026-11-27 Interface - Approaches]]. Recommended: a thin extension around the page we have, as its own lane after a research pass, and calls 3 and 4 first because they make the links. Needs a new ADR, since ADR 0029 parked the extension host.

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
- Code nodes in `/graph.json` carry an absolute `file://` path in their body. The data is served on the dev machine only and is not in git, but a paste of it would show a local path. Reported by the lane 14 builder, not checked.
- In the legend of lane 11 three node kinds are listed that the page never draws: rationale, counterexample and task.
