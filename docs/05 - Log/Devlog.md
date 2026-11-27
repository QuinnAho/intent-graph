# Devlog

A few lines per milestone: what happened, why it matters, the evidence. Newest at the bottom. Read the tail, not the whole file.

### 2026-11-27, about 4 AM  Back after six months, direction reset

**What happened.** The owner reopened the project after six months. Three research agents checked what changed since May. The owner chose to slim the project to its wedge and keep it visual first, drop Codex, and remove the old Ralph loop (ADR 0029).

**Why it matters.** The May plan was sized for a team. Half of it is now provided by Claude Code or open source. The part nobody ships is small: obligations tied to real checks, and drift judged at the level of intent.

**Evidence.** Baseline on the dev PC at commit `568d5d3`: install, typecheck and lint pass, 90 tests pass in 11 files, and `pnpm build` fails in `packages/skill` with TS5074. The state before the overhaul is tagged `pre-overhaul-2026-11-27`. Research notes are in `docs/03 - Research/`.

### 2026-11-27, about 5:30 AM  Overhaul merged to night-1, gate green

**What happened.** Three lanes merged to the integration branch `night-1`: the docs moved into a numbered vault (76 files moved, 49 deleted), Codex and the old Ralph loop are gone, the build is fixed, and the repo has one gate (`tools/verify.mjs`) and a frames script (`tools/frames.mjs`). CLAUDE.md went from about 18 KB to 2.3 KB.

**Why it matters.** Every later lane is judged by one script instead of by an agent's word. The first merge already showed why: the gate failed on lint because the main checkout was linting the lane worktrees, and the build check had a false red for `agent-skill`. Both are fixed and the second was proven with a deliberate failure.

**Evidence.** On `night-1` at `795e4b2`: `PASS all (56.3s) - 4 steps, 91 tests`. Frames: 83 nodes rendered. `check:agent-config` OK. Token use: overhaul 203k (opus), harness 81k (sonnet), six research passes 508k (sonnet). Run log: `.runs/night-1/log.jsonl`.

### 2026-11-27, about 6:20 AM  Live graph with status merged to night-1

**What happened.** Lane 1 landed: a live server (`packages/skill/src/live/`) rebuilds the graph when a spec or source file changes and pushes it to the page, spec nodes show verified, failed or pending from the tests named in `verified_by`, and the first view now shows the spec (concepts holding their intents) instead of 750 code symbols. A broken spec file shows as a problem on the page instead of vanishing.

**Why it matters.** This is the first time the graph is alive and says something true about the code: which intents have passing tests behind them. It is also the base for editing on the canvas.

**Evidence.** On `night-1` at `28ace4e`: `PASS all (46.3s) - 4 steps, 148 tests`, and `PASS e2e-live` three runs of three (label 338 to 348 ms, failed mark about 1.6 s, clean stop). An independent verifier passed 13 of 14 checks and found one fault the builder's tests missed (a file with broken YAML was dropped silently). The builder fixed it and the orchestrator's own probe confirmed the fix. Reuse: codegraph 1.6.4 was measured (1,067 nodes and 1,963 edges in 5.0 s against our 750 and 587 in 4.5 s) and not adopted. No new dependency. Tokens: builder 227k plus 254k for the retry (opus), verifier 80k (sonnet).

**See it.** `node tools/e2e-live.mjs --serve`, then open the printed address. Frames: `.runs/night-1/frames/`.

**Not yet.** Edges are drawn through node labels. The anchor format (ADR 0030) is only used on a fixture until the owner accepts it.

### 2026-11-27, about 6:25 AM  Drift check prototype merged to night-1

**What happened.** Lane 2 landed: a normalised syntax hash for a file or symbol (`packages/skill/src/drift/`), linking from a commit's changes to the spec nodes bound to them, and a cheap judge (haiku through the `claude` CLI, no tools, a budget cap, isolated from the user's own settings) that says aligned, drift or unclear with a quote from the diff. `node tools/drift.mjs` runs it.

**Why it matters.** This is the part nobody ships. The question was whether a cheap model can tell a change that breaks an intent from one that does not, and on seeded cases the answer is yes: 9 of 9 on the builder's cases and 8 of 8 on cases a verifier wrote and the builder never saw, including one-character breaks and a comment that lied. A whole run costs under a cent.

**Evidence.** On `night-1` at `c6a323f`: `PASS all (44.3s) - 4 steps, 207 tests` and `PASS drift (39.2s) - caught 4 of 4 breaking, missed 0, wrongly flagged 0 of 5 harmless, 7 judged pairs, $0.0031`. Verdicts were the same across three runs. On 13 real commits (21 pairs, against anchors the builder proposed): 1 drift, 7 unclear, $0.0236. The one drift looks real: an intent promises a version on every node and edge, and the edge table has none.

**What the verifier caught.** Four faults the builder's own tests had passed: a source file over 32 KB crashed the whole run, a binding to code that did not exist was dropped silently, the judge was reading the user's global CLAUDE.md, and hash-decided rows had empty fields. All fixed, then re-checked by a second verifier.

