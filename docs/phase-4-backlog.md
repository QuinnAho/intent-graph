# Phase 4 design backlog

Lightweight notes captured outside an ADR. These are not decisions — they are
items to weigh during Phase 4 design (drift + AgentRunner + monitor → L2). Each
entry should either become an ADR (or amendment), get folded into an existing
ADR, or be explicitly dropped, by the time Phase 4 design closes.

## Audit-of-Codex invariant

A periodic test that introduces a known violation (e.g. a deliberate
JSON-as-storage path or an `ai` import outside `packages/skill/src/agent-runner/`)
and verifies that `/qa` — i.e. the Codex audit pass per ADR-0013 — actually
flags it as a blocker.

The point: ADR-0013 makes the Codex audit the load-bearing per-commit
faithfulness check until the runtime monitor ships. We have no test that the
audit still works after a Codex CLI version bump, prompt drift, or a model
change on Codex's side. Without this invariant test, a regression in Codex's
detection ability would be invisible until the next time a real violation
slipped through.

Open questions to resolve in Phase 4 design:

- Does the test live in `automation/qa-tests/` or in CI?
- Cadence: every PR, every nightly Ralph session, or weekly?
- How many fixture violations to maintain (one per hard rule from CLAUDE.md, or
  a smaller representative set)?
- What is the failure mode when the invariant fails — page a human, or fall
  back to a more conservative gate (e.g. block all autonomous commits until
  the audit is re-validated)?

## Per-task soft cost cap

Today `ralph.sh` enforces a per-session cap (default $100, hard cap $200) and a
per-task max iteration count (default 15) but no per-task dollar cap. A single
runaway task can burn most of the session budget before the iteration ceiling
trips.

Proposal to weigh: add a per-task soft cost cap, default $5, configurable per
task in `tasks.json` (`max_task_cost_usd`). On hit, mark the task blocked and
proceed with the next task instead of aborting the whole session.

Open questions to resolve in Phase 4 design:

- Where does the per-task cost number come from? Anthropic console / Vercel AI
  Gateway report cost per request, but the loop currently has no cost
  attribution per iteration. Need a small instrumentation pass first.
- Does the soft cap interact with the three-failure abort (counts as a
  failure? counts as a skip?)? Whichever, it must be unambiguous.
- Should the cap be raisable from inside `tasks.json` without an ADR? Probably
  yes up to some ceiling (e.g. $20), no above it — mirrors the session cap's
  structure.

## Monitor LLM version pinning

`automation/monitor-llm.sh` calls Groq's Llama 3.3 70B. The model identifier is
not pinned; Groq has historically rolled minor versions transparently. ADR-0005
makes the monitor a load-bearing component of the faithfulness story, and a
silent model bump changes the verdict distribution under us.

Proposal to weigh: pin the exact Groq model version (and its provider build
identifier when available) in `monitor-llm.sh`. Treat any bump as an
ADR-amendment event to ADR-0005, requiring a re-eval of the monitor against
whatever benchmark cascade Phase 4 design lands on (TRACE / AutoMonitor-Bench
are candidates — see the broader research notes from 2026-04-27).

Open questions to resolve in Phase 4 design:

- Is the pin just a string in the script, or does it live in an
  `automation/monitor-config.json` for easier audit?
- How is a bump detected? Cron job that diffs `groq.com/docs/models` against
  the pinned id? Subscribed-changelog poll?
- What is the eval cadence after a bump — re-run the full benchmark, or a
  smaller smoke set with a delta threshold? (Full re-run is safer; smoke is
  cheaper.)

---

## Status

All three are **backlog notes**, not implementation work. No ADRs yet, no
script changes yet. Revisit at Phase 4 design entry.
