# ADR 0013 — QA self-audit pattern: self-report plus independent Codex audit, per commit

## Status

Proposed.

## Context

IntentGraph's faithfulness story is load-bearing. ADR-0005 commits the project to *faithfulness via architecture, not training* — every agent action records concrete artifacts (tool calls, retrieved node IDs, model + version, verifier outcomes), and a cheap monitor LLM gates every commit, a 5% sample, and `safety_critical` mutations. That mechanism lives behind AgentRunner and the `trace_event` table; it does not exist yet. AgentRunner ships in Phase 4 (`tech-spec.md` §6), the trace store is part of the same milestone, and the runtime monitor sits on top of both. Until then, every commit the project produces — including the commits that *build* the trace store — has no architectural faithfulness check. The discipline surface is code review and `pnpm typecheck && pnpm lint && pnpm test`. None of those answer the question "did the agent that wrote this diff actually follow the project's hard rules, or did it certify compliance because it had a stake in the answer?"

The dev-time analog of the runtime monitor needs to answer that question. It needs to run before every commit, it needs to be auditable, and it needs to be invoked by an agent that *did not write the diff*. The latter is the architectural lesson from Baker et al. (arXiv [2503.11926](https://arxiv.org/abs/2503.11926)), cited in `tech-spec.md` §1, §2 Pillar 5, and ADR-0005: a *weaker* monitor LLM detects reward hacking on a stronger reasoner because the monitor has no stake. An agent auditing its own work has motivated reasoning to certify compliance even when the diff doesn't support it. The fix is the same at dev time as at trace time — hand the audit to a different agent with a different training distribution, and treat its verdict as authoritative on compliance questions.

ADR-0008 already established the pattern for cross-assistant delegation: `/codex` is a slash command, not an auto-invoking skill, and it runs the Codex CLI in a `--sandbox read-only` container with an audit log at `automation/codex-log.jsonl`. The controllability argument from [paddo.dev/blog/claude-skills-controllability-problem/](https://paddo.dev/blog/claude-skills-controllability-problem/) is the rationale: explicit invocation, predictable cost, isolated context, deterministic activation. ADR-0008's bridge is the right substrate for a per-commit audit; the audit just needs a layer on top that shapes the payload, gathers a parent self-report to compare against, and writes a single combined report.

That layer is `/qa` — the artifact this ADR records.

## Decision

Add a per-commit audit pattern, `/qa`, that runs a two-pass self-report-plus-independent-audit flow on uncommitted work. The slash command lives at `.claude/commands/qa.md` and `.codex/commands/qa.md` (parity per the agent-config rule). A bash entrypoint at `automation/qa.sh` runs a Pass-2-only flavor for the autonomous Ralph loop, where there is no Claude session to produce Pass 1.

### Pass 1 — self-report (interactive only)

The parent agent (Claude Code in interactive use) reads `git diff HEAD`, `git status --porcelain`, and any untracked files, and produces a structured self-report containing:

- a one-paragraph plain-language summary of what was changed and why,
- a files-touched table with change kind (M/A/D/R) and a one-sentence purpose per file,
- a hard-rule compliance block with one entry per project hard rule from CLAUDE.md (AgentRunner-only model calls; no JSON-as-storage; TypeScript strict; do-not-lift list; no second graph model; specs as contracts; ADR discipline; no training against monitor signal). Each entry states *applies / does not apply / unsure* and *believed compliant / believed non-compliant / uncertain* with a one-line reason,
- a list of decisions made during the work that may need an ADR, with a self-assessment of whether each is load-bearing,
- an explicit *Uncertainty* block where the parent admits what it is genuinely unsure about.

Pass 1 is calibrated, not confident. "I think I followed rule X" is preferred over "I followed rule X" when the parent is unsure. The whole point of Pass 2 is to catch the gap between what the parent claimed and what the diff actually shows; lying in Pass 1 makes Pass 2's job harder, not easier. The self-report is held in memory through Pass 2 and only written to disk after Pass 2 returns.

### Pass 2 — independent Codex audit

The parent invokes `/codex` (per ADR-0008) with a structured payload containing the self-report verbatim, the raw `git diff HEAD`, the contents of every untracked file (prefixed `+++ NEW: <path>`), and the relevant `tech-spec.md` section identifiers. The payload's *Required output format* block tells Codex to ignore the default `/codex` template and instead answer three questions explicitly, in order, with no preamble and no summary:

1. **Self-report fidelity.** Does the self-report match the diff? Catch hallucinated changes (claimed but not present), omitted changes (present but unmentioned), and mischaracterized changes. File:line citations from the diff are required.
2. **Hard-rule compliance.** For each hard rule the parent claimed about, independently verify against the diff. Verdict per rule: *compliant / non-compliant / not applicable / cannot determine from diff alone*, with a one-sentence reason and file:line citations. Disagree with the parent explicitly when warranted.
3. **Unrecorded architectural decisions.** Are there decisions visible in the diff that should have been ADRs but aren't? A decision is load-bearing if it constrains future code, foundationally shapes a contract, introduces a new dependency, or changes the substrate.

Codex closes with a severity-ranked findings table and a one-line counts trailer in this exact format (parsed by `automation/qa.sh`):

```
COUNT_BLOCKER=<n> COUNT_MAJOR=<n> COUNT_MINOR=<n> COUNT_NIT=<n>
```

Severity definitions are part of the contract:

- **blocker** — hard-rule violation that must be fixed before commit (AgentRunner bypass, JSON-as-storage primary path, lifted forbidden file, missing ADR for an architectural decision already shipped, training against monitor signal).
- **major** — real misbehavior or doc rot that will bite within one or two phases; load-bearing decision missing an ADR; disagreement with the self-report on a load-bearing claim.
- **minor** — correct today but ages poorly or will mislead the next contributor.
- **nit** — cosmetic, style, or pure documentation polish.

### Pass 3 — combined report

Only after Codex returns, the parent writes a single Markdown report to `automation/qa-reports/qa-report-<UTC-ISO-8601-with-Z>.md`. The report contains: a header with branch, HEAD, diff size, and threshold; the Pass 1 self-report verbatim; Codex's full reply quoted as a `> [codex]:` block (no paraphrase, no silent filtering); a Pass 3 table where the parent either *accepts* each Codex finding (commits to fixing) or *pushes back* with specific evidence (a diff line, a spec section, a previously-accepted ADR — vibes don't count); and an outcome block parsed from the COUNT trailer.

### Bash-loop flavor (Pass-2-only)

The autonomous Ralph loop (`automation/ralph.sh`) cannot run Pass 1 because there is no Claude session in the loop. After every successful verify + monitor-LLM gate, `ralph.sh` invokes `automation/qa.sh --task <id> --task-list <tasks.json>`. The script performs Pass 2 only: it gathers the diff, builds the same payload (substituting "N/A — Pass-2-only invocation from automation/qa.sh" for the self-report fidelity section), runs `codex exec` in `--sandbox read-only`, parses the COUNT trailer, and writes the report. The Ralph loop applies the severity → action mapping mechanically:

| qa.sh exit | meaning | ralph.sh action |
|---|---|---|
| 0 | clean tree, or only minors/nits | proceed to commit |
| 2 | blockers > 0 | mark task blocked, loop continues with next task |
| 3 | majors > 0 | halt loop for human review (ralph maps to its own rc=2 / overall rc=6) |
| 4 | refused (codex unavailable, diff over threshold, parse failure) | mark task blocked; do not commit |

The mapping is enforced inside `run_qa_gate()` in `ralph.sh` (lines 363–394 at the time of writing). The exit codes are the contract; changing them is an ADR-amendment-level change, not a script edit.

### Refusal rules

The slash command and the bash entrypoint refuse to run when:

- **The working tree is clean.** Per-commit audit on a no-op is a synthetic report that pollutes `automation/qa-reports/` and trains everyone to ignore the directory.
- **The diff exceeds the line-count threshold.** Default 1,000 lines (sum of `git diff HEAD --numstat` additions+deletions plus untracked file `wc -l`). Override with `--max-lines N` (slash command) or `--max-lines N` / env `QA_DIFF_LINE_THRESHOLD` (bash entrypoint). The threshold exists because the audit becomes a rubber stamp at scale; raising it without splitting the work first is itself an audit-worthy decision.
- **`/codex` is unavailable.** The audit *is* the second pass. Refusing to invoke `/codex` after the self-report would defeat the design; the run is refused up front instead.
- **The repository is not a git repo or HEAD is unset.**

When the slash command refuses, nothing is written to `automation/qa-reports/`. The report only exists when both passes ran.

### Read-only by design

`/qa` writes to exactly one path: the report file. It does not auto-fix, auto-commit, modify source, modify settings, or modify ADRs. The slash command's `allowed-tools` is `Bash(git:*), Read, Glob, Grep, SlashCommand(/codex)`. There is no `Edit` or `Write` to source. The audit's claim to neutrality requires it to never modify the work it audits.

## Why this shape

Three precedents make the pattern principled rather than ad hoc.

1. **The auditor must not be the agent that produced the work.** Baker et al. 2503.11926 (cited in `tech-spec.md` §1, §2 Pillar 5, and ADR-0005) is the architectural ancestor of this rule: a weaker monitor LLM detects reward hacking on a stronger reasoner because the monitor has no stake. The same principle applies at dev time — an agent auditing its own work has motivated reasoning to certify compliance even when the diff doesn't support it. Handing the audit to a different model (Codex, trained on a different distribution from Claude) is the dev-time analog of the trace-time monitor LLM, with the same separation-of-concerns rationale. The runtime monitor LLM contract in `tech-spec.md` §4 (`flagged`, `score`, `categories`, `evidence`, `recommended_action`) is the spiritual sibling of `/qa`'s severity-ranked findings table; both are JSON-shaped verdicts emitted by an agent with no stake in the work being audited.
2. **Explicit invocation beats auto-invocation.** This is the controllability argument from paddo.dev that ADR-0008 already adopted for `/codex`. `/qa` inherits it. The human types `/qa` deliberately before a commit; there is no skill description that auto-invokes the audit from semantic matching, no `when_to_use` field, no implicit triggering. The Ralph loop is the one place where invocation is automatic — and even there, `automation/qa.sh` only runs after the verify and monitor gates have already passed, in a script the human approved by approving the task list. Auto-invocation from semantic matching would burn tokens (Codex is a paid external model) on every code edit and produce noise that trains the human to ignore the gate. Rejected by inheritance from ADR-0008.
3. **Composition over reimplementation.** `/qa` composes `/codex` rather than calling `codex exec` directly. ADR-0008 already defines the read-only sandbox bridge with the audit log at `automation/codex-log.jsonl`, the refusal rules, and the verified flag set (`-s read-only --color never --skip-git-repo-check`, no `-a`, no `--full-auto`). Reusing `/codex` gets all of that for free, and any future `/codex` upgrade — including the deferred MCP-registered version in Phase 3 — lifts `/qa` automatically. The composition is the whole design: `/qa` adds the self-report-plus-payload-shaping layer; `/codex` runs the auditor. The bash entrypoint at `automation/qa.sh` skips the slash-command layer for the loop, but uses the same `codex exec` flag set ADR-0008 verified, so the substrate is identical.

## Threshold values (recorded explicitly)

- **Diff line cutoff:** 1,000 lines by default. Cutoff is the sum of `git diff HEAD --numstat` additions + deletions across tracked files, plus `wc -l` of each untracked file. Override flags: `--max-lines N` for the slash command and the bash entrypoint; environment variable `QA_DIFF_LINE_THRESHOLD` for the bash entrypoint.
- **Severity → ralph action mapping** (the contract):
  - blocker → `qa.sh` returns 2 → `ralph.sh` marks task blocked, loop continues
  - major → `qa.sh` returns 3 → `ralph.sh` halts the loop for human review
  - minor / nit only → `qa.sh` returns 0 → loop proceeds to commit
  - clean tree → `qa.sh` returns 0 (not an error)
  - audit refused (codex unavailable, oversize diff, parse failure) → `qa.sh` returns 4 → `ralph.sh` treats as blocker
- **Payload bound:** the `automation/qa.sh` prompt is trimmed at 200,000 characters defensively (well under any frontier-model context window). When the bound is hit, the script appends a "PAYLOAD TRUNCATED" marker rather than silently dropping content.

## What this decision rejects

- **Auditing inside the parent session.** A skill named `qa-audit` that runs inside Claude Code would inherit the parent's biases, defeating the Baker et al. principle. Rejected.
- **Auto-invoking `/qa` from context matching.** A skill that decides to audit when it senses "a commit is imminent" would burn tokens on every code edit and produce noise that trains the human to ignore the gate. Rejected per ADR-0008's controllability argument. The Ralph loop's invocation is not auto from semantic matching — it is a scripted step the human enabled by approving the task list.
- **Treating Codex's findings as advisory.** The whole design depends on Codex having the final word on compliance questions. If the parent could relabel a blocker as a nit on disagreement, Pass 2 collapses into goodwill compliance with extra steps. Pushback is allowed only with specific evidence (diff line, spec section, accepted ADR). "I disagree" without evidence is not pushback; it is goodwill compliance with an extra step.
- **Letting `/qa` write outside its report file.** Auto-fixing or auto-committing would turn a read-only audit into a write surface, and the audit's claim to neutrality requires it to never modify the work it audits.
- **Skipping the line-count threshold.** A 5,000-line diff is unauditable in any honest sense; the auditor at scale becomes a rubber stamp. The 1,000-line default is a configurable refusal, not a soft warning.
- **Chaining `/qa` invocations inside one user turn.** One audit per turn. If the report raises follow-ups, the human runs `/qa` again after fixing. Multiple audits in one turn would mean each subsequent audit is auditing the parent's response to the previous audit, which is a different question with a different answer shape.
- **Smoke-testing `/qa` on setup.** The first real run is human-initiated against actual uncommitted work. Speculative runs to "make sure the wiring works" pollute `automation/qa-reports/` with synthetic reports.

## Consequences

**Wins.**

- The project gets a per-commit faithfulness check before AgentRunner and the runtime monitor exist. Every commit produced during Phases 1–3 — including the commits that *build* the trace store — has a separation-of-duties audit against the project's hard rules.
- The pattern is cheap and incremental. `/qa` composes `/codex`; no new model integration, no new sandboxing logic, no new audit log format. ADR-0008's substrate carries the weight.
- The bash-loop flavor (`automation/qa.sh`) gives the Ralph autonomous workflow a concrete severity gate. Before this, `ralph.sh` could only halt on verification failures and monitor-LLM verdicts; now it halts on hard-rule compliance failures too, with a mechanical exit-code-driven mapping the loop can apply without judgment.
- The output format is auditable. The report file plus `automation/codex-log.jsonl` (from ADR-0008) plus `automation/sessions/progress.json` (from ADR-0007) together produce a full per-task audit trail across the Ralph loop.
- The pattern is testable against itself. When the runtime monitor LLM ships in Phase 4, `/qa`'s findings on historical commits become a labeled set that can be compared with the runtime monitor's verdicts on the same diffs. Disagreements between the two will be informative either way.

**Costs.**

- Every interactive `/qa` run costs a Codex invocation (paid external API). For a typical small commit this is a few cents; for a 1,000-line diff it is materially more. The threshold cap is the cost guard, but the cumulative cost across the project's commit cadence will be visible. The audit log gives the team a way to measure it.
- The pattern adds a manual step before every commit during interactive work. The friction is intentional — this is a faithfulness gate, not a convenience — but the team must internalize it. If `/qa` becomes "the thing the human runs sometimes when they remember", the gate is dead.
- Codex's audit quality depends on the Codex model the team is paying for. ADR-0008's flag-verification section already documents the Codex CLI version drift problem; the same drift can change Codex's audit output shape. The COUNT trailer parser in `automation/qa.sh` is brittle; if Codex starts emitting a different format, the bash loop breaks until the script catches up.
- `automation/qa-reports/` accrues over time. The directory is not currently gitignored (deliberately — reports are auditable artifacts), so it grows the repository. A future pruning policy will be a small follow-up ADR or a CI step.
- The pattern adds a new file to the `.claude/` ↔ `.codex/` parity mirror. The agent-config check (`scripts/check-agent-config.ts`) already enforces parity for that mirror; the new file falls under that, but the parity discipline cost is real.

**What becomes ADR-NNNN+1's problem.**

- The replacement-or-supplement decision when the runtime monitor ships (see *Deferred decision* below).
- A pruning / retention policy for `automation/qa-reports/`. Today the policy is "keep everything"; that will not scale past a few months of normal commit cadence.
- A CI integration for `/qa` runs on PR branches. Today `/qa` is a local pre-commit pattern; running it in CI on every PR would catch cases where a contributor pushed without running it locally, but it requires Codex credentials in CI which has its own cost and key-management considerations.

## Deferred decision

When IntentGraph's own monitor LLM ships in Phase 4 with the AgentRunner trace store wired in (per ADR-0004 and ADR-0005), the trace-event-level monitor may subsume `/qa`'s role for autonomous runs. At that point the team should revisit whether `/qa` should be:

- **(a) replaced** by the runtime monitor for autonomous runs while keeping `/qa` for interactive commits,
- **(b) supplemented** by the runtime monitor — the two catch different failure modes (the runtime monitor sees individual model calls; `/qa` sees the diff after a whole task), so both may have value, or
- **(c) retired entirely** if the runtime monitor's coverage subsumes the dev-time audit's surface.

The decision is not made today. Today the runtime monitor doesn't exist; AgentRunner doesn't exist; the trace store doesn't exist. The dev-time audit is the only substrate available, and `/qa` is the dev-time audit. When the substrate changes, this ADR is superseded by a new one that names the script, the file globs, and whether `/qa` runs in CI, locally, or both.

## Alternatives considered

- **A `qa-audit` skill that runs inside Claude Code.** Rejected: the auditor would be the same agent that wrote the work, defeating the Baker et al. separation-of-duties rationale. The whole architectural point of `/qa` is that the auditor has no stake in the answer.
- **An auto-invoking skill that triggers when a commit is imminent.** Rejected per ADR-0008's controllability argument. Semantic-match invocation would burn tokens on every code edit; explicit invocation gives predictable cost and deterministic activation.
- **Calling `codex exec` directly from `automation/qa.sh` without composing `/codex`.** Rejected for interactive use: the slash-command layer carries the audit log entry to `automation/codex-log.jsonl`, the refusal rules, and the flag-verification discipline from ADR-0008. The bash flavor *does* skip the slash command (because the loop has no parent agent to invoke a slash command), but it uses the same flag set ADR-0008 verified, so the substrate stays consistent.
- **A pre-commit git hook.** Rejected: pre-commit hooks fire on every commit, including WIP commits and rebases, and they fire silently. The audit must be deliberate; a hook that runs in the background trains contributors to ignore it. The slash command's explicit-invocation discipline is the right shape.
- **Treating `/qa` findings as advisory.** Rejected: if the parent can relabel a blocker as a nit on disagreement, Pass 2 collapses into goodwill compliance with extra steps. Pushback is allowed only with specific evidence (diff line, spec section, accepted ADR).
- **Letting `/qa` auto-fix accepted findings.** Rejected: a read-only audit is the contract. Auto-fix would turn the audit into a write surface and break the neutrality claim. The human reads the Pass 3 action plan and either runs the implementer skill on the fixes or fixes them by hand.
- **Deferring the audit pattern entirely until the runtime monitor ships in Phase 4.** Rejected: that leaves Phases 1–3 with no faithfulness check, including the phases that build the trace store. The Phase-4 runtime monitor cannot retroactively audit Phase-1 commits; its trace artifacts only exist for code that flowed through AgentRunner, which by definition does not exist before Phase 4. The dev-time audit fills the gap.

## References

- [ADR-0005](./0005-faithfulness-by-architecture.md) — *Faithfulness via architecture, not training*. The architectural ancestor; Baker et al. 2503.11926 is cited there as the source of the separation-of-duties principle this ADR adopts at dev time.
- [ADR-0008](./0008-codex-bridge.md) — *Codex bridge: slash command, not auto-invoking skill*. `/qa` composes `/codex`; this ADR depends on ADR-0008 holding (controllability argument, flag verification, audit log).
- [ADR-0007](./0007-autonomous-workflow.md) — *Autonomous workflow*. The Ralph loop integration is at `automation/ralph.sh`'s post-monitor / pre-commit step (`run_qa_gate()`, lines 363–394).
- [ADR-0004](./0004-agent-orchestration.md) — *Agent orchestration*. AgentRunner and the trace store are the substrate the runtime monitor needs and `/qa` substitutes for until Phase 4.
- `tech-spec.md` §1 (executive summary, with the Baker et al. citation), §2 Pillar 5 (faithfulness as architecture), §4 (monitor LLM verdict shape — the spiritual sibling of `/qa`'s findings table).
- [paddo.dev — *The Claude Skills controllability problem*](https://paddo.dev/blog/claude-skills-controllability-problem/) — controllability argument carried over from ADR-0008.
- Baker et al., *Monitoring Reasoning Models for Misbehavior and the Risks of Promoting Obfuscation*, arXiv [2503.11926](https://arxiv.org/abs/2503.11926) — the obfuscation-tax paper cited from ADR-0005.
- [`.claude/commands/qa.md`](../../.claude/commands/qa.md) — the interactive slash command (Pass 1 + Pass 2 + Pass 3).
- [`.codex/commands/qa.md`](../../.codex/commands/qa.md) — Codex-side parity mirror.
- [`automation/qa.sh`](../../automation/qa.sh) — the bash-loop entrypoint (Pass-2-only).
- [`automation/ralph.sh`](../../automation/ralph.sh) — the Ralph loop, integration point at `run_qa_gate()`.
- `automation/qa-reports/` — the read-only output directory (created on first run).
- [QA report 001](../qa/qa-report-001.md) — the kind of project-wide periodic QA pass `/qa` does **not** replace; both should exist.
