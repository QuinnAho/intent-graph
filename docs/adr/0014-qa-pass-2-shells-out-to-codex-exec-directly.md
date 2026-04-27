# ADR 0014 — Interactive /qa shells out to codex exec directly; supersede ADR-0013's composes-/codex clause

## Status

Proposed.

## Context

ADR-0013 was accepted earlier today (2026-04-27) and committed in `eb0fd07`. It established the per-commit `/qa` audit pattern: a parent self-report (Pass 1), an independent Codex audit (Pass 2), and a combined report (Pass 3). Pass 2's design committed `/qa` to *compose* `/codex` rather than calling `codex exec` directly. Two clauses in ADR-0013 carry that commitment:

- §"Why this shape" point 3 (composition-over-reimplementation): "/qa composes /codex rather than calling codex exec directly. ADR-0008 already defines the read-only sandbox bridge with the audit log at automation/codex-log.jsonl, the refusal rules, and the verified flag set [...] Reusing /codex gets all of that for free, and any future /codex upgrade — including the deferred MCP-registered version in Phase 3 — lifts /qa automatically."
- §"Pass 2 — independent Codex audit": "The parent invokes `/codex` (per ADR-0008) with a structured payload [...]"

The composition design was right architecturally — substrate reuse, free upgrades, no parallel maintenance — but tonight's first real interactive `/qa` run (commit `ae030a4`, report `qa-report-2026-04-27T061800Z.md`) showed it was wrong operationally for the harness reality. Four concrete friction points all trace back to the slash-command-of-slash-command layer:

1. **The harness's SlashCommand semantics dumped the entire `/codex` body into the parent context before invoking codex.** ADR-0008's `/codex` body is substantial (104 lines of refusal rules, flag rationale, audit-log format, hard rules). When `/qa` nests a SlashCommand call to `/codex`, the parent reads the `/codex` body verbatim before any codex work happens. `/qa`'s own body is also substantial, so the parent reads two slash-command bodies before any audit output appears. That is context the auditor's payload has to fight against.
2. **The structured-input override was fragile.** ADR-0008 was amended to add a "Structured-input mode" clause: when `$ARGUMENTS` contains a `Required output format:` block, prefer the caller's schema over the default Findings/Answer/Open-questions shape. That works in theory, but it is prose discipline embedded in markdown. If `/codex` is later re-edited and the override clause is trimmed, `/qa` silently falls back to the 200-word answer template and the COUNT trailer disappears. Tonight Codex respected the override, but the audit caught (F-02 in `qa-report-2026-04-27T061800Z`) that the parent's self-report had goodwill-compliance issues; a more brittle override behavior could have masked them entirely.
3. **The parent shelled out manually anyway.** When the SlashCommand path printed the `/codex` body without invoking codex, the parent fell back to `codex.cmd exec - < prompt-file` directly. That worked, but it bypassed the slash-command audit log, the refusal rules, and ADR-0008's substrate. The composition story ("/qa composes /codex") was the right design but did not actually compose tonight — it composed two halves manually, which is exactly what the ADR was supposed to prevent.
4. **`automation/qa.sh` already shells out directly to `codex exec` for the autonomous loop.** ADR-0013 explicitly accepts this for the bash flavor: "the bash flavor *does* skip the slash command (because the loop has no parent agent to invoke a slash command), but it uses the same codex exec flag set ADR-0008 verified, so the substrate is identical." So one of the two `/qa` surfaces already does what this ADR proposes for the other.

The substrate ADR-0008 documents (read-only sandbox, verified flag set, audit log format, refusal rules) is perfectly preservable without going through the slash-command layer — `automation/qa.sh` demonstrates that today. The slash-command layer was carrying ergonomic discipline (a typed argument-hint, a place to write hard rules, a refusal-rule bullet list), but that discipline lives in `/qa`'s own body too. It is not load-bearing for `/qa` to *also* go through `/codex`.

This ADR was authored within hours of ADR-0013's acceptance. ADRs are immutable post-acceptance, so the supersession path (a new ADR superseding the relevant clauses) is correct, and the speed of supersession is itself a real signal that the original framing was incomplete. The honest framing — recorded in the threshold section below — is that ADR-0013 was right about everything except the call site for Pass 2, and a same-day partial supersession is the cheapest way to keep the rest of ADR-0013 intact.

## Decision

