---
updated: 2026-11-27
---
# How We Work

One orchestrator session plans, briefs, gates and merges. Fresh builder agents do the work, one task each, each in its own worktree. Quinn says go on each lane and judges anything visual.

The rules come from Quinn's brain (the `orchestrate`, `dispatch` and `prove` skills) and from the loop research of 2026-11-27 in [[2026-11-27 Orchestration Practice]].

## A lane, start to finish

1. Quinn says go.
2. The orchestrator writes the lane note in `docs/05 - Log/Lane Notes/<lane>.md`:
   - Quinn's ask, quoted
   - the branch and worktree
   - what already exists, with file paths
   - the scope as numbered steps
   - **the files the builder may touch**
   - the acceptance checks
   - the reuse check: which open source was looked at, and adopt, borrow or skip for each
   - what is not in this lane, and a stop clause
3. Acceptance checks are written before the builder starts. Some are held back for the verifier.
4. The builder works only in `.wt/<lane>`, commits small green steps, pushes its branch, and reports in under 150 words.
5. The gate is run by script, never by asking an agent:
   - `node tools/verify.mjs all` on the committed head
   - the scope check: changed files are inside the declared list, and no test was deleted
   - `node tools/frames.mjs` when the lane changes what is seen
   - the command, exit code and pass line go in the run log
6. A verifier agent that did not build it gets the lane note, the held-back checks and the running app. It does not get the builder's report. It is told to be sceptical, and it returns pass or fail per check with evidence.
7. A first failure goes back to the same builder once. A second failure parks the lane for Quinn.
8. Lanes merge to the integration branch one at a time, and the gate runs again on the integration branch after each merge.
9. The Board and the Devlog are updated in the same turn. Quinn gets frames and a command to see the result.
10. `main` moves only with Quinn's OK.

## Standing rules

- **Two or three builders at once at most**, and only on lanes that touch different files. Parallel writers on shared files make conflicting choices.
- **Reuse before writing.** Quinn: "use the best things of open source stuff rather than rewrite from scratch, we can cherry pick". A new dependency is named in the report with its license and why it was needed.
- **Builders never edit the acceptance checks and never delete or weaken a test.**
- **"Done" is a claim** until the gate and the verifier agree. Agents report success without evidence often enough that the claim alone is worth nothing.
- **One task per builder.** A builder that runs out of context mid-feature loses the work, so it commits and pushes after each step.
- **Models**: opus at high effort for product code, sonnet at medium for scripts, research, writing and verifying, haiku at low to run a command. Never above Opus 5.5.
- **Stay inside the approved scope.** Unattended agents may run git, pnpm, node and file edits inside this repo. No force-push, no push to `main`, no publishing, no deleting outside the repo, no settings changes. A permission prompt at night stalls everything, so anything outside the scope is skipped and reported instead.
- **An agent never changes a spec by itself.** It proposes, and a human confirms.
- **Never stop a process you did not start.** Each lane uses its own port.

## The run log

Every agent run and every gate run adds one line to `.runs/<run>/log.jsonl` (machine-local, not in git):

lane, role, model, effort, start, duration, tokens, tool uses, commit, files changed, check command, exit code, pass line, verdict, who judged.

A summary of each run goes in the [[Devlog]], with frames under `docs/05 - Log/Frames/`. Frames in git are JPEG, 1280 wide, quality 82.

## What the old loop was

Until 2026-05 this repo ran a bash "Ralph" loop with a Codex audit and a Groq monitor. It was removed on 2026-11-27 (ADR 0029). The state before removal is tagged `pre-overhaul-2026-11-27`.
