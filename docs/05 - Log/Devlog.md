# Devlog

A few lines per milestone: what happened, why it matters, the evidence. Newest at the bottom. Read the tail, not the whole file.

### 2026-11-27, about 4 AM  Back after six months, direction reset

**What happened.** Quinn reopened the project after six months. Three research agents checked what changed since May. Quinn chose to slim the project to its wedge and keep it visual first, drop Codex, and remove the old Ralph loop (ADR 0029).

**Why it matters.** The May plan was sized for a team. Half of it is now provided by Claude Code or open source. The part nobody ships is small: obligations tied to real checks, and drift judged at the level of intent.

**Evidence.** Baseline on quinns-pc at commit `568d5d3`: install, typecheck and lint pass, 90 tests pass in 11 files, and `pnpm build` fails in `packages/skill` with TS5074. The state before the overhaul is tagged `pre-overhaul-2026-11-27`. Research notes are in `docs/03 - Research/`.

### 2026-11-27, about 5:30 AM  Overhaul merged to night-1, gate green

**What happened.** Three lanes merged to the integration branch `night-1`: the docs moved into a numbered vault (76 files moved, 49 deleted), Codex and the old Ralph loop are gone, the build is fixed, and the repo has one gate (`tools/verify.mjs`) and a frames script (`tools/frames.mjs`). CLAUDE.md went from about 18 KB to 2.3 KB.

**Why it matters.** Every later lane is judged by one script instead of by an agent's word. The first merge already showed why: the gate failed on lint because the main checkout was linting the lane worktrees, and the build check had a false red for `agent-skill`. Both are fixed and the second was proven with a deliberate failure.

**Evidence.** On `night-1` at `795e4b2`: `PASS all (56.3s) - 4 steps, 91 tests`. Frames: 83 nodes rendered. `check:agent-config` OK. Token use: overhaul 203k (opus), harness 81k (sonnet), six research passes 508k (sonnet). Run log: `.runs/night-1/log.jsonl`.

### 2026-11-27, about 6:20 AM  Live graph with status merged to night-1

**What happened.** Lane 1 landed: a live server (`packages/skill/src/live/`) rebuilds the graph when a spec or source file changes and pushes it to the page, spec nodes show verified, failed or pending from the tests named in `verified_by`, and the first view now shows the spec (concepts holding their intents) instead of 750 code symbols. A broken spec file shows as a problem on the page instead of vanishing.

**Why it matters.** This is the first time the graph is alive and says something true about the code: which intents have passing tests behind them. It is also the base for editing on the canvas.

**Evidence.** On `night-1` at `28ace4e`: `PASS all (46.3s) - 4 steps, 148 tests`, and `PASS e2e-live` three runs of three (label 338 to 348 ms, failed mark about 1.6 s, clean stop). An independent verifier passed 13 of 14 checks and found one fault the builder's tests missed (a file with broken YAML was dropped silently). The builder fixed it and the orchestrator's own probe confirmed the fix. Reuse: codegraph 1.6.4 was measured (1,067 nodes and 1,963 edges in 5.0 s against our 750 and 587 in 4.5 s) and not adopted. No new dependency. Tokens: builder 227k plus 254k for the retry (opus), verifier 80k (sonnet).

**See it.** `node tools/e2e-live.mjs --serve`, then open the printed address. Frames: `.runs/night-1/frames/`.

**Not yet.** Edges are drawn through node labels. The anchor format (ADR 0030) is only used on a fixture until Quinn accepts it.
