---
description: Audit uncommitted changes via self-report plus independent Codex review.
---

> Mirrored from `.claude/commands/qa.md` for parity. The canonical body lives there; this file documents the surface so a human reading the Codex config sees the same discipline.

`/qa` is a per-commit gate that audits uncommitted work in two passes: the parent agent self-reports what it believes it changed, then a second agent independently audits those claims against the actual diff. The auditor must not be the agent that produced the work — Baker et al. 2503.11926 (the principle ADR-0005 carries over from the runtime monitor LLM) and the controllability argument from https://paddo.dev/blog/claude-skills-controllability-problem/ (per ADR-0008). Design rationale: [`docs/adr/0013-qa-self-audit-pattern.md`](../../docs/adr/0013-qa-self-audit-pattern.md). Prompt template: [`automation/qa-prompt.template.md`](../../automation/qa-prompt.template.md) (canonical text used by both surfaces).

In the Claude-Code-driven workflow that is the primary use case, the parent is Claude Code and the auditor is invoked via `bash automation/qa-exec-codex.sh` (per ADR-0014, which partially supersedes ADR-0013's "composes /codex" clause). The helper wraps `codex exec --sandbox read-only` with the verified ADR-0008 flag set and writes the audit log to `automation/codex-log.jsonl`. See `.claude/commands/qa.md` for the canonical body.

In a Codex session this command is informational. Codex invoking `/qa` would call Codex under itself, which defeats the design's "auditor has no stake in the answer" principle. The right move from a Codex session: commit the work and run `/qa` from a fresh Claude Code session against the prior HEAD, OR — for the autonomous loop — use the bash entrypoint at [`automation/qa.sh`](../../automation/qa.sh) which performs the Pass-2-only Codex audit without a parent self-report.

## Surface summary

- **Refusal rules:** clean tree; diff over 1000 lines; codex CLI missing; not a git repo. Identical to `.claude/commands/qa.md`.
- **Output:** single file at `automation/qa-reports/qa-report-<UTC-ISO-8601-Z>.md`. Read-only against the rest of the tree.
- **Severity → action mapping:**
  - blocker → do not commit; fix and re-run.
  - major → pause for human review.
  - minor / nit → commit is safe; address inline if quick.

## Hard rules

See `.claude/commands/qa.md` § Hard rules — both files share the same rules.

## Ralph integration

The Ralph autonomous loop calls `bash automation/qa.sh` after every successful `verify.sh` + `monitor-llm.sh` pass. That entrypoint is the Pass-2-only flavor (Codex audits the diff against project rules; there is no Claude in the bash loop to produce a self-report). Both surfaces share `automation/qa-prompt.template.md` as the prompt source of truth.
