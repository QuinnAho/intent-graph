---
description: Audit uncommitted changes via self-report plus independent Codex review.
allowed-tools: [Bash(git:*), Read, Glob, Grep, SlashCommand(/codex)]
argument-hint: "[--max-lines N]"
---

`/qa` is a per-commit gate that audits uncommitted work in two passes: Claude self-reports what it believes it changed and why, then `/codex` independently audits those claims against the actual diff. The point is to catch the failure mode where Claude *thinks* it followed the project's discipline but didn't, by handing the audit to an agent that has no stake in the answer.

Design rationale: [`docs/adr/0013-qa-self-audit-pattern.md`](../../docs/adr/0013-qa-self-audit-pattern.md). Composes [`/codex`](./codex.md) per ADR-0008.

This command is **explicit-only** in interactive use. The Ralph autonomous loop invokes the parallel shell entrypoint at [`automation/qa.sh`](../../automation/qa.sh) automatically after every successful verify+monitor pass; that's the per-task safety net. There is no auto-invoke from context matching.

## Inputs

- `$ARGUMENTS` — optional. Recognized flags:
  - `--max-lines N` — override the diff-size cutoff (default **1000**). The cutoff exists because audits become unreliable at scale; raising it without splitting the work first is itself an audit-worthy decision.
  - No positional arguments. The diff under audit is always `git diff HEAD` plus `git status` (staged + untracked).

## Refuse the run when

Stop and report back without invoking `/codex` if any of these is true:

1. **The working tree is clean.** Run `git status --porcelain`. If empty, say "nothing to audit — working tree is clean against HEAD" and stop. The audit is per-commit; a clean tree means there is nothing for it to verify.
2. **The diff is over the line threshold (default 1000 lines).** Compute `git diff HEAD --stat | awk '{n+=$3+$4} END{print n+0}'` (rough: sum of `additions+deletions` from numstat). If `> $MAX_LINES`, refuse with: "diff is N lines (threshold M). Split into smaller commits and audit each. Override with `/qa --max-lines <N>` if you have a specific reason — but the larger the diff, the less reliable the audit." Larger than the threshold means the work should have been committed in smaller chunks; the audit becomes a rubber stamp at scale.
3. **`/codex` is unavailable.** Run `codex --version` (or the npm shim). If it errors, refuse with "codex CLI not on PATH; install with `npm i -g @openai/codex`." The audit *is* the second pass; refusing to invoke `/codex` after the self-report is a bug, not an option.
4. **The repository is not a git repo or HEAD is unset.** `git rev-parse HEAD` must succeed. If not, refuse.

When refusing, write nothing to `automation/qa-reports/`. The report only exists when both passes ran.

## Pass 1 — Claude's self-report

Run **read-only** git introspection to gather the diff. Do not modify any file at any point in pass 1.

1. **Capture the diff.**
   ```bash
   git diff HEAD                        # all tracked changes since last commit
   git status --porcelain               # staged + untracked summary
   git diff HEAD --numstat              # for line-count math
   git ls-files --others --exclude-standard   # untracked files (cat them too if textual)
   ```

2. **Produce a structured self-report.** Format below. Do not skip fields. When uncertain, say so explicitly — write "I think I followed rule X" or "unclear whether rule X applies", not "I followed rule X". Calibration matters more than confidence.

   ```markdown
   ## Self-report (Pass 1, Claude)

   ### Summary
   <one paragraph: what Claude believes was done and why. Plain language, no jargon.>

   ### Files touched
   | File | Change kind | One-sentence purpose |
   |------|-------------|----------------------|
   | <path> | M / A / D / R | <why this file changed> |
   | ...    | ... | ... |

   ### Hard-rule compliance claims

   For each project hard rule from CLAUDE.md, state explicitly: *applies / does not apply / unsure*, then *believed compliant / believed non-compliant / uncertain*, with a one-line reason.

   - **AgentRunner-only model calls.** Applies? <yes/no/unsure>. Compliant? <yes/no/uncertain>. Reason: <...>
   - **No JSON-as-storage.** Applies? <...>. Compliant? <...>. Reason: <...>
   - **TypeScript strict.** Applies? <...>. Compliant? <...>. Reason: <...>
   - **Do-not-lift list (ClaudeMap contracts/handlers/cache/enrichment/JSON-storage).** Applies? <...>. Compliant? <...>. Reason: <...>
   - **No second graph model.** Applies? <...>. Compliant? <...>. Reason: <...>
   - **Specs under `/spec/` are contracts (frontmatter required).** Applies? <...>. Compliant? <...>. Reason: <...>
   - **Architectural decisions are ADRs.** Applies? <...>. Compliant? <...>. Reason: <...> (If applies=yes, list which ADR records the decision.)
   - **Never train against monitor signal.** Applies? <...>. Compliant? <...>. Reason: <...>

   ### Decisions made that may need an ADR
   <Bullet list. For each decision: what was decided, why, whether Claude believes it is load-bearing, and whether an ADR currently records it. If unsure whether something is load-bearing, list it anyway and let pass 2 decide.>

   ### Uncertainty
   <Anything Claude is genuinely unsure about. Worth more than fake confidence — pass 2 picks up the slack here.>
   ```

   Write this self-report to a temporary buffer (in-memory in the session). Do **not** write it to disk yet — it goes into the report only after pass 2 completes.

