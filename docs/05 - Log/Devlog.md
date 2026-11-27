# Devlog

A few lines per milestone: what happened, why it matters, the evidence. Newest at the bottom. Read the tail, not the whole file.

### 2026-11-27, about 4 AM  Back after six months, direction reset

**What happened.** Quinn reopened the project after six months. Three research agents checked what changed since May. Quinn chose to slim the project to its wedge and keep it visual first, drop Codex, and remove the old Ralph loop (ADR 0029).

**Why it matters.** The May plan was sized for a team. Half of it is now provided by Claude Code or open source. The part nobody ships is small: obligations tied to real checks, and drift judged at the level of intent.

**Evidence.** Baseline on quinns-pc at commit `568d5d3`: install, typecheck and lint pass, 90 tests pass in 11 files, and `pnpm build` fails in `packages/skill` with TS5074. The state before the overhaul is tagged `pre-overhaul-2026-11-27`. Research notes are in `docs/03 - Research/`.
