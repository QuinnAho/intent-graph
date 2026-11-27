# ADR 0022 — Categorical encoding for AI confidence and severity

## Status

Accepted 2026-05-03.

## Context

Tech-spec §4.1 (lines 177–178) declares the `node.confidence` column as a four-state TEXT enum: `extracted | inferred | semantic | asserted`. This is a categorical encoding from the substrate up; it does not store a probability or a continuous confidence score. The aspiration is that user-facing surfaces (inbox row, canvas node styling, detail panel field rendering) preserve the categorical shape — but tech-spec does not name the rule, and absent a decision, every Phase 4 / Phase 5 surface that displays confidence is free to convert the four-state enum into a continuous score (e.g., `confidence_score = 0.73` rendered as a percentage or progress bar).

The UX research synthesis at `docs/research/ux-research-synthesis.md` argues against any such conversion, in three convergent places:

1. **Q1's misreading-of-percentages finding** (lines 13–14, 45): "raw probability scores are reliably misinterpreted as accuracy; users translate '0.73' as '73% correct' regardless of what the model actually means." Modexa's 2025 industry analysis and the Visible Language journal Issue 59-2 (2025) on uncertainty UI both converge on this. The PAIR Guidebook ("Explain for understanding, not completeness") and the Google Explainability Rubric recommend mapping uncertainty to *decisions* (asserted / inferred / semantic / extracted), not numbers.
2. **Q1's failure-must-be-legible-in-categories finding** (line 47): users build calibrated trust when they can predict *what kind of mistake the system makes*. Categorical encoding is the precondition for this calibration; continuous scores collapse the kind-of-mistake distinction into a quantitative gradient that obscures it.
3. **Cross-Cutting Theme #1 — Categorical Legibility Beats Continuous Scoring** (synthesis lines 617–619): "across confidence visualization (Q1), inbox sorting (Q2), AI legibility (Q5), and notification priority (adjacent), the same finding recurs: **categorical encodings (asserted/inferred/semantic/extracted; Tier 1/2/3; type-based color) outperform continuous scores (0.73 confidence, percentile sort, severity number).** This is true both because users misread continuous scores and because categorical schemes scaffold cross-team conversation. **IntentGraph's existing visual language is already aligned with this; the recommendation is to *resist* the temptation to add continuous scores in v1.**"

The synthesis also commits to a three-tier inbox severity (Q2 finding 1, lines 108–110, plus consolidated I-P4-1 at line 657): **Tier 1** (blocking + monitor-flagged + verifier-failed; capped at ~10 items, "Level-1 hard stop" analog), **Tier 2** (high-leverage proposals; ~10 items; scored by `severity × confidence-uncertainty × downstream-blast-radius`), **Tier 3** (low-priority backlog; filterable-out by default, counter visible in status bar). The tier structure is itself categorical — three tiers, not a continuous priority score — and synthesis Q2 finding 5 (lines 117–118) is explicit that the Linear/Sentry priority-sort literature converges on "three-tier priority is the practical ceiling. More tiers and users can't keep them straight."