**Not yet.** A third of real commits come back "unclear", mostly because large diffs are cut. No real breaking commit exists in our history, so catching is proven on seeded cases only. Nothing is shown on the graph yet.

**See it.** `node tools/drift.mjs`. Tokens: builder 232k plus 288k for the retry (opus), verifiers 99k and 61k (sonnet).

### 2026-11-27, 7:13 AM  Visual editing merged to night-1, three more lanes have a go

**What happened.** Lane 3 landed on `night-1`: select a spec node, edit its title and body in a side panel, save, and the markdown file changes with every other byte kept. A new intent can be created inside a concept. Writes need `--write`, a token and 127.0.0.1. Before going offline the owner gave a go on three more lanes (edge routing, drift on the graph, editing polish), allowed green and verified visual lanes to merge into `night-1` while `main` waits for a look, and set a direction: node-based views move toward the way the Unreal Blueprint editor works (ADR 0031).

**Why it matters.** Editing on the canvas is the visual-first half of ADR 0029. The Blueprint direction gives every later graph lane one model to follow instead of ad hoc choices.

**Evidence.** On `night-1` at `43e08cf`: `PASS all (52.2s) - 4 steps, 249 tests`, `PASS e2e-live (68.8s) - label 386 ms, failed mark 3048 ms, clean stop` (slow because a research agent ran at the same time, 34 s when alone), `PASS e2e-edit (39.5s) - label 406 ms, new node 874 ms, 6 frames`. An independent verifier passed 13 of 13 checks the builder never saw: a byte-exact save on a file with comments, odd key order, a block value and Windows line endings, path traversal refused, token and origin checks, a conflict that kept the outside edit, and one listener on 127.0.0.1. Frames: `docs/05 - Log/Frames/2026-11-27 Night 1/`, files `3a` to `3g`.

**Also landed.** A source file over 32 KB now parses (`af14da0`). The test was written first and failed with "Invalid argument", then 210 tests passed, and a 40 KB probe file went from 0 nodes and a warning to 630 nodes. The notes now say "the owner" because the remote is public (`7587ef7`). Everything pushed on 2026-11-27 was scanned first: no secret patterns in 18,127 added lines, and no local paths.

**Calls taken in loop.** The owner can overrule any of these.
- The orchestrator fixed the 32 KB limit itself, three lines and a test, instead of dispatching an agent. That bends the rule that the orchestrator writes no product code.
- First failures in lanes 1 and 2 went back to the same builder, though both were past 150k tokens of context. Each retry wrote the whole transcript to the cache again. From now on a fix goes to a fresh, smaller agent.
- New intents will take their `target_kinds` from the form, with one preselected (lane 6).
- Lane 4 is step one of ADR 0031 only. One pin per relation kind and editing by wire wait until the owner has seen step one.
- Effort is scaled to the lane: lane 4 on the strongest allowed model at high effort, lanes 5 and 6, the research and every verifier one tier down at medium.

**Not yet.** The selected node is not highlighted, the panel covers the right edge of the canvas, and a new intent shows as a problem until it has target kinds. All three are in lane 6.

### 2026-11-27, 7:55 AM  Blueprint wires and pins merged to night-1

**What happened.** Lane 4, step one of ADR 0031: every node has an input pin on the left and an output pin on the right, one wire component draws smooth curves between pins, the layout runs left to right, and wires that leave a box now take part in the layout. A wire whose other end is in the other block is replaced by a count on the pin ("1 code"). Nodes have a header strip tinted by kind.

**Why it matters.** Wires through labels were the first thing the eye landed on. The graph now reads constraint to intent, left to right, with nothing drawn over text.

**Evidence.** On `night-1` at `34e9f0d`: `PASS all (42.5s) - 4 steps, 263 tests`, `PASS e2e-wires (31.9s) - fixture 0 crossing 0 loose, repo 0 crossing on 0/4 wires 0 loose 1587 ms`, `PASS e2e-live`, `PASS e2e-edit`. Measured before the lane with the same script: 105 crossing samples and 32 loose ends on this repo, 9 of 16 wires through a box, 6% running left to right. An independent verifier wrote its own measurement and passed 14 of 14: 0 crossings and 0 loose ends in six views, including views with 48 wires where code nodes are on screen, wires stay on their pins when a node is dragged, and the page loads about 1.1 times slower (1,990 ms against 1,790 ms, medians of ten). Frames: `docs/05 - Log/Frames/2026-11-27 Night 1/`, files `4a` to `4e`, beside `1a` to `1e` from before.

**Calls taken in loop.**
- The builder's call: a node's edge to the box that holds it is no longer drawn, because the nesting already shows it.
- Opening a count on a pin was left out. This repo has no edge between a spec node and code yet (12 intent to concept, 4 constraint to intent, 1,078 symbol to module), so there is nothing to open until real spec files have anchors.

