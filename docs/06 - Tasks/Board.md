---
updated: 2026-11-28
---
# Board

Open work only. A finished lane moves to the [[Devlog]] in the same turn. Rules: [[How We Work]].

`main` holds everything through lane 12, the first half of lane 14 and lane 16. `day-2` also holds lane 13 since 2026-11-28 (merge `b4350bd`). It goes to `main` after a full clean gate, see the [[Devlog]]. New lanes branch from `day-2`. Green and verified lanes merge into `day-2` and then into `main`: the owner gave a standing OK for that late on 2026-11-27. Frames of anything visual still go to the owner, in the same report.

## Lanes with a go

The owner on 2026-11-27, paraphrased: editing on the graph has to be easy and intuitive, and every lane ends with polish.

The owner on 2026-11-27, in the evening, paraphrased: this should be a tool for every day. It should show the state of the project at all times, the high-level implementation behind each intent, the status of the spec, and more of what the AI is thinking. What a model inferred carries a robot icon, and the graph shows which agent is working on what. Today it is hard to tell at first sight what is what.

| Lane | What | Status |
|---|---|---|
| 17 a first view you can read | A floor under the page's own fit so text stays 9 px or more, a minimap, plain words in the bar, bigger pin areas, a sheet in a narrow window. From the walk and the research of 2026-11-28. Held-back checks are written (`.runs/night-2/held-out/readable.md`, not in git) | in work since 2026-11-28, see [[readable]] |
| steady checks | `e2e-drift-marks`, `e2e-edit` and `e2e-nested` go red on a busy machine. Make them hold with no assertion loosened | in work since 2026-11-28, branch `steady-checks` |
| 18 steady boxes | Opening a fold or an intent moves only what it must. Keep every other box where it was and push apart what overlaps, from the research of 2026-11-28 | after 17, see [[steady-boxes]] (held-back checks in `.runs/night-2/held-out/steady-boxes.md`) |
| 14 agents on the graph | Which lane or agent is changing which code, and which intents that touches. First read from git worktrees and the run log, with no install. Live detail from editor hooks later, and a hook needs the owner's yes | the first half (the data) is on `main`, see the [[Devlog]]. The second half, drawing it, comes after lane 17, see [[agents-view]] (held-back checks in `.runs/night-2/held-out/agents-draw.md`). The data holds the time of a lane's newest change only, so "since when" needs one more field |
| 15 what the AI is thinking | For a proposal: what the model was shown and why it said so. For drift: the judge's reasons. For an agent at work: its task | after 14 |

### Handoff (2026-11-28, 4:10 AM)

Done: lane 13 is on `day-2` (merge `b4350bd`, lane head `2ab81f7`), not yet on `main`. Lanes 11, 12, 16 and the first half of lane 14 are on `main` at `58a0533`.

In flight:

- Lane 17, branch `readable`, worktree `.wt/readable`, built at `e1271cd` on top of lane 13. The builder reported `PASS all`, 648 tests. Not yet gated by the orchestrator, not yet verified. Known before the verifier: the minimap is a black box with a speck on this repo, because the code block is about 18700 by 16500 px. `e2e-nested` failed 2 of 3 runs on this branch.
- Steady checks, branch `steady-checks`, worktree `.wt/steady-checks`, an agent at work since 4:00 AM. It runs a CPU burner on purpose, so every timing on the machine is slow until it ends.

Next, in order:

1. When steady checks reports: gate it, merge it into `day-2`, then into `readable`. Run `e2e-nested` five times on `readable`. If it still fails, that is a real fault between lanes 13 and 17: find it before anything merges.
2. Gate lane 17 (`node tools/verify.mjs all` and all eleven end-to-end scripts), send a verifier with `.runs/night-2/held-out/readable.md`, then one fix round that also deals with the minimap. Merge into `day-2`. With a full clean gate on `day-2`, merge `day-2` into `main`.
3. Lane 18 ([[steady-boxes]]) and the second half of lane 14 ([[agents-view]]) can run side by side: their files are split in the notes, and held-back checks for both are in `.runs/night-2/held-out/`. Then lane 15, which needs a lane note.
4. After each lane: frames of the merged state into `docs/05 - Log/Frames/2026-11-28/` with a verdict each. Lane 13's are still to take (`node tools/e2e-nested.mjs --frames`).
5. For the extension, still open: one status bar item, the editor's theme passed into the page, a stable address per workspace so the page remembers what was closed, the line above a bound function (needs call 3).

Open for the owner: calls 3, 4, 8, 9, 10 and 11 below. Call 3 unblocks the most: with the anchor format accepted, this repo's own intents can be bound to code and lane 13 has something real to show. Also whether to prune the merged worktrees (`agents`, `glance`, `e2e-flake`, `inferred-graph`, `editor-panel`, `fold`, and now `nested-code`).

The run log of the night is `.runs/night-2/log.jsonl`.

Lane 11 (at a glance: the state bar, the legend, the robot, key hints) is on `main` since late 2026-11-27. See the [[Devlog]]. Frames with a verdict each: `docs/05 - Log/Frames/2026-11-27 Day 2/README.md`, frames `11a` to `11h`. What it left open is under Known and in call 9.

Lane 16 (the graph in a panel of VS Code, a launcher, nothing installed) and lane 12 (the proposals fold, the graph fits again on a change of size, problems have one place) are on `main` since 2026-11-28. See the [[Devlog]]. Frames with a verdict each: `docs/05 - Log/Frames/2026-11-28/README.md`.

