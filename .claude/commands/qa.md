---
description: Audit uncommitted changes via self-report plus independent Codex review.
allowed-tools: [Bash(git:*), Bash(bash automation/qa-exec-codex.sh:*), Read, Glob, Grep]
---

`/qa` is a per-commit gate that audits uncommitted work in two passes: Claude self-reports what it believes it changed, then Codex independently audits those claims against the actual diff. The point is to catch the failure mode where Claude *thinks* it followed the project's discipline but didn't, by handing the audit to an agent that has no stake in the answer.

Design rationale: [`docs/adr/0013-qa-self-audit-pattern.md`](../../docs/adr/0013-qa-self-audit-pattern.md). Pass 2 shells out to `codex exec` directly via [`automation/qa-exec-codex.sh`](../../automation/qa-exec-codex.sh) per [ADR-0014](../../docs/adr/0014-qa-pass-2-shells-out-to-codex-exec-directly.md), which partially supersedes ADR-0013's "composes /codex" clause. The substrate ADR-0008 verified (read-only sandbox, exact flag set, audit log) is shared via `automation/qa-lib.sh`, not via the slash-command layer. Prompt template lives at [`automation/qa-prompt.template.md`](../../automation/qa-prompt.template.md) — both this command and `automation/qa.sh` use the same canonical text; do not embed a copy here.

This command is **explicit-only**. The Ralph autonomous loop uses the bash entrypoint at [`automation/qa.sh`](../../automation/qa.sh) instead. There is no auto-invoke from context matching.

## Refuse the run when

Stop and report back without invoking `/codex` if any of these is true:

1. **The working tree is clean.** `git status --porcelain` empty. Say "nothing to audit — working tree is clean against HEAD" and stop.
2. **The diff is over 1000 lines.** Sum of additions+deletions across tracked files plus `wc -l` of each untracked file. If over the threshold, refuse with: "diff is N lines (threshold 1000). Split into smaller commits and audit each. The audit becomes a rubber stamp at scale." If you genuinely need to audit a larger diff, invoke the bash entrypoint directly: `bash automation/qa.sh --max-lines <N>`. The interactive command does not accept the override — that's by design.
3. **`/codex` is unavailable.** Run `codex --version` (or the npm shim). If it errors, refuse with "codex CLI not on PATH; install with `npm i -g @openai/codex`."
4. **Not a git repo or HEAD unset.** `git rev-parse HEAD` must succeed.

When refusing, write nothing to `automation/qa-reports/`. The report only exists when both passes ran.

## Pass 1 — Claude's self-report

Capture the diff (read-only):

```bash
git diff HEAD
git status --porcelain
git diff HEAD --numstat
git ls-files --others --exclude-standard
```

Then produce a self-report. **Verbosity scales with diff size** — full discipline for medium diffs, terse for trivial ones, extra honesty for large ones.

### Tier A — diff ≤50 lines (terse)

```markdown
## Self-report (Pass 1, Claude)

### Summary
<one short paragraph: what changed and why>

### Files touched
| File | Change kind | One-sentence purpose |
|------|-------------|----------------------|
| <path> | M / A / D / R | <why> |

### Hard-rule applicability
<one bullet list of the project hard rules that *do* apply to this diff. If none, write "None apply (e.g. docs-only change with no source touched)." Skip the per-rule applies/compliant table — the diff is too small for it to be load-bearing.>

### Decisions / uncertainty
<bullet list, possibly empty. If genuinely empty, write "None.">
```

### Tier B — diff 51–500 lines (full)

The original full Pass 1 format: summary, files-touched table, **per-rule** compliance table for all eight CLAUDE.md hard rules (applies / does not apply / unsure × compliant / non-compliant / uncertain + reason), decisions-needing-ADR list, uncertainty block. When unsure, say "I think" — calibration matters more than confidence.

The eight hard rules to enumerate (one row each):
- AgentRunner-only model calls
- No JSON-as-storage
- TypeScript strict
- Do-not-lift list (ClaudeMap contracts/handlers/cache/enrichment/JSON-storage)
- No second graph model
- Specs under `/spec/` are contracts (frontmatter required)
- Architectural decisions are ADRs
- Never train against monitor signal

### Tier C — diff 501–1000 lines (full + extra honesty)

Tier B's full format plus an explicit prefix: "I cannot promise calibration on a diff this size. Treat my self-report as best-effort and lean harder on Pass 2." Pass 2 picks up the slack.

Hold the self-report in memory through Pass 2. Do not write to disk yet.

## Pass 2 — Codex's independent audit

Read [`automation/qa-prompt.template.md`](../../automation/qa-prompt.template.md) — the canonical prompt body. Substitute the placeholders listed below to produce a single string. Pipe that string to `bash automation/qa-exec-codex.sh` (Bash tool). The helper resolves the codex binary, runs `codex exec` with the verified ADR-0008 flag set, logs the invocation to `automation/codex-log.jsonl`, and streams Codex's stdout back to you.

Concretely:

```bash
printf '%s' "<the substituted prompt>" | bash automation/qa-exec-codex.sh
```

The template's `Required output format:` block tells Codex to emit three structured sections plus the `COUNT_BLOCKER=... COUNT_NIT=...` trailer (parsed by `automation/qa-lib.sh:extract_qa_counts` if you need to grep it programmatically; for the report you copy the whole reply verbatim).

Placeholder substitutions:

