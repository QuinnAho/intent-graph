# ADR 0021 — Monitor LLM presentation framing: teammate observation, not audit finding

## Status

Accepted 2026-05-03.

## Context

The cheap monitor LLM (Llama 3.3 70B on Groq, tech-spec §2 Pillar 5 lines 102–103; ADR-0005) is the architectural keystone of the faithfulness pillar. Every commit phase plus a 5% sample plus all `safety_critical` mutations route through it. The monitor's output is structured (tech-spec.md:309): `{flagged, score, categories[reward_hack | intent_drift | hallucinated_spec | capability_misuse | obfuscation], evidence, recommended_action[allow | require_human_review | block]}`. Verdicts live on the same `trace_event` row as the action they evaluate (tech-spec §3.8 line 160), and a flagged verdict additionally emits a `monitor_flag` graph node (tech-spec §2 Pillar 5 line 102).

The UX research synthesis at `docs/research/ux-research-synthesis.md` is emphatic that the **framing of the monitor LLM is the most consequential UX decision in the product** (synthesis Cross-Cutting Theme #3, lines 626–628). Three convergent findings make this load-bearing:

1. **Q1's autonomy-and-trust analysis** (lines 53–54): the human-AI teaming literature (Wischnewski CHI 2023; Larasati 2025) finds that "trust-but-verify with no verification affordance" leads to users saying they verify but not doing so. The monitor's verdict is precisely a verification affordance, but the framing controls whether users engage with it or work around it.
2. **Q5's developer-tools analysis** (lines 388–393, 404): Cursor's "shared ownership" comes from the user being part of the verification loop; Devin's "shared ownership through delegation" is more remote. The synthesis recommends IntentGraph adopt the former framing — "a teammate who flagged something, not an auditor who caught the user." The synthesis names the wrong framing concretely: "Faithfulness violation detected" is the audit framing; "Heads up: the monitor flagged this proposal as possibly unfaithful to the rationale. You probably want to check the trace" is the teammate framing.
3. **Q5's faithfulness-paper context** (lines 384–386): Korbak et al. (arXiv 2507.11473) characterize CoT monitorability as fragile and architecture-dependent; Baker et al. (arXiv 2503.11926) show cheap monitors catch reward hacking on stronger reasoners. The hard rule "never train any IntentGraph component against the monitor's signal" (CLAUDE.md, ADR-0005) is the obfuscation tax Baker et al. warn about. **This rule applies to UX framing too**: language that subjects the user (rather than the proposer) creates a behavioral gradient where users learn to suppress proposals that might trigger the monitor, which is a form of obfuscation pressure transmitted through the user.

The synthesis's Q5 names five framing rules (lines 481–488):

1. Frame as a teammate observation, never as an audit finding.
2. Always paired with a concrete next action (open trace, override, ask for second opinion).
3. Never blocks the user's action without a hard-stop trigger (only for severe faithfulness violations on high-blast-radius proposals).
4. Aggregate positively: "this week, the monitor flagged 4 issues. You overrode 1, fixed 2, and the third turned out to be a false flag."
5. The monitor's verdict is shown *about* the proposer, not *about* the user. The user's behavior is never the subject.

The Phase 4 substrate that surfaces the monitor verdict — the inbox row (Type 3 chevron and rare-Tier-1 escalation per ADR-0020), the expanded view, the monitor-flagged graph node, the status-bar interruption rule — must commit to the framing before the surfaces ship. Without an explicit decision, language choices will accrete inconsistently across CodeLens annotations, inbox rows, override dialogs, and weekly digests, and the result will be the audit framing the synthesis warns against. Users who experience even a few "faithfulness violation detected" surfaces will calibrate the entire monitor system as adversarial.

This ADR is the policy commitment. It does not specify exact strings — those are downstream copy work — but it does commit to language rules, override mechanics, the never-modal-except-for-Tier-1 policy, and the aggregation framing.

## Decision

**The monitor LLM is presented as a teammate observation, not an audit finding.** Five sub-decisions specify this concretely.

### 1. Language rules (normative for every monitor-touching surface)

The following language rules apply to every UI surface that renders a monitor verdict — inbox row chevron tooltip, expanded view, monitor-flagged graph node, status bar, weekly digest, override dialogs, audit/replay tool output:

- **The verdict is *about the proposer*, never *about the user*.** The grammatical subject of every monitor sentence is the proposer or the proposal, not the user. Allowed: "The monitor noticed the proposer's stated reasoning doesn't match the diff." Forbidden: "You should review this." (Implicit-you "Worth a look" is permitted because it does not subject the user as the agent of the issue.)
- **No language that classifies user behavior.** "You've been accepting these without checking" is ADR-0022's protective-banner territory and stays separate from monitor verdicts. The monitor evaluates the proposer, not the user.
- **Heads-up framing for hedge verdicts.** When `monitor_verdict.recommended_action='require_human_review'`, the surface uses heads-up language ("heads up," "worth a look," "the monitor flagged …", "the monitor wasn't sure"). Forbidden: "violation," "detected," "caught," "caught you," "alert," "warning" *as a primary noun* (these are clinical-alarm vocabulary the synthesis (lines 37–39) names as the failure mode).
- **Concrete next action paired with every verdict.** Every surface that displays a verdict pairs it with a single, scannable next action: "open trace," "override," "second opinion." If no action is meaningful (e.g., a historical verdict in the audit/replay tool), the surface displays "for context" rather than implying action is required.
- **Block verdicts use direct language without subjectifying the user.** When `monitor_verdict.recommended_action='block'`, the surface says "the monitor blocked this proposal" — the proposal is the subject, the block is the verb, the user is named only as the entity whose accept-action was prevented. The block dialog includes the override path per §2 below.

The `intentgraph-spec-writer` skill discipline is extended: any new copy that renders a monitor verdict goes through a "language rules check" against this list. Phase 4's QA gate (`/qa`) reads this ADR's rules as a checklist when reviewing any commit that touches monitor-rendering surfaces.

### 2. Override mechanics

The `recommended_action` field (tech-spec.md:309) drives override semantics:

- **`allow`** (the most common case): the surface renders the verdict in pass-through mode — no chevron, no banner. The verdict is recorded in `trace_event.monitor_verdict` for audit but does not surface to the user. Acceptance/rejection of the underlying proposal proceeds normally.
- **`require_human_review`**: the surface renders the Type 3 chevron per ADR-0020 (annotated onto the Type 2 proposal row) with a heads-up tooltip. The user can accept or reject the proposal through the normal Y/N keyboard binding; the chevron is informational and **does not gate the action**. The verdict's evidence is reachable through the V (investigate) keybinding and through the trace panel.
- **`block`**: the proposal is escalated to its own row at Tier 1 of the inbox (ADR-0022; ADR-0020 §3 Type 3). The accept keybinding (Y) on a blocked proposal opens an override dialog rather than executing the accept. The override dialog requires:
  1. A typed reason (free-text, ≥1 character; structured-override-reason rule per ADR-0022's CPOE-derived guidance).
  2. An explicit acknowledgement checkbox: "I have read the monitor's evidence and the override is intentional." The checkbox text is the only place "acknowledgement" appears, because here the user *is* the agent of the override — language is symmetric to that responsibility.
- **No silent override.** Even an authorized maintainer cannot dismiss a `block` verdict without the typed reason. The reason is written to the `event_log` (`actor='user'`, `kind='monitor.override'`, payload includes the reason and the trace_id) per tech-spec §4.6.

The override path **never** trains any model. The reasons are diagnostic for monitor-precision review (tech-spec §7-D risk D, "maintain a labeled set of 200+ historical commits") and for the QA pass; they are not used as a fine-tuning signal. ADR-0012 (defer monitor-training CI check) plus the hard rule in ADR-0005 forbid this; the override mechanism does not introduce a path that violates either.

### 3. Modality policy: never modal except for Tier 1 block

Synthesis Q1 finding 5 and the Phansalkar-derived analysis (lines 37–39) converge: modal/interruptive treatment is reserved for the rarest and most consequential alert tier. Translated to the monitor:

- **`allow` and `require_human_review` verdicts are never modal.** They surface via inline chevron, expanded view, status-bar count, and weekly digest. They never block the user's flow. They never interrupt typing or canvas navigation with a dialog.
- **`block` verdicts use a non-modal Tier 1 inbox row by default.** The user can ignore the row indefinitely — the proposal stays unaccepted but does not block any other action. The accept attempt on the row is what triggers the override dialog (§2 above), and that dialog *is* modal because the action is consequential. This is the synthesis's "confirmation breakpoints at high-risk moments" pattern (lines 537–538).
- **The status-bar interruption rule from coverage matrix row P4.8 follows from this**: synchronous notification ringing/popping is reserved for monitor-flagged severe (block) and verifier-failed events. Everything else batches.

This policy bounds the monitor's user-perceived intrusiveness at: zero modals for `allow`, zero modals for `require_human_review`, one modal *only when the user attempts to override a block*. Users who never accept a blocked proposal never see a monitor modal.

### 4. Positive aggregation framing

Per synthesis Q5 framing rule 4 (line 486) and §Q5 finding 5 (lines 405–407, "verifier outcomes are a *positive* feedback opportunity"), aggregate monitor activity is framed as the system protecting the user, not as a tally of user mistakes:

- **Weekly digest** (Phase 5 task): "this week, the monitor flagged 4 issues. You overrode 1, fixed 2, and the third turned out to be a false flag." The breakdown is by *outcome* (overrode / fixed / false flag), not by *blame* (user accepted incorrectly / user nearly accepted / user correctly skeptical).
- **Status-bar count** (Phase 4 task): when the inbox shows monitor-flagged items, the status-bar dot uses the same Type-3 amber chevron as the inbox row. No counter implies "issues you let slip."
- **Audit/replay tool output** (Phase 5 substrate, ADR-0007 audit/replay): historical verdicts surface with "for context" language. The audit tool is the only place where a punitive framing would be plausible (it is reviewing past behavior); this ADR forbids that framing there too.

### 5. False-positive feedback path

Users mark a verdict as a false positive through the Type 3 / N keybinding (per ADR-0020 §3 Type 5: "Mark as false positive — requires reason"). Monitor false-positive marks land in `event_log` as `kind='monitor.false_positive'` with a typed reason, identical in shape to overrides. They are diagnostic for the monitor-precision quarterly review (tech-spec §7-D), and **never** used to train the proposer or the monitor (ADR-0005, ADR-0012).

The user-facing copy on a false-positive submission says "thanks — the monitor's precision review uses these to tune itself" (the monitor itself can be re-prompted with new evidence, which is not training; that is allowed per ADR-0005 — only training against the monitor's signal is forbidden). The copy explicitly does not promise that the user's individual mark will change anything; it is honest about the diagnostic role.

## Schema implications

**No DDL change.** The framing reads existing columns:

- `trace_event.monitor_verdict.recommended_action` (tech-spec.md:309) drives the modality policy.
- `event_log` (tech-spec §4.6) is the existing record for override and false-positive submissions; new `kind` values (`monitor.override`, `monitor.false_positive`) are application-layer conventions and require no migration.
- The `monitor_flag` graph node (tech-spec §2 Pillar 5 line 102) is the existing surface for verdicts that emit a node; this ADR doesn't add a new node kind.

## Implementation implications

- `packages/webview/src/inbox/MonitorChevron.tsx` (new) — Type 3 chevron rendering with heads-up tooltip language.
- `packages/webview/src/inbox/BlockedProposalRow.tsx` (new) — Tier 1 row layout for `block` verdicts.
- `packages/webview/src/dialogs/MonitorOverrideDialog.tsx` (new) — the only modal in the monitor surface.
- `packages/extension/src/notifications/dispatcher.ts` (Phase 4) — never-modal-except-block rule wired into the synchronous-notification gate.
- `packages/skill/src/mcp/tools/monitor.ts` (existing in tech-spec §5.5) — `monitor.review` tool's response shape is unchanged, but the surface-side language transforms are applied at render time, not at the tool layer.
- `.claude/skills/intentgraph-spec-writer/SKILL.md` — extended with the language rules check from §1 above. Same for `.codex/skills/intentgraph-spec-writer/`.
- `automation/qa.sh` and `automation/qa-reports/` — the per-commit QA pass (ADR-0013, ADR-0014) reads §1's language rules when reviewing monitor-touching commits.

The Phase 4 task list amendment includes a task that lands the language-rules check in the spec-writer skill before any monitor-rendering surface is touched, and a task that documents the override-dialog mechanics with their event-log record.

## Consequences

What this enables:

- **The substrate from ADR-0005 becomes legible without becoming threatening.** The monitor's value is captured in the user-facing surface; the obfuscation tax (Baker et al.) is mitigated by removing the gradient that would push users to suppress proposals that "might trigger the monitor."
- **The synthesis's "verify continuously, because checking is cheap" pattern (line 388) is achievable.** The verdict is informational at every tier except `block`, where the override dialog's friction is proportionate to the risk.
- **The aggregate framing aligns with the synthesis's positive-feedback principle.** Weekly digests and audit views frame monitor activity as system protection, not user oversight, which matches the Cursor "shared ownership" pattern the synthesis recommends.
- **Override mechanics are auditable.** Every `block`-tier override is a typed-reason event in the hash-chained `event_log`; the audit/replay path can reconstruct any override decision by `trace_id`.
- **Tier 1 modality is reserved as rare.** Synthesis Q1 finding 5 + Phansalkar's tiered-alert work converge on rare-Tier-1 as the precondition for compliance; the never-modal-except-block rule operationalizes this.

What this costs:

- **Block-tier overrides cost the user friction.** The typed-reason + acknowledgement is intentionally annoying (the synthesis's "confirmation breakpoints at high-risk moments"). Users who feel the friction is excessive may push to soften it; this ADR forbids that softening absent a new ADR. The friction is the protection.
- **Language rules constrain copy revisions.** Every new copy in a monitor-touching surface goes through the §1 rules. This is enforced by the spec-writer skill plus the QA pass, but copy authors will sometimes want to break the rules for clarity. They have to either reword to satisfy the rules or open a follow-up ADR.
- **The monitor never trains, even on overrides.** The reasons are diagnostic only. A future request to "use overrides to fine-tune the monitor" violates ADR-0005 and ADR-0012; this ADR makes the surface-side commitment that prevents the diagnostic data from being a training-signal back-door.
- **The Phase 5 weekly digest is a Phase 5 task only after this ADR accepts.** ADR-0023's branch-and-review work and the Phase 5 inbox amendments need this framing in place; if the digest ships first with a punitive framing, the surface area to retrofit is large.
- **A future need for medium-severity modal** (e.g., "ask the user before applying a particularly large patch") would have to introduce a new modality category outside the monitor's verdict surface. The monitor's modality is constrained by this ADR; orthogonal modal categories are out of scope here.

## Alternatives considered

- **Audit framing.** "Faithfulness violation detected. Action recommended." Direct, clinically-precise, what current static-analysis tools use. Rejected because the synthesis's central UX claim is that audit framing creates work-around behavior and gradient pressure on the proposer (transmitted through the user). The clinical-alarm vocabulary maps directly to the failure mode in the CDS literature (synthesis lines 37–39): override rates 49–96% precisely because the framing is interrupting and adversarial. Adopting audit framing would replicate the worst empirical results from CDS in a tool the user has more autonomy to disengage from than from CDS — they will simply stop using the monitor's chevron information.
- **No framing commitment, decide per surface.** Rejected for the reason in §Context: language inconsistency across surfaces calibrates the system as a whole, even if individual surfaces are well-written. One audit-framed CodeLens annotation will infect the user's perception of the inbox chevron. The framing has to be policy-level.
- **Treat the monitor as a hard gate (block by default, override required for accept).** Rejected. This is a maximal-friction posture that the synthesis Q1 finding 5 (Tier 1 reserved as rare) and the Phansalkar 11-of-15 evaluation (hard stops effective only when used promiscuously is forbidden) jointly forbid. The architectural defaults from ADR-0005 (allow / require_human_review / block tiered by `recommended_action`) already hold the right shape; this alternative would override those tiers in a way that contradicts the substrate.
- **Soften the block override (no typed reason, just confirm).** Rejected. The CPOE override-reason research (synthesis lines 132 around "structured override reason") finds that requiring a reason reduces inappropriate overrides without significantly slowing throughput. The cost is small, the protective effect is real.
- **Train the monitor against overrides marked "false positive."** Forbidden by ADR-0005 (hard rule, line 103 of tech-spec). This ADR reaffirms that ban at the surface layer. The diagnostic role of false-positive marks is for human review of monitor precision, not for closing a model-training loop.

## References

- `docs/research/ux-research-synthesis.md` §Q1 finding 5 (lines 53–54), §Q5 findings 1, 4, 5 (lines 396–407), §Q5 framing rules (lines 481–488), §Cross-Cutting Theme #3 (lines 626–628).
- `docs/research/phase-coverage-matrix.md` rows P4.8, P4.16, P5.2, P5.9, P5.15, P5.16 — the matrix entries this ADR closes.
- tech-spec.md:99–104 (Pillar 5 monitor architecture and the never-train rule).
- tech-spec.md:289–323 — `trace_event` DDL with `monitor_verdict` shape.
- tech-spec.md:308–309 — `monitor_verdict` JSON shape including `recommended_action`.
- tech-spec.md:417–419 — `monitor.review` MCP tool surface.
- ADR-0005 (faithfulness via architecture) — substrate and the never-train rule this ADR transmits to UX.
- ADR-0012 (defer monitor-training CI check) — the technical guard against the training back-door this ADR's surface-side commitment supports.
- ADR-0013 / ADR-0014 (QA self-audit pattern) — the per-commit gate that reads §1's language rules.
- ADR-0020 (per-decision-type legibility taxonomy) — co-authoritative on Type 3 chevron-overlay rule and Tier 1 escalation for `block`.
- ADR-0022 (categorical encoding for confidence and severity) — the Tier 1/2/3 inbox severity that this ADR's modality policy reads.
- Baker et al. arXiv 2503.11926 — the cheap-monitor result; cited for the obfuscation-tax warning that motivates the never-train rule and (transitively) the language rule about not subjecting the user.
- Korbak et al. arXiv 2507.11473 — CoT monitorability fragility, motivating the architecture-not-training posture.
- Phansalkar et al. PMC 2605599 — tiered alerts, motivating the rare-Tier-1 modality policy.