**Not yet.** Two constraint wires cross each other, since one pin per node gives the layout nothing to order them by. On this repo only 4 wires are drawn at first view. The code block sits below the spec block and is reached by panning or a `focus` link.

### 2026-11-27, 8:17 AM  Drift on the graph merged to night-1

**What happened.** Lane 5: the live server reads the newest drift report (`<workspace>/.runs/drift/latest.json`) and puts each node's verdict beside its test status: drift, unclear or aligned, each with an icon and a word. A verdict turns stale, dimmed and dashed, when a file the node is bound to changes after the report was written. The side panel shows the verdict, the commit, the evidence and the suggested action. The server never calls a model. It only reads the file that `node tools/drift.mjs` wrote.

**Why it matters.** The two things this project builds, checks tied to real tests and an intent-level drift check, now meet on one node: a node can be verified by its tests and still be marked as drift.

**Evidence.** On `night-1` at `246867c`: `PASS all (44.3s) - 4 steps, 285 tests`, `PASS e2e-drift-marks (21.5s) - marks 388 ms, change 325 ms, stale 436 ms, no model process`, and `e2e-live`, `e2e-edit` and `e2e-wires` pass. `PASS drift - caught 4 of 4 breaking, wrongly flagged 0 of 5 harmless` on the lane head. An independent verifier wrote its own reports and passed 13 of 14 checks: the worst verdict wins, a report outside `.runs/drift` is refused and never read, a broken report is one problem and no marks, an 8 MB report with 20,000 entries left `/graph.json` answering in under 80 ms, markup in the evidence is shown as text, and the list of model processes on the PC was the same before and after. Frames: `docs/05 - Log/Frames/2026-11-27 Night 1/`, files `5a` to `5c`.

**Calls taken in loop.**
- The one failed check was scope: four node files outside the declared list. Each got one line that passes the mark through. The list in the lane note was too narrow, so the work was accepted as it is.
- This lane ran one model tier down at medium effort. It took 10 minutes and passed its gate and its verifier on the first try.

**Not yet.** With two marks in the header a title is cut after about 14 characters (lane 6). This repo's own nodes show no drift mark, because no real spec file has anchors. The report is found by a 400 ms poll.

### 2026-11-27, 8:53 AM  Editing polish merged to night-1, and the loop ended

**What happened.** Lane 6: the view moves so the selected node stays clear of the open panel, read only shows text instead of dimmed inputs, a title of up to 40 characters is shown in full on one or two lines, the new-intent form asks for target kinds so a new intent is no longer listed as a problem, the problems list sits in a strip under the canvas, Cmd+S saves as well as Ctrl+S, and `open-graph.cmd` and `open-graph-edit.cmd` open the graph of this repo with a double-click. With that every lane that had a go is merged, and the loop stopped.

**Why it matters.** The first cut of editing was judged from frames and its rough edges were listed. This lane closed that list before anyone had to ask twice.

**Evidence.** On `night-1` at `69313c4`: `PASS all (44.8s) - 4 steps, 304 tests`, `PASS e2e-edit (32.9s) - label 389 ms, new node 879 ms`, `PASS e2e-live`, `PASS e2e-wires - fixture 0 crossing 0 loose, repo 0 crossing on 0/4 wires 0 loose`, `PASS e2e-drift-marks - marks 450 ms, change 256 ms, stale 378 ms, no model process`, and `node tools/play.mjs --no-open` served the page and stopped on a `stop` line. An independent verifier passed 16 of 17 checks: one selected node at a time, the node clear of the panel at two window sizes, six bad `target_kinds` requests refused with 422 and nothing written, a byte-exact save on a file with comments and Windows line endings, no inputs and a 403 in read only, a 132 character path readable in full, and two launchers at once on two ports. Frames: `docs/05 - Log/Frames/2026-11-27 Night 1/`, files `6a` to `6i`, with a verdict for each in the README there.

**Calls taken in loop.**
- The failed check was scope again: the create endpoint lives in `packages/skill/src/live/edit-api.ts`, and the lane note named `server.ts`. Eight lines, disclosed by the builder, accepted.
- One old check in `tools/e2e-edit.mjs` was replaced: "fields are disabled in read only" became "no input exists". The lane note asks for exactly that.
- The builder moved the problems list under the canvas instead of floating it.
- Lanes 5 and 6 ran one model tier down at medium effort. Both passed the gate and the verifier's behaviour checks on the first try.

**Not yet.** The form offers the nine node kinds from the code schema, while this repo's intents use `module` and `api` (Board, call 3). The "Add intent" button can be cut off at the top edge after the view moves. Nobody has double-clicked the launcher files yet.

**The day in numbers.** 91 tests when the overhaul merged, 304 now. Six feature lanes, each gated by script and then checked by a verifier that never saw the builder's report. The verifiers found five real faults that had passed the builders' own tests, all in lanes 1 and 2, all fixed. `main` did not move.
