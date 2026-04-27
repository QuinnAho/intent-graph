---
description: Audit uncommitted changes via self-report plus independent Codex review.
argument-hint: "[--max-lines N]"
---

> Mirrored from `.claude/commands/qa.md` for parity across the dual-assistant story. The full design and procedure live there; this file documents the surface so a human reading the Codex config sees the same discipline.

`/qa` is a per-commit gate that audits uncommitted work in two passes: the parent agent self-reports what it believes it changed and why, then a second agent independently audits those claims against the actual diff. The auditor must not be the agent that produced the work — that's the principle from Baker et al. 2503.11926 (a weaker monitor detects reward hacking on a stronger reasoner) and the controllability argument from https://paddo.dev/blog/claude-skills-controllability-problem/. Design rationale: [`docs/adr/0013-qa-self-audit-pattern.md`](../../docs/adr/0013-qa-self-audit-pattern.md).

In the Claude-Code-driven workflow that is the primary use case, the parent is Claude Code and the auditor is invoked via `/codex` (which wraps `codex exec --sandbox read-only`). Composition flow: Claude self-reports → Claude calls `/codex` with the structured payload → Codex audits → Claude writes the combined report. See `.claude/commands/qa.md` for the canonical body.

In the Codex-driven workflow this command is informational. Codex invoking `/qa` would call Codex under itself, which defeats the design's "auditor has no stake in the answer" principle. If you want the audit from inside a Codex session, the right move is to commit the work and then run `/qa` from a fresh Claude Code session against the prior HEAD. Or use the bash entrypoint `automation/qa.sh` (which performs the Pass-2-only Codex audit without a parent self-report) — that's how the Ralph loop integrates it.

## Inputs and refusal rules

Identical to `.claude/commands/qa.md` § Inputs and § "Refuse the run when". Default diff threshold: **1000 lines**. Override with `--max-lines N`. Refuse on clean tree, missing codex CLI, or unset HEAD.

## Output

Single file at `automation/qa-reports/qa-report-<UTC-ISO-8601-with-Z>.md`. Read-only against the rest of the tree. No auto-fix, no auto-commit. Severity → action mapping:

- **blocker** → do not commit; fix and re-run.
- **major** → pause for human review.
- **minor / nit** → commit is safe; address inline if quick.

## Hard rules

See `.claude/commands/qa.md` § Hard rules. Both files share the same rules verbatim:

- Honest uncertainty in Pass 1.
- Refusing to invoke the auditor after the self-report is a bug.
- Auditor's findings are authoritative on compliance questions; pushback requires evidence.
- Read-only — writes only to its own report file.
- Severity definitions are the contract; do not relabel.
- One audit per user turn.
- No setup smoke test.

## Ralph integration

The Ralph autonomous loop calls `bash automation/qa.sh` after every successful `verify.sh` + `monitor-llm.sh` pass. That entrypoint is the Pass-2-only flavor (Codex audits the diff against project rules without a parent self-report; there is no Claude in the bash loop to produce one). It writes to the same `automation/qa-reports/` directory. See [`automation/ralph.sh`](../../automation/ralph.sh) and [`automation/qa.sh`](../../automation/qa.sh).