| Placeholder | Value |
|---|---|
| `{{MODE_INTRO}}` | `You are auditing uncommitted work in a Claude Code parent session. The parent self-reported what it believes it did; your job is to independently verify those claims against the actual diff. You have no stake in the answer — that's the whole point.` |
| `{{TASK_CTX_BLOCK}}` | empty string (interactive `/qa` is not invoked from a Ralph task; `qa.sh` fills this for the loop) |
| `{{BRANCH}}` | `git branch --show-current` |
| `{{HEAD_SHORT}}` | `git rev-parse --short HEAD` |
| `{{HEAD_SUBJ}}` | `git log -1 --format='%s'` |
| `{{DIFF_LINES}}` | the computed diff size from the refusal check |
| `{{SELF_REPORT_BLOCK}}` | `Pass-1 self-report from the parent session:\n<<<SELF_REPORT\n<the verbatim Pass 1 you just produced>\nSELF_REPORT\n` |
| `{{DIFF_RAW}}` | `git diff HEAD` output |
| `{{UNTRACKED_BLOCK}}` | for each untracked file, `\n+++ NEW: <path>\n<contents prefixed with '+ '>\n` |
| `{{STATUS_RAW}}` | `git status --porcelain` |
| `{{SECTION_1_INSTRUCTIONS}}` | `Does the self-report match the diff? Catch hallucinated changes (claimed but not present), omitted changes (present but unmentioned), and mischaracterized changes (described inaccurately). Output: a bullet list of discrepancies with file:line citations from the diff. If none, write "No discrepancies."` |

`qa-exec-codex.sh` exits non-zero if codex fails or the binary is missing; the helper writes a stderr message in either case. If exit is non-zero, refuse to write a report — the audit is the second pass; a missing or broken second pass means no report.

Codex returns its full audit on stdout. Do not paraphrase, do not silently filter. The full reply goes into the Pass-3 report verbatim.

## Pass 3 — Combined report

After Codex returns, write the report to `automation/qa-reports/qa-report-<UTC-ISO-8601-Z>.md`. Filename example: `qa-report-2026-04-27T012345Z.md`. The directory is tracked.

Report shape:

```markdown
# QA report — <UTC timestamp>

**Branch:** <branch>
**HEAD:** <short> — <subject>
**Diff size:** <N> lines across <M> files
**Threshold:** 1000

---

## Pass 1 — Claude self-report
<verbatim, including the tier label A/B/C>

---

## Pass 2 — Codex independent audit
> [codex]:
>
> <verbatim, including the three sections, the findings table, and the COUNT_* line>

---

## Pass 3 — Claude's response to Codex's findings

| ID | Codex finding | Claude action | Reason |
|----|---------------|---------------|--------|
| F-NN | <one-line summary> | accept-fix / push-back | <rationale; cite file:line or spec §> |

**Action plan for accepted findings.** <Numbered list of concrete fixes. Each names file path(s) and change kind.>

**Disagreements.** <If any pushback, list each with the specific evidence cited. Vibes are not pushback.>

---

## Outcome (auto-derived from Pass 2 COUNT line)

- Blockers: <n>  Majors: <n>  Minors: <n>  Nits: <n>

**Recommended action for the human:**
- Blockers > 0: do not commit. Fix and re-run `/qa`.
- Majors > 0: pause for human review.
- Only minors/nits: commit is safe; address inline if quick.
```

Echo the report path at the end: `QA report written to automation/qa-reports/qa-report-<ts>.md. <n> blockers, <n> majors, <n> minors, <n> nits. Read it before committing.`

## Hard rules

- **Honest uncertainty in Pass 1.** "I think I did X" beats "I did X" when unsure. Lying in Pass 1 makes Pass 2's job harder, not easier.
- **Refusing to invoke Codex after the self-report is a bug.** The audit *is* the second pass. If `automation/qa-exec-codex.sh` exits non-zero — codex CLI missing, codex sandbox failure, anything — refuse the whole run up front. Do not write a self-report-only file and pretend it's an audit.
- **Codex's findings are authoritative for compliance questions.** Pushback requires specific evidence (a diff line, a spec section, a previously-accepted ADR). "I disagree" without evidence is goodwill compliance with an extra step.
- **Read-only by design.** `/qa` writes to exactly one path: `automation/qa-reports/qa-report-<ts>.md`. It does not auto-fix, does not auto-commit, does not modify any source file, does not modify settings, does not modify ADRs.
- **Severity definitions are the contract.** Do not relabel a blocker as a major to make Pass 3 easier. The Ralph loop uses these labels to decide whether to halt or commit; mislabeling poisons the autonomous gate.
- **One audit per user turn.** If the report raises follow-ups, the human runs `/qa` again after fixing.
- **No smoke test on setup.** The first real run is human-initiated against actual uncommitted work.
- **Do not embed a copy of the prompt here.** The template at [`automation/qa-prompt.template.md`](../../automation/qa-prompt.template.md) is the source of truth. If the prompt format needs to change, edit the template and update the bash heredoc in `automation/qa.sh` to match.

## What this command is not

- **Not a substitute for the project-wide QA pass.** That kind of pass (e.g. `docs/qa/qa-report-001.md`) audits *committed* state across the whole repo at a phase boundary. `/qa` is per-commit. Both exist; neither replaces the other.
- **Not a code reviewer.** It audits compliance with project hard rules and architectural-decision discipline. Style and "is this idiomatic" are out of scope.
- **Not a test runner.** `/intentgraph-verify` or `automation/verify.sh` runs typecheck/lint/test; `/qa` runs *after* that gate.

## Future replacement

When IntentGraph's own monitor LLM ships in Phase 4 with the AgentRunner trace store wired in (per ADR-0004 / ADR-0005), the trace-event-level monitor may subsume `/qa`'s role for autonomous runs. ADR-0013 records the deferred decision.
