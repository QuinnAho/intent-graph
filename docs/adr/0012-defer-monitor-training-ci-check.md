# ADR 0012 — Defer the monitor-training CI check until the first fine-tune script lands

## Status

Proposed. Partially supersedes one clause of ADR-0007.

## Context

ADR-0005 establishes the load-bearing rule: never train any IntentGraph component against the monitor LLM's signal. Doing so triggers the obfuscation tax described by Baker et al. (arXiv 2503.11926) — once the gated model is trained against the gate, the gate stops working. CLAUDE.md restates the rule. AGENTS.md restates the rule. `automation/monitor-llm.sh:21-22` restates the rule.

ADR-0007 § *Monitor-LLM gate* commits to a programmatic guard for that rule:

> This is restated as a hard rule in `automation/README.md`, in the agent prompt template inside `ralph.sh`, and as a CI check that any future model-fine-tune script does not consume `monitor-*.json` artifacts.

QA report 001, finding **F-MONITOR-TRAINING-CHECK-MISSING** (`docs/qa/qa-report-001.md`), observes that:

1. The CI check does not exist on disk.
2. There are no fine-tune scripts in the repo to check against.
3. A grep-based step that fails on co-occurrence of `train` / `fine.?tune` and `monitor.*\.json` patterns, run today, would be false-positive-prone — comments, docstrings, `train_test_split` imports, and unrelated test fixtures would trip it. The architecture has zero fine-tune code today; the check has zero true-positive surface.

The QA report scores it **minor** ("debt, not a bug"). No blocker, but the implementation promise in ADR-0007 is unmet, and the question is whether to land the check now or defer it to the moment it has something to check.

## Decision

Defer the monitor-training CI check. Implement it when the first fine-tune script lands in the repo.

Specifically:

- The hard rule from ADR-0005 — *never train any IntentGraph component against the monitor's signal* — **remains unchanged and load-bearing**. This ADR does not relax it. It remains documented in CLAUDE.md, AGENTS.md, ADR-0005, ADR-0007, the `intentgraph-architect` SKILL.md, and `automation/monitor-llm.sh`.
- The single sentence in ADR-0007 § *Monitor-LLM gate* — "and as a CI check that any future model-fine-tune script does not consume `monitor-*.json` artifacts" — is **amended** to: "and, once the first fine-tune script lands, a CI check that any model-fine-tune script does not consume `monitor-*.json` artifacts." The rest of ADR-0007 (autonomy levels, cost caps, three-failure abort, hard rules in `ralph.sh`) is unchanged.
- The deferral is made auditable by planting `// QA-001: F-MONITOR-TRAINING-CHECK-MISSING — implement when first fine-tune script lands` TODO markers in the relevant phase task lists (`automation/tasks/phase-4-drift-detection/tasks.json`, `automation/tasks/phase-5-retrieval-eval/tasks.json`, `automation/tasks/phase-6-hardening/tasks.json`). The marker insertions themselves are out of scope for this ADR; they are the implementer's mechanical follow-up.
- If a fine-tune script enters the repo before Phase 4, the implementer must escalate via an ADR amendment that reactivates the check (or supersedes this one) before the script merges. The check is a precondition for any fine-tune code, not a follow-up to it.

## Consequences

**Wins.**

- Avoids a CI gate that fires on innocuous patterns (comment blocks, doc strings mentioning "monitor", `train_test_split` from sklearn, fixtures named `train-*.json`). False positives erode trust in gates; trust in gates is what makes the monitor-LLM mechanism work at all.
- Keeps the discipline surface honest. The rule is "never train against monitor signal." Today's defenses are: (a) architectural separation — the monitor is a separate provider invoked from a shell script, not a Python module imported into a training loop; (b) traces are read-only artifacts; (c) no fine-tuning code exists in the repo; (d) code review enforces the rule on any PR introducing training-shaped code. These are sufficient until there is something concrete to gate.
- The QA finding is resolved with a documented, dated decision rather than a silent debt.

**Costs.**

- ADR-0007's promise of a programmatic check is, until the trigger fires, a process commitment rather than running code. The TODO markers and this ADR are the audit trail for that gap. Any reviewer searching the repo for `monitor-training` enforcement will find this ADR and the TODOs, not a green CI badge.
- Discipline depends on the ADR amendment requirement actually being honored when a fine-tune script first lands. If a contributor adds training code without reading this ADR, the check will not exist to stop them. The architect skill, the implementer skill, and `intentgraph-verifier-author` should treat any new file matching `**/train*.{ts,py,sh}` or `**/fine[-_]?tune*` as triggering this ADR. Adding that to those skills is follow-up work for the next agent-config pass.

**What becomes ADR-NNNN+1's problem.**

- The implementation ADR for the check itself when the trigger fires. That ADR will name the script, the file globs, and whether the check runs in `pnpm lint`, in a separate `pnpm check:monitor-training` step, or as a `.github/workflows/` job.

## Alternatives considered

- **Implement a grep-based CI check now, accepting false positives.** Rejected. False positives in a load-bearing gate train contributors to ignore it. The first time the check fires on a comment in `packages/skill/src/agent-runner/README.md` and is overridden with `# noqa`, the rule is dead. Better to land the check when it has true positives to find.
- **Implement an AST-based CI check now, scoped to imports of `monitor-*.json` from `**/train*.{ts,py}` files.** Rejected. There are no `train*.{ts,py}` files. The check would have zero coverage and zero false positives — and zero value. Re-evaluate when the first fine-tune script lands; the AST approach is the right shape, just premature.
- **Drop the promise from ADR-0007 entirely and rely on code review.** Rejected. Code review is today's discipline; the future check is the right backstop. ADRs are immutable after acceptance, but ADR-0007 is still `Proposed`, and the *programmatic* commitment is correct in spirit even if its timing was wrong. Amending it via this ADR preserves the commitment.
- **Inline the deferral into ADR-0007 by editing it.** Rejected. ADRs are immutable after acceptance; even though ADR-0007 is `Proposed`, the project convention is to supersede via a new ADR rather than re-edit. This ADR is the supersede record.

## References

- [ADR-0005](./0005-faithfulness-by-architecture.md) — *Faithfulness via architecture, not training*. The hard rule this ADR does not change.
- [ADR-0007](./0007-autonomous-workflow.md) § *Monitor-LLM gate* (line 55) — the clause partially superseded by this ADR. The rest of ADR-0007 is unchanged.
- [QA report 001](../qa/qa-report-001.md) — finding **F-MONITOR-TRAINING-CHECK-MISSING** in §6.
- [`automation/monitor-llm.sh`](../../automation/monitor-llm.sh) — the script that produces `monitor-*.json` artifacts that any future fine-tune script must not consume.
- [CLAUDE.md](../../CLAUDE.md) and [AGENTS.md](../../AGENTS.md) — both restate the hard rule under *Hard rules*.
- Baker et al., *Monitoring Reasoning Models for Misbehavior and the Risks of Promoting Obfuscation*, arXiv [2503.11926](https://arxiv.org/abs/2503.11926) — the obfuscation-tax paper cited from ADR-0005.