Lane 7 (direct editing: rename in place, a right-click menu, a plus in the concept header) and lane 8 (editing by wire: connect, disconnect, move, undo) are on `main`. See the [[Devlog]]. Frames with a verdict each: `docs/05 - Log/Frames/2026-11-27 Day 2/README.md`.

## An experiment, kept or dropped after a look

Declared and inferred intent: the owner said go on 2026-11-27. Options and the recommendation: [[2026-11-27 Layers - Approaches]].

Lane 9 (the inference script, `node tools/infer.mjs`) and lane 10 (the proposals on the graph, with accept, edit first, dismiss and undo) are on `main`. See the [[Devlog]]. Frames with a verdict each: `docs/05 - Log/Frames/2026-11-27 Day 2/README.md`, frames `10a` to `10h`.

## Waiting on the owner

1. Settled by lane 12: the proposals fold into one row per concept.
2. **How an intent opens.** Recommended: in place. The node grows into a box that holds its code, the way a concept holds intents. The other way: step inside on a double-click, with a way back.
3. **ADR 0030, the anchor format.** Accept it? Until then anchors live only on fixtures, so every node of this repo shows pending, no wire runs from a spec node to code, and nesting has nothing real to show.
4. **Which words are target kinds?** `spec/intents/README.md` and all 12 intents of this repo use `module` and `api`. The code schema (`packages/shared/src/schemas/node.ts:31`) only knows node kinds such as `code_module`, and the new-intent form offers those nine. Recommended: the README's words.
5. **A real gap found by the drift check.** `intent-concurrent-agents-stay-consistent` promises a version on every node and edge, and the `edge` table has none (commit `b38e2cd`, still true). Park the intent with the rest of the May plan, or keep it as a debt?
6. **Three spec files still name Codex as a client** (`spec/intents/one-skill-three-clients.md` and two concepts). A spec changes only with a human yes.
7. **Public repo hygiene.** One small call, written up in the owner's private notes.
8. **Install the extension in the owner's editor?** It works in a separate window today (`open-in-vscode.cmd`). Installing it means packaging a `.vsix` first, which needs the server bundled (ADR 0032). Recommended: use the separate window for a few days, then decide.
9. **One "needs attention" number in the bar?** The verifier of lane 11 missed a single total. Recommended: yes, at the left of the bar, counting failing, drift, unclear, stale and problems, and a click walks through them. Open: whether what a model inferred counts too. On this repo that is 66 and would drown the rest.

10. **Does a click on a node only select it?** From the walk: with editing on, one click opens the form with Save and Cancel, and a first-time user expected a click to select and nothing more. Blueprint shows editable details on select, which is what the page does now. Recommended: keep it, and make the form look like details, not like an edit in progress.
11. **Delete in the right-click menu?** The walk missed it. A delete removes a spec file, so it waits for a yes. Recommended: yes, with undo, and only with editing on.

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
- On the calculator example the wires script draws 0 of 8 wires, because all of them run between the spec block and the code block. Its crossing check proves nothing there.
- The settled list under `.runs/infer` keeps its "accepted" entries after an undo. Harmless: an accepted proposal is hidden only while its intent file exists.
- An inferred node shows no key hint until it is selected.
- A run that dies with "out of memory" or "no space left on device" is the dev machine, not the code. Both happened on the evening of 2026-11-27 while other programs were open.
- The run log reader takes the last 1 MB of a log. One line longer than that makes a lane's role, model, effort and task fall back to none, and the branch name is shown.
- What a real git leaves behind when it is killed at the 3 second limit in the middle of a write is not tested. With a slow fake git: no process and no lock file left.
- The group names in the bar ("Spec", "Checks", "Drift") show only in a wide window.
- 6 of 16 pin handles have no title, on code file and inferred nodes. Seen by the lane 11 verifier, not checked on the commit before that lane.

- In the editor panel, while the page has the focus, VS Code's own shortcuts (Ctrl+P, Ctrl+Shift+P, Ctrl+B) do not fire, and Esc does not give the focus back. A click on the code, a tab or the explorer does. The page's own keys work. Seen by the lane 16 verifier.
- In the editor panel the page stays dark when the editor is light. The theme is not passed in yet.
- Nothing on the page names the open folder or says that it is live.
- The live server picks a new port each run, and the page remembers "legend closed" per address. So the legend very likely opens again on every start. Reasoned, not yet seen by running it twice. A stable address per workspace would fix it.
- The panel's messages for a missing `node` and for a server that exits early are proven by unit tests only. The missing page case is proven end to end.
- Unfolding one concept lays out the whole graph again, so the other concepts move and part of the graph leaves the view. The unfolded concept's header stays put. F fits again.
- Unfolding the largest concept of this repo (16 proposals) takes 1.0 to 1.2 s: about 0.5 s of layout, the rest is drawing. A layout cache was tried and did not help.
- At 480 px wide this repo's graph fits but its text is too small to read, and the code files lie outside the first view. A narrow panel needs levels of detail (ADR 0031, step 7) or a layout that stacks.
- On a first visit in a wide window the legend lies over the right edge of the graph until it is closed.
- The third block of `e2e-wires` (40 proposals in one concept) has no wire coming into that concept, so its "0 crossings" proves little. The repo block with the real report is the real proof.
- The code block lies below the spec block and outside the first view, on the example too. A row of an open intent leads there, nothing else on the first view says it exists. Seen by the walk and by the lane 13 verifier.
- Proposals do not open to show the code they cite. Lane 15 is where that belongs.
- In a browser tab a click on a code row selects the code node, and the side panel of the intent closes without a word.
- The frames in the lane 13 folder were taken before its fix round. Frames of the merged state are still to take.