For interactive `/qa` runs, replace the `/codex` SlashCommand invocation with a direct shell-out to `codex exec` via a small new bash helper at `automation/qa-exec-codex.sh`. The helper:

- Reuses `automation/qa-lib.sh:resolve_codex_binary` for the binary search (same as `automation/qa.sh`).
- Uses the exact flag set ADR-0008 verified: `-s read-only --color never --skip-git-repo-check`. No `-a`. No `--full-auto`.
- Logs the invocation to `automation/codex-log.jsonl` in the same JSONL shape `/codex` writes (timestamp, task summary, scope, exit code, duration, tokens when reported). The audit-log discipline from ADR-0008 stays consistent across both surfaces.
- Reads the prompt from stdin. Interactive `/qa` builds the prompt from `automation/qa-prompt.template.md` with placeholder substitutions, then pipes the result to `bash automation/qa-exec-codex.sh`.
- Returns Codex's stdout to the caller, plus the duration.

Pass 2 in `.claude/commands/qa.md` (and the parity mirror in `.codex/commands/qa.md`) becomes: read `automation/qa-prompt.template.md`, substitute placeholders, pipe to `bash automation/qa-exec-codex.sh`, capture stdout, then use `automation/qa-lib.sh:extract_qa_counts` to parse the COUNT trailer. There is no `SlashCommand(/codex)` tool call. The `allowed-tools` frontmatter loses `SlashCommand(/codex)` and gains `Bash(bash automation/qa-exec-codex.sh:*)`.

`/codex` itself is unchanged. It remains the right tool for free-form Codex delegation that humans drive interactively (e.g. "ask Codex what it thinks of this ADR draft"). ADR-0008's body, refusal rules, and the structured-input clause all stay in place; this ADR only changes who Pass 2 of `/qa` calls.

`automation/qa.sh` (the bash flavor for the Ralph loop) is unchanged in intent — it already shells out directly. After this ADR ships, both `/qa` surfaces use the same `automation/qa-exec-codex.sh` helper, so the substrate is shared end-to-end and the two surfaces cannot drift on flag set, sandbox, or audit-log format.

The implementation surface (the new helper, the rewritten Pass 2 section of `.claude/commands/qa.md`, the parity mirror in `.codex/commands/qa.md`, and the small refactor in `automation/qa.sh` to call the shared helper) ships in a follow-up commit after this ADR is accepted. No code lands today.

## What this ADR partially supersedes

ADR-0013 §"Why this shape" point 3 (composition-over-reimplementation) is **partially** superseded:

- **Preserved.** The "ADR-0008 substrate gets reused" intent stays — the new helper uses the exact flag set, writes to the same log file, runs in the same sandbox. The faithfulness substrate is identical; only the call path changes.
- **Withdrawn.** The "any future `/codex` upgrade lifts `/qa` automatically" claim no longer holds. `/qa` now has its own substrate file (`automation/qa-exec-codex.sh`) that has to be updated alongside `/codex` if either changes. This is a real cost and the supersession ADR owns it explicitly: when `/codex`'s flag set, sandbox mode, or audit-log shape changes, `automation/qa-exec-codex.sh` must be updated in the same commit. The agent-config check in `scripts/check-agent-config.ts` is the right place to grow a check that enforces this co-evolution; that check is a small follow-up.
- **Unaffected.** The MCP-registered Phase-3 future state (deferred in ADR-0008 and ADR-0013) is unchanged. When the runtime monitor LLM ships in Phase 4, both `/qa` surfaces will revisit their substrate; that revisit is still a follow-up ADR, not this one.

ADR-0013 §"Pass 2 — independent Codex audit" wording is amended: "The parent shells out to `codex exec` via `automation/qa-exec-codex.sh`" replaces "The parent invokes `/codex` (per ADR-0008)" for the interactive flavor.

ADR-0013 §References should reflect that `/qa` no longer composes `/codex`.

The other ten ADR-0013 decisions are untouched: the two-pass design, the auditor-must-not-be-the-producer principle, the severity-to-action mapping, the read-only-by-design discipline, the threshold values, the refusal rules, the deferred Phase-4 revisit, the rejection of pre-commit hooks, the rejection of advisory findings, and the rejection of letting `/qa` write outside its report file. All survive intact.

## Consequences

**Wins.**