The Phase 4 substrate that surfaces confidence and severity — the inbox sort, the inbox row stroke style, the canvas node rendering, the status-bar dot, the detail-panel field rendering — must commit to categorical encoding before the surfaces ship. The risk if no commitment lands: an internal scoring vector (Tier-2's `severity × confidence-uncertainty × blast-radius`) becomes the user-visible severity surface ("priority: 0.84"), or a `confidence_score` derived for ranking purposes leaks into the row display ("AI confidence: 73%"). Both failure modes are textbook UI mistakes the synthesis names by name.

This ADR forbids them, commits the four-tier confidence vocabulary plus three-tier inbox severity as the user-facing primitives, and names the structured-override-reason rule that the CPOE override-reason research supports.

## Decision

**Confidence and severity are categorical at every user-facing surface. Percentage scores, decimal scores, and continuous progress bars are forbidden as primary representations.** Internal scoring vectors used for sort and route are permitted but never surface to the user.

### 1. The four-tier confidence vocabulary is canonical and user-facing

Confidence on every user-facing surface is one of:

- **`asserted`** — the user has explicitly committed to this. Rendered as a solid stroke, no qualifier badge.
- **`inferred`** — the AI inferred this from existing material; the user has not explicitly affirmed. Rendered as a dotted stroke.
- **`semantic`** — the AI's understanding is heuristic / interpretive (e.g., extracted from prose by a language model, not from structured frontmatter). Rendered with a question-mark badge.
- **`extracted`** — mechanically extracted from substrate (e.g., from frontmatter, from tree-sitter walk, from SCIP). Rendered with an auto badge.

These four are the substrate enum values from tech-spec §4.1 line 178. The user-facing rendering uses stroke style and badge — never a numeric, never a percentage, never a progress bar. The visual encoding is consistent across every surface that renders confidence: canvas node, inbox row, detail-panel field, status-bar item count breakdown.

The ordering for any ranking purpose is: `asserted > inferred > extracted > semantic` (asserted strongest; semantic weakest because it is interpretive). The ordering is documented but **not** rendered as a number on user-facing surfaces.

A future need to express "confidence between two of these tiers" is forbidden by this ADR. Adding a fifth tier or interpolating between tiers is an ADR-level decision, not a Phase 4 ticket.

### 2. The three-tier inbox severity is canonical and user-facing

The inbox uses three tiers, no more, no fewer:

- **Tier 1 — Blocking** — monitor-`block` verdicts (per ADR-0021), verifier failures, drift events flagged `safety_critical`. Capped at ~10 items by inbox styling; if more than 10 exist, a "+N more in Tier 1" indicator appears. Tier 1 is the analog of CDS Level-1 hard stops (synthesis line 39); modality is governed by ADR-0021.
- **Tier 2 — High-leverage** — proposals scored by `severity × confidence-uncertainty × downstream-blast-radius`. The internal score is computed but **never rendered**. Tier 2 is bounded by user budget context (status-bar shows `12/25 reviewed · 23min · 3 high-leverage remaining` per coverage matrix P4.5).
- **Tier 3 — Backlog** — low-severity inferred suggestions, drift events on stable nodes, anything not promoted to Tier 1 or Tier 2. Collapsed by default with a counter visible.

Tier assignment is computed at the skill side by the inbox-sort algorithm (Phase 4 task) and is **part of the wire format** the skill emits to the webview. The webview does not compute tiers; it renders them. A future ranking refactor that wants to expose more granular priority levels to the user is an ADR-level change.

The Tier 2 internal score may include continuous components (e.g., `severity × confidence-uncertainty × blast-radius` with each multiplicand normalized to [0, 1]), but the user sees only "Tier 2: 7 items" or similar — never the underlying score. Sort within Tier 2 is by the internal score, but no number appears in the row.

### 3. Percentage scores forbidden as user-facing primitives

The following are forbidden in every user-facing surface (inbox row, canvas, detail panel, status bar, dialogs, weekly digest, audit/replay output, CodeLens annotation):

- **Confidence percentages.** No "AI confidence: 73%". No "Confidence: 0.73". No progress bars representing confidence.
- **Severity percentages or scores.** No "Priority: 0.84". No "Severity: 8/10". No numeric ranking labels.
- **Probability or likelihood phrasing as a primary signal.** "Likely correct" is permitted as text accompanying the categorical badge if the underlying tier is `inferred`; "84% likely correct" is forbidden. The categorical badge is the primary; prose is secondary.

Diagnostic surfaces — the trace panel's deep view, the audit/replay tool's per-event inspector, internal logs — *may* show the substrate fields including any continuous scores recorded by AgentRunner (e.g., `trace_event.usage`, `trace_event.cost_usd`). These are diagnostic, not user-facing-decision primitives, and ADR-0020 §5 already names them as Layer 3 detail-panel territory. The boundary: if a number appears at Layer 1 or Layer 2 (per ADR-0020), it is forbidden by this ADR; if it appears at Layer 3 in a "trace details" surface, it is permitted as audit data.

### 4. Structured override reasons (CPOE-derived)

Per synthesis Q2 finding 4 around bulk-action affordances (line 132) and the CPOE override-reason research the synthesis cites:

- **Bulk-dismiss of monitor-flagged items requires a typed reason.** Free-text, ≥1 character. Recorded as `event_log.kind='monitor.bulk_dismiss'` with the reason in payload.
- **`block` verdict overrides require a typed reason** per ADR-0021 §2. The mechanism is the same. ADR-0021 owns the dialog UX; this ADR names the reason-storage convention.
- **`false_positive` marks on monitor verdicts require a typed reason** per ADR-0021 §5.
- **Bulk-accept does NOT require a reason** when scoped to Tier 3 (per coverage matrix P4.6's restriction). The structured-reason discipline is reserved for the cases where the override is overriding *protection* (a monitor or verifier that flagged something), not for routine batch acceptance.

The reason-storage convention is a `typed_override_reason` JSON field within `event_log.payload`. Schema impact is zero — `event_log.payload` is already free-form JSON (tech-spec §4.6 line 282). The convention is application-layer only; future schema work might formalize it but is out of scope here.

### 5. Internal scoring is permitted; user-facing rendering is constrained

The `severity × confidence-uncertainty × blast-radius` formula in Tier 2's internal score is permitted because it lives at the skill-side sort layer and never crosses into user-facing rendering. Similarly, the route LLM (tech-spec §2 Pillar 4 line 94, "RouteLLM-style classifier between T1↔T2") may use continuous scores internally; users see only the resulting tier and the action.

The boundary rule: **a continuous score is permitted at the substrate or sort layer; a continuous score is forbidden at any layer the user reads.** This is the same boundary tech-spec §3.7 line 159 already establishes for retrieval ("retrieval-first to ~50K tokens, frontier reasoning within"): an internal mechanism with a categorical user-facing projection.

A future need to expose calibrated probability to the user — for example, showing per-monitor-verdict precision data on the audit/replay tool — would have to land as an ADR amendment that names the surface, names the diagnostic-not-decision context, and explains why this ADR's general rule should not apply there. Until then, no surface that drives user decisions shows a number.

## Schema implications

**No DDL change.** The categorical commitments read existing columns:

- `node.confidence` (tech-spec.md:177–178) is already the four-state enum.
- `event_log.payload` (tech-spec.md:282) holds typed override reasons in JSON; no migration.
- The Tier 1/2/3 assignment is computed at the application layer from existing substrate (verdict severity, obligation status, node confidence, blast-radius queries on the graph). No new column.

The wire format from skill to webview adds a field — `tier: 1 | 2 | 3` — on inbox event envelopes. The wire format lives in `packages/shared/src/protocol/`; no DB migration.

## Implementation implications

- `packages/shared/src/protocol/inbox-events.ts` (Phase 4) — wire-format schema with `tier` enum.
- `packages/skill/src/inbox/sort.ts` (Phase 4) — tier-assignment algorithm; internal scoring isolated here.
- `packages/webview/src/design-system/confidence-cue.ts` (Phase 4, per ADR-0020 §5) — stroke-style and badge mapping for the four confidence values; no numeric rendering.
- `packages/webview/src/inbox/TierBanner.tsx` (Phase 4) — tier markers in the inbox.
- ESLint rule (Phase 4 task) — a custom rule, similar in shape to the AgentRunner-only rule, that flags any string template in the webview package containing a `%` symbol adjacent to "confidence" or "severity" or "priority" identifiers. False-positive prone but cheap to suppress with a comment that cites this ADR. Lighter alternative: a contributor-facing checklist in `CLAUDE.md` and the `intentgraph-spec-writer` skill that names this ADR.

The Phase 4 task list amendment includes the tier-banner task and the confidence-cue task; the ESLint rule is optional and deferred to Phase 5 hardening if the contributor checklist proves insufficient.

## Consequences

What this enables:

- **The synthesis's "categorical legibility beats continuous scoring" theme becomes operational.** Every Phase 4 surface that renders confidence or severity has a fixed vocabulary; cross-surface consistency is structural, not vigilance-dependent.
- **The substrate's categorical enum (tech-spec §4.1) is preserved up the stack.** The four-state confidence does not get downsampled to a probability for ranking and then re-projected to a percentage for display.
- **Tier 1 is bounded as rare.** Synthesis Q2 finding 1 + Phansalkar tiered-alerts converge on rare-Tier-1 as the precondition for compliance; the ~10-item cap operationalizes this.
- **Internal scoring stays internal.** The skill can use any sorting algorithm it wants — including ML-tuned rankers later — without that affecting the user surface.
- **CPOE-derived structured override reasons are uniformly enforced.** Override-by-block, bulk-dismiss-monitor, mark-false-positive — all use the same `event_log` payload convention, which makes the QA pass and audit/replay tooling uniform.

What this costs:

- **A future product decision to "show users a numeric calibration metric" is forbidden by default.** It requires an ADR amendment. This is intentional because the synthesis's evidence base on misread percentages is strong; but it does foreclose some product-marketing patterns that competitor tools use.
- **Tier 1 being capped at ~10 items implies a skill-side algorithm to demote excess Tier-1 items.** When more than 10 things qualify (e.g., a CI failure cascade dumps 30 verifier failures), the algorithm has to demote some to Tier 2 with a clear rule. This is a Phase 4 task, not pre-decided here.
- **Adding a fifth confidence tier requires an ADR.** A future need (e.g., `human_endorsed` for explicitly-team-reviewed material) is plausible but cannot land as a quiet schema migration.
- **The contributor-facing constraint requires a checklist.** Without the optional ESLint rule, the project relies on the spec-writer skill and the QA pass to catch percentage leaks. This is consistent with how ADR-0021's language rules are enforced; the cost is one more checklist item in `intentgraph-spec-writer`.
- **An ESLint rule, if added later, is false-positive prone.** The rule has to ignore comments, cost numbers ("$0.10/dev/day"), latency numbers ("p95 latency: 230ms"), and similar legitimate uses of `%` adjacent to numeric identifiers. The rule is a backstop, not the primary discipline.

## Alternatives considered

- **Allow continuous confidence on the canvas only.** Tempting because the canvas has more visual real estate. Rejected because the synthesis's evidence (Q1 finding 1 + Cross-Cutting Theme #1) is about user cognition, not visual real estate. The misread-percentage failure mode happens regardless of where the percentage is displayed; a single percentage on the canvas calibrates the user's expectation that confidence is quantitative, which then bleeds into how they read the inbox row's categorical badge.
- **Allow a "confidence: high / medium / low" alternative vocabulary alongside the four-tier enum.** Rejected because adding a parallel vocabulary doubles the surface contributors have to learn and creates a translation problem (does "high" map to `asserted` or `inferred`?). The four-state enum is the substrate; the surface preserves it literally.
- **Allow a Tier 4 ("buried") for items the user has hidden.** Rejected because hiding is already covered by Tier 3's filterable-out-by-default rule plus the Linear-style snooze. A separate Tier 4 confuses the modality (is it a tier or a state?). Hidden items use a `hidden` state on the existing tier, not a new tier.
- **Allow surface-side numeric severity for monitor verdicts only.** The monitor's `score` field (tech-spec.md:309) is a continuous value, and a surface-side display would honor the substrate. Rejected because the monitor's `recommended_action` (allow / require_human_review / block) is the user-actionable categorical projection of `score`; the score itself is diagnostic. ADR-0021's framing rule (verdicts surface as heads-up, not as severity numbers) jointly with this ADR forbids the score from leaking out of the trace panel.
- **Defer this decision to Phase 4 implementation.** Rejected. The synthesis's Cross-Cutting Theme #1 is explicit: "the recommendation is to *resist* the temptation to add continuous scores in v1." Without an ADR-level commitment, the temptation arrives in Phase 4 task implementation and is paid every time a contributor reaches for a percentage display. The architectural cost of forbidding it once, at this layer, is low; the cost of policing it in 30 surfaces is high.

## References

- `docs/research/ux-research-synthesis.md` §Q1 finding 1 (lines 13–14, 45), §Q1 finding 2 (lines 47), §Q2 finding 1 + 5 (lines 108–110, 117–118), §Cross-Cutting Theme #1 (lines 617–619).
- `docs/research/phase-coverage-matrix.md` rows P4.1, P4.4 — the matrix entries this ADR closes.
- tech-spec.md:177–178 — the four-state `confidence` enum at the substrate.
- tech-spec.md:282 — `event_log.payload` shape that holds typed override reasons.
- ADR-0020 (per-decision-type legibility taxonomy) — co-authoritative on the cross-cutting visual conventions (color = type, stroke = confidence, no continuous severity hue).
- ADR-0021 (monitor LLM presentation framing) — owns the override-dialog UX whose typed-reason convention this ADR generalizes.
- Synthesis cited primary sources: Modexa 2025 industry analysis on uncertainty UI; Visible Language Issue 59-2 (2025); PAIR Guidebook ("Explain for understanding, not completeness"); Phansalkar et al. PMC 2605599 (tiered alerts); Linear blog on triage; Sentry Issue #48477 / Discussion #68908 (priority-sort tradeoffs).