## Pass 2 — Codex's independent audit

Invoke `/codex` via the `SlashCommand` tool with the structured payload below. The payload uses `/codex`'s structured-input mode (per ADR-0008's amendment in `.claude/commands/codex.md`); the `Required output format:` block tells Codex to ignore the parent template's default Findings/Answer/Open-questions shape.

The payload to pass as `$ARGUMENTS` to `/codex`:

```
You are auditing uncommitted work in a Claude Code parent session. The parent self-reported what it believes it did; your job is to independently verify those claims against the actual diff. You have no stake in the answer — that's the whole point.

Project: IntentGraph (TypeScript monorepo, pnpm). Authoritative spec: tech-spec.md.
Hard rules from CLAUDE.md: AgentRunner-only model calls; no JSON-as-storage; TypeScript strict; no lifting from claudemap/{contracts,handlers,cache layer,enrichment,json-as-storage}; no second graph model; never train against monitor signal; specs under /spec/ require YAML frontmatter; architectural decisions land as ADRs under /docs/adr/.

Pass-1 self-report from the parent session:
<<<SELF_REPORT
<paste the entire Pass 1 self-report verbatim>
SELF_REPORT

Raw diff (git diff HEAD):
<<<DIFF
<paste git diff HEAD verbatim, including untracked file contents prefixed with `+++ NEW: <path>`>
DIFF

Tech-spec sections relevant to the diff (read these from tech-spec.md before answering, do not paste the body): §<list of N section numbers and short headings the parent identified as in-scope>

Required output format:

You MUST answer three questions explicitly, in this order, with this exact structure. Do not collapse them. Do not add a preamble. Do not summarize at the end.

## 1. Self-report fidelity
Does the self-report match the diff? Catch hallucinated changes (claimed but not present), omitted changes (present but unmentioned), and mischaracterized changes (described inaccurately). Output: a bullet list of discrepancies with file:line citations from the diff. If none, write "No discrepancies."

## 2. Hard-rule compliance
For each hard rule the parent claimed to follow (or claimed did not apply), independently verify against the diff. Output: a bullet list per rule. For each, state your verdict (compliant / non-compliant / not applicable / cannot determine from diff alone) with a one-sentence reason and file:line citations. Disagree with the parent explicitly when warranted.

## 3. Unrecorded architectural decisions
Are there decisions visible in the diff that should have been ADRs but aren't? A decision is load-bearing if it constrains future code, foundationally shapes a contract, introduces a new dependency, or changes the substrate. Output: a bullet list. For each: what was decided, why it's load-bearing, and whether the parent flagged it for ADR review.

## Findings table (severity-ranked)

After the three sections above, emit a severity-ranked table of findings:

| ID | Severity | Area | Finding | File:line |
|----|----------|------|---------|-----------|
| F-NN | blocker / major / minor / nit | <area> | <one sentence> | <path:line or N/A> |

Severity definitions (use them strictly):
- **blocker**: hard-rule violation that must be fixed before commit. AgentRunner bypass, JSON-as-storage primary path, lifted forbidden file, missing ADR for an architectural decision that's already shipped, training against monitor signal.
- **major**: real misbehavior or doc rot that will cause problems in normal use within one or two phases. Disagreement with the self-report on a load-bearing claim. Decisions that should be ADRs but aren't (and the diff is the de-facto record).
- **minor**: correct today but will mislead the first contributor or ages poorly.
- **nit**: cosmetic, style, or pure documentation polish.

After the table, emit one final line:
COUNT_BLOCKER=<n> COUNT_MAJOR=<n> COUNT_MINOR=<n> COUNT_NIT=<n>

This counts line is parsed by automation/qa.sh; keep the format exact.
```

Codex will return its full audit as a quoted block in the parent session. Do not paraphrase. Do not silently filter. The full block goes into the report verbatim.

## Pass 3 — Combined report

Only after Codex returns: write the report to `automation/qa-reports/qa-report-<UTC-ISO-8601-with-Z>.md`. Filename example: `qa-report-2026-04-27T012345Z.md`. Create the directory if it does not exist.

Report shape:

```markdown
# QA report — <UTC timestamp>

**Branch:** <git branch --show-current>
**HEAD:** <git rev-parse --short HEAD> — <subject of HEAD commit>
**Diff size:** <N> lines across <M> files
**Threshold:** <MAX_LINES> (default 1000; override flag if any)

---

## Pass 1 — Claude self-report

<verbatim copy of the Pass 1 self-report>

---

## Pass 2 — Codex independent audit

> [codex]:
>
> <verbatim copy of Codex's full reply, including the three sections, the
> findings table, and the COUNT_* line>

---

## Pass 3 — Claude's response to Codex's findings

For each Codex finding, Claude either **accepts** it (commits to fixing) or **pushes back** with specific evidence. Vibes are not pushback. Pushback must cite the diff or the spec.

| ID | Codex finding | Claude action | Reason |
|----|---------------|---------------|--------|
| F-01 | <one-line summary> | accept-fix / push-back | <one-sentence rationale; cite file:line or spec §> |
| ...  | ... | ... | ... |

**Action plan for accepted findings.** <Numbered list of concrete fixes Claude commits to. Each item names file path(s) and the kind of change.>

**Disagreements.** <If any push-back, list each with the specific evidence Claude relied on. The human reads this and breaks ties.>

---

## Outcome (auto-derived from Pass 2 COUNT line)

- Blockers: <n>
- Majors: <n>
- Minors: <n>
- Nits: <n>

**Recommended action for the human:**
- If blockers > 0: do not commit. Fix blockers, re-run `/qa`.
- If majors > 0: pause for human review before committing.
- If only minors/nits: commit is safe; address minors/nits in the same commit if quick.

The Ralph autonomous loop applies the same severity → action mapping mechanically (see `automation/qa.sh` and ADR-0013).
```

Echo the path to the new report at the end of the session output: `QA report written to automation/qa-reports/qa-report-<ts>.md. <n> blockers, <n> majors, <n> minors, <n> nits. Read it before committing.`

## Hard rules

These are enforced by reading this file before invocation.

- **Honest uncertainty in Pass 1.** "I think I did X" beats "I did X" every time when Claude is not certain. Pass 2 catches what Pass 1 admits to being unsure about; lying in Pass 1 makes Pass 2's job harder, not easier.
- **Refusing to invoke `/codex` after the self-report is a bug.** The audit is the entire point. If `/codex` is unavailable, refuse the whole `/qa` run up front — do not write a self-report-only file and pretend it's an audit.
- **Codex's findings are authoritative for compliance questions.** Claude pushes back only with specific evidence (a diff line, a spec section, a previously-accepted ADR). "I disagree" without evidence is not pushback; it is goodwill compliance with an extra step. The audit's whole design depends on Codex having the final word on whether the rules were followed.
- **Read-only by design.** `/qa` writes to exactly one path: `automation/qa-reports/qa-report-<ts>.md`. It does not auto-fix, does not auto-commit, does not modify any source file, does not modify settings, does not modify ADRs. The output is the report. The human reads the report and decides what to do next.
- **Severity definitions are the contract.** Do not relabel a blocker as a major to make Pass 3 easier. Do not relabel a minor as a major to look thorough. The Ralph loop uses these labels to decide whether to halt or commit; mislabeling poisons the autonomous gate.
- **Do not chain `/qa` invocations inside one user turn.** One audit per turn. If the report raises follow-ups, the human runs `/qa` again after fixing.
- **No smoke test on setup.** The first real `/qa` run is human-initiated against actual uncommitted work. Do not run it speculatively to "make sure the wiring works" — that pollutes `automation/qa-reports/` with synthetic reports and trains everyone to ignore the directory.

## What this command is not

- **It is not a substitute for the project-wide QA pass** (the kind that produced `docs/qa/qa-report-001.md`). That pass audits *committed* state across the whole repo at a phase boundary. `/qa` is a per-commit gate against uncommitted work. Both should exist; neither replaces the other.
- **It is not a code reviewer.** It only audits compliance with project hard rules and architectural-decision discipline. Style, naming, and "is this idiomatic" are out of scope; that's what the human review is for.
- **It is not a test runner.** The verification gate (`/intentgraph-verify` or `automation/verify.sh`) runs typecheck/lint/test; `/qa` runs *after* that gate, on the assumption that those already pass.

## Future replacement

When IntentGraph's own monitor LLM ships in Phase 4 with the AgentRunner trace store wired in (per ADR-0004 / ADR-0005), the trace-event-level monitor may subsume `/qa`'s role for autonomous runs. ADR-0013 records the deferred decision: revisit whether `/qa` should be replaced or supplemented at that point. Until then, `/qa` is the per-commit faithfulness check the architecture's substrate cannot yet provide.