- The interactive `/qa` Pass 2 stops printing the `/codex` body into the parent context. The auditor's payload no longer competes with two slash-command bodies for context space, and the failure mode that triggered tonight's manual fallback is removed.
- The structured-output contract becomes harder to break. The COUNT trailer requirement, the three-question shape, and the "no preamble, no summary" discipline all live in `automation/qa-prompt.template.md`, which is the sole prompt source of truth. There is no second markdown file (`/codex`'s body) whose edits could silently change the output shape.
- Both `/qa` surfaces (interactive and Ralph-loop) share `automation/qa-exec-codex.sh`. The substrate cannot drift between them on flag set, sandbox, or audit log. ADR-0013's "the substrate is identical" claim becomes mechanically true rather than aspirational.
- The audit log at `automation/codex-log.jsonl` stays a single file, written by both `/codex` and `automation/qa-exec-codex.sh`, with a consistent JSONL schema. The full per-task audit trail across the Ralph loop (codex log + sessions/progress.json + qa-reports/) is unchanged.

**Costs.**

- `/qa` no longer rides `/codex`'s upgrade path. When `/codex` gets re-verified against a new Codex CLI version (the drift problem ADR-0008 documents), `automation/qa-exec-codex.sh` has to be re-verified independently. The two-surface maintenance cost is real and was the whole point of ADR-0013's composition argument.
- The agent-config parity check has more surface to police. `scripts/check-agent-config.ts` already enforces parity between `.claude/commands/qa.md` and `.codex/commands/qa.md`; it now also has to ensure `automation/qa-exec-codex.sh` and `/codex`'s flag set stay aligned. That is a small follow-up but it does not write itself.
- The supersession-within-hours dynamic is a real signal worth recording. ADR-0013 was a Phase-1 architectural decision and it was incomplete on the Pass 2 call site; a same-day partial supersession means the team now has two ADRs whose intersection a reader has to reconstruct. The honest mitigation is the explicit "what this ADR partially supersedes" section above plus the README update.

**What becomes ADR-NNNN+1's problem.**

- The Phase-4 revisit when the runtime monitor LLM ships. ADR-0013's deferred decision (replace, supplement, or retire `/qa`) still stands; the only change is that the revisit will weigh `automation/qa-exec-codex.sh` against the runtime monitor's surface, not `/codex`-via-SlashCommand against the runtime monitor's surface.
- The MCP-registered Codex bridge (deferred in ADR-0008). When that ships, both `/codex` and `automation/qa-exec-codex.sh` need to revisit whether to register through MCP, and the substrate-sharing argument has to be re-evaluated against MCP's audit guarantees.
- A pruning/retention policy for `automation/qa-reports/`. Carried over unchanged from ADR-0013.

## What this ADR rejects

- **Going back to `/qa` not existing.** The two-pass design is still right; this ADR is operational, not architectural. ADR-0013's separation-of-duties rationale (Baker et al., the auditor must not be the producer) is unchanged and load-bearing.
- **Removing `/codex`.** `/codex` remains the right tool for free-form Codex delegation that humans drive interactively. This ADR only changes the call site for `/qa`'s Pass 2; nothing else uses Pass 2's call path, so nothing else loses anything.
- **Growing `automation/qa-exec-codex.sh` into a general `/codex` replacement.** The helper is intentionally small (~50 lines of bash). The temptation to expand it into a "shared codex frontend" is exactly the wrong move; that would re-create `/codex` while pretending not to. If the project ever needs the helper for non-`/qa` codex calls, a follow-up ADR can promote it deliberately rather than letting it accrete by drift.
- **Deferring the call-site change until after the runtime monitor ships.** The friction is happening now, on the only surface that exists today. Waiting for Phase 4 means living with the SlashCommand-of-SlashCommand failure mode for months, and the cost of fixing it is one small bash helper.
- **Editing ADR-0013 in place to amend the two clauses.** ADRs are immutable after acceptance. The supersession path is the contract; speed of supersession does not change that.

## Threshold and risk

This is a partial supersession of an ADR accepted earlier on the same calendar day as this ADR's authorship. The risk profile, recorded explicitly so a future reader has the honest version:

- **Operational risk: low.** The interactive `/qa` surface has been used exactly once (`qa-report-2026-04-27T061800Z`). The composition story has not yet shipped any audit downstream of it; no historical reports depend on the call site.
- **Architectural risk: medium.** ADR-0013 was a Phase-1 architectural decision; superseding any clause within hours of acceptance is a real signal that the original framing was incomplete on that point. The right response is to acknowledge the gap honestly here, not paper over it. The other ten decisions in ADR-0013 stand on their own merits and are not in question.
- **Cost risk: low.** The new helper is ~50 lines and inherits the substrate from ADR-0008 via shared library code (`automation/qa-lib.sh`). Maintaining two parallel Codex call paths (`/codex` for free-form delegation, `automation/qa-exec-codex.sh` for `/qa` Pass 2) is a small discipline cost, scoped to a single agent-config check.

## Alternatives considered

- **Keep ADR-0013's composition design and harden the SlashCommand-of-SlashCommand path.** Rejected: the harness's SlashCommand semantics (printing the nested command body before invoking it) are the failure mode, and they are not under this project's control. Hardening would mean working around the harness in `/qa`'s body, which still leaves the structured-input override as fragile prose discipline. The shell-out path bypasses the harness's nested-slash-command handling entirely.
- **Move the structured-input override out of `/codex` and into a separate config file both `/codex` and `/qa` read.** Rejected: that grows the surface area of ADR-0008's bridge to support a single caller (`/qa`), and the harness's body-printing problem is not solved by relocating the prompt. The shell-out is simpler and addresses both failure modes at once.
- **Make `automation/qa-exec-codex.sh` a thin wrapper that calls `/codex` programmatically through some headless harness.** Rejected: the harness's slash-command machinery is exactly what this ADR is routing around. Wrapping it does not help.
- **Promote `automation/qa-exec-codex.sh` to a general shared helper used by `/codex` itself.** Rejected for now: that would be the inverse refactor (have `/codex` shell out to the helper, deprecate the in-slash-command implementation). It might be the right move at some future date — particularly if the MCP-registered Phase-3 bridge ships — but it is an architectural change to ADR-0008's bridge, not a surgical fix to ADR-0013's Pass 2. A future ADR can do that work deliberately.
- **Defer the call-site change until Phase 4's runtime monitor revisit.** Rejected: the failure mode is current, the fix is small, and the runtime monitor will not retroactively repair `/qa` reports produced under the broken composition path between now and Phase 4.

## References

- [ADR-0013](./0013-qa-self-audit-pattern.md) — *QA self-audit pattern*. Partially superseded by this ADR: §"Why this shape" point 3 (composition-over-reimplementation) and §"Pass 2 — independent Codex audit" call-site wording. All other clauses unchanged.
- [ADR-0008](./0008-codex-bridge.md) — *Codex bridge: slash command, not auto-invoking skill*. Substrate ADR; flag set, sandbox, audit-log format are inherited verbatim by `automation/qa-exec-codex.sh`. `/codex` itself is untouched.
- [ADR-0007](./0007-autonomous-workflow.md) — *Autonomous workflow*. The Ralph loop integration in `automation/qa.sh` is unchanged in behavior; after this ADR, both `/qa` surfaces share `automation/qa-exec-codex.sh`.
- [ADR-0005](./0005-faithfulness-by-architecture.md) — *Faithfulness via architecture, not training*. Architectural ancestor; the Baker et al. separation-of-duties principle still drives the two-pass design and is unchanged.
- `tech-spec.md` §1 (executive summary, Baker et al. citation) and §2 Pillar 5 (faithfulness as architecture) — the principles ADR-0013 inherits and this ADR does not disturb.
- [QA report 001](../qa/qa-report-001.md) — the kind of project-wide periodic audit `/qa` complements per commit; orthogonal to this ADR.
- `automation/qa-reports/qa-report-2026-04-27T061800Z.md` — the interactive run that surfaced the friction this ADR addresses (commit `ae030a4`).
- [`automation/qa.sh`](../../automation/qa.sh) — the Ralph-loop entrypoint; already shells out directly. Will share `automation/qa-exec-codex.sh` after the follow-up commit.
- [`automation/qa-lib.sh`](../../automation/qa-lib.sh) — shared library; `resolve_codex_binary` and `extract_qa_counts` are reused by the new helper.
- [`automation/qa-prompt.template.md`](../../automation/qa-prompt.template.md) — the sole prompt source of truth for both `/qa` surfaces after this ADR.
- Baker et al., *Monitoring Reasoning Models for Misbehavior and the Risks of Promoting Obfuscation*, arXiv [2503.11926](https://arxiv.org/abs/2503.11926) — the obfuscation-tax paper cited from ADR-0005 and ADR-0013.
