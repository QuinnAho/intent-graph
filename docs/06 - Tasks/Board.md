---
updated: 2026-11-27
---
# Board

Open work only. A finished lane moves to the [[Devlog]] in the same turn. Rules: [[How We Work]].

`main` holds everything through lane 12, the first half of lane 14 and lane 16. New lanes branch from `day-2`. Green and verified lanes merge into `day-2` and then into `main`: the owner gave a standing OK for that late on 2026-11-27. Frames of anything visual still go to the owner, in the same report.

## Lanes with a go

The owner on 2026-11-27, paraphrased: editing on the graph has to be easy and intuitive, and every lane ends with polish.

The owner on 2026-11-27, in the evening, paraphrased: this should be a tool for every day. It should show the state of the project at all times, the high-level implementation behind each intent, the status of the spec, and more of what the AI is thinking. What a model inferred carries a robot icon, and the graph shows which agent is working on what. Today it is hard to tell at first sight what is what.

| Lane | What | Status |
|---|---|---|
| 13 open an intent | Its code nested inside, in place. Call 2, the recommended way unless the owner picks the other. Held-back checks are written (`.runs/night-1/held-out/nested-code.md`, not in git) | after 12 |
| 14 agents on the graph | Which lane or agent is changing which code, and which intents that touches. First read from git worktrees and the run log, with no install. Live detail from editor hooks later, and a hook needs the owner's yes | the first half (the data) is on `main`, see the [[Devlog]]. The second half, drawing it, comes after lane 13. The data holds the time of a lane's newest change only, so "since when" needs one more field |
| 15 what the AI is thinking | For a proposal: what the model was shown and why it said so. For drift: the judge's reasons. For an agent at work: its task | after 14 |

### Handoff (2026-11-28, 1:30 AM)

Done and on `main`: lane 11 (merge `c5cbcc6`), the first half of lane 14 (merge `cc08318`), lane 16 (merge `5e8a320`) with [[0032-a-thin-vs-code-extension-around-the-page]], and lane 12 (merge `da33e2b`). Nothing is in flight. No agent is running.

Next, in order:

1. Lane 13 (open an intent, and a click on code opens the file in the editor through `openInEditor` in `packages/webview/src/transport/shell-bridge.ts`). It needs a lane note and held-back checks first. Every page lane gets narrow-width checks at 900 and 480 px and is tried inside the editor panel.
2. A walk through the editor panel as a first-time user on this repo, by a fresh agent: every confusing moment, ranked, with frames. The owner picks what to fix from that list. Offered to the owner, not yet answered.
3. For the extension: the line above a bound function (needs call 3), one status bar item, the editor's theme passed into the page, a stable address per workspace so the page remembers what was closed.

Open for the owner: calls 3, 4, 8 and 9 below, and whether to prune the merged worktrees (`agents`, `glance`, `e2e-flake`, `inferred-graph`, `editor-panel`, `fold`).

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
- Code nodes in `/graph.json` carry an absolute `file://` path in `body.uri`, every module and symbol. Confirmed by the lane 14 verifier on 2026-11-27, and it is the same on `main` before that lane. The data is served on the dev machine only and is not in git, but a paste of it would show a local path. An "open in editor" link needs a path, so settle this in the lane that adds one: a path from the root, and the server knows the root.
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
