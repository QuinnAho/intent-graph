---
type: research
updated: 2026-11-27
by: two research agents (sonnet), brief and synthesis by the orchestrator
---
# How to run an orchestrator with builder agents: practice as of 2026-11-27

Tags: [O] = the agent opened the page. [S] = search snippet only.

## Rules with their sources

1. **Verify with a fresh-context verifier** that gets the spec and the running app, not the builder's history or tests. In arXiv 2610.28667 (2026-10-16) it caught more of 46 seeded faults than the builder's own tests (p=0.006) [O]. Also Anthropic's harness design post (2026-03-24) [O] and the Stack Overflow blog (2026-11-13) [O].
2. **Re-run checks from a script**, not by asking an agent, and log each check's command, exit code and pass line. arXiv 2611.05094 (2026-11-03): the orchestrator "runs and judges its own checks", 11 of 247 block checks showed undeclared changes and only 4 stopped the run [O].
3. **Builders touch only the files named in the brief.** Check the diff and the file inventory for undeclared changes and fail the merge on any (2611.05094) [O].
4. **Builders must not edit or delete tests or the acceptance list** (Anthropic long-running harness, 2025-11-26) [O].
5. **Treat "done" as a claim.** Agents declare completion without evidence and overfit visible tests. Hold back some checks (AgentSWE, arXiv 2610.13361, 2026-10-09) [O].
6. **Write the acceptance checks before the builder starts.** Agents with their own tests scored 65.3% against 66.2% without, and only 9.6% of AI-written unit tests were useful checks (secondhand figures, via the Stack Overflow post) [O].
7. **Verify end to end like a user**, with scripted browser and screenshot runs. Unit tests and curl missed bugs (Anthropic harness) [O].
8. **One feature per builder session.** Write a progress file, a descriptive commit and a push at the end of each task (Anthropic harness) [O].
9. **Keep test output short**, with detail in log files and an error tag that grep can find (Anthropic C compiler post, 2026-02-05) [O].
10. **Cap spend.** Headless runs have `--max-budget-usd` and `--max-turns` (Claude Code CLI reference) [O].
11. **Give builders explicit effort limits, task boundaries and an output format.** Vague briefs caused duplicated work (Anthropic multi-agent research system, 2025-06-13) [O].
12. **Agents die.** One ran `pkill -9 bash`. Resume from state files, not memory (C compiler post) [O].

## Parallelism

Small numbers. Anthropic's research lead used 3 to 5 subagents but says coding is a poor fit because the work is tightly coupled [O]. Cognition says parallel writers make conflicting decisions and defaults to single-threaded [O]. The 16-agent compiler run worked only with locks, independent tasks, an oracle and CI, and still had frequent merge conflicts [O].

Use 2 to 3 builders on tasks that touch different files, and merge one at a time. Multi-agent runs cost about 15x the tokens of a chat (research system post) [O].

## Verification

Best evidence: an independent fresh-context verifier plus deterministic checks. A different model provider did not help in 2610.28667, so there is no need to mix providers. Tune the verifier to be sceptical, since model judges run lenient (Anthropic harness design) [O]. Leave the release decision to the human.

## What to log per agent

Agent id, parent id, task, model, effort, start and end, duration, tokens (input, output, cache), cost, tool calls and failures, commit, files changed against files declared, check command, exit code, pass line, verdict, and who judged.

Claude Code can emit most of this through OpenTelemetry: set `CLAUDE_CODE_ENABLE_TELEMETRY=1` plus an exporter. Metrics `claude_code.cost.usage` and `claude_code.token.usage`, events `api_request` and `tool_result`, with agent ids [O].

## Claude Code facts that matter here (docs read 2026-11-27, version 2.1.332)

- **Background subagent permission prompts are not auto-denied.** They surface in the main session. With nobody there, the run stalls. An unattended run needs every action pre-allowed or decided by auto mode.
- Auto mode pauses and prompts after 3 consecutive or 20 total blocks.
- A session runs at most 20 subagents at once. Nesting depth is 3.
- Background subagents keep running through compaction. Path-scoped rules and hook-added context do not survive it.
- A `SubagentStop` or `Stop` hook that exits 2 stops an agent from finishing. A hook can hold a builder until a command passes.
- Subagent transcripts are kept at `~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl` for 30 days.
- `claude -p --output-format json` reports `total_cost_usd`. `--max-budget-usd` caps a headless run.
- Agent teams are experimental and interactive only. The docs say unattended teams risk wasted effort.
- Workflow scripts run up to 16 agents at once and can be resumed in the same session.
- `/loop` fires only while the session is open and idle.

## Failure modes and the guard for each

| Failure | Guard |
|---|---|
| Runaway cost | few builders, cheap models for routine work, one task per session |
| Stuck loop | a time box in every brief, and "stop after two failed tries" |
| Context exhaustion | one task per builder, state on disk, a handoff note instead of a long session |
| False green | rules 1 to 7 |
| Merge conflicts | lanes on different files, merge one at a time, gate again after each merge |
| Permission stall | stay inside the approved scope and skip anything outside it |
| Agent death | commit and push after each step |

## Sources

- https://arxiv.org/abs/2611.05094 (2026-11-03)
- https://arxiv.org/abs/2610.28667 (2026-10-16)
- https://arxiv.org/abs/2610.13361 (2026-10-09)
- https://stackoverflow.blog/2026/11/13/your-coding-agent-shouldn-t-grade-its-own-homework/ (2026-11-13)
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (2025-11-26)
- https://www.anthropic.com/engineering/harness-design-long-running-apps (2026-03-24)
- https://www.anthropic.com/engineering/building-c-compiler (2026-02-05)
- https://www.anthropic.com/engineering/multi-agent-research-system (2025-06-13)
- https://cognition.com/blog/dont-build-multi-agents (2025-06-12)
- https://code.claude.com/docs/en/sub-agents , /hooks , /workflows , /monitoring-usage , /permission-modes , /headless

## Not verified

- The figure that 75.8% of failures were false success reports (snippet only).
- The weakness named in 2611.05094 rests on the authors' own nine runs, and the full text was not read.
- The Stack Overflow post's numbers come from a vendor.
- Windows limits of worktree isolation, and the exact fields of a subagent's completion report.
