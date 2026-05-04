# ADR 0020 — Per-decision-type legibility taxonomy

## Status

Accepted 2026-05-03.

## Context

The UX research synthesis at `docs/research/ux-research-synthesis.md` (April 2026), in Q5 ("Legibility of AI Decisions"), argues that **the unit of design for AI legibility is the decision type, not the AI action.** Drift detection, proposal generation, monitor verdict, retrieval, and verifier outcome are *epistemically* different — the monitor's verdict is *about* the proposer's reasoning; the verifier's outcome is *about* code conformance to spec; a drift event is *about* the relationship between code and intent. The synthesis cites the dominant failure mode of current AI dev tools as "treating 'the AI did a thing' as a single category" (synthesis §Q5 finding 1, lines 398–399). It cites the Google PAIR Guidebook ("Explain for understanding, not completeness," lines 371–372), the Microsoft HAX Toolkit, and the Cursor / Devin / Cody developer-tools-specific work (lines 388–393) as converging on the principle that each distinct AI action type needs its own visual treatment, and that progressive disclosure (summary → detailed steps → technical reasoning trace, line 395) is the right structural pattern.

The synthesis names five action types that already correspond to substrate the project has committed to:

1. **Drift detection** — emitted by the 4-tier semantic diff ladder (tech-spec §3.2 lines 116–119) on `onDidSaveTextDocument` (tech-spec §6 phase 4 line 456). Drift events carry a `kind` discriminator from the §3.2 ladder (`signature_changed | body_semantic | orphan_symbol | orphan_intent | moved`, mirrored in MCP `graph.diff_against_code` at tech-spec.md:386).
2. **Proposal generation** — produced by AgentRunner (tech-spec §2 Pillar 4 lines 89, §6 phase 4 line 457) and surfaced as a `proposed_patch` graph node (tech-spec §2 Pillar 3 line 79). Patches travel through `task.propose_patch` / `task.accept_patch` (tech-spec.md:401–403) and live as `task` nodes (tech-spec §4.1 lines 198–199).
3. **Monitor verdict** — written to `trace_event.monitor_verdict` (tech-spec §4.7 lines 308–309) by the cheap monitor LLM (tech-spec §2 Pillar 5 line 102; ADR-0005). Verdicts carry `{flagged, score, categories[], evidence, recommended_action}` (tech-spec.md:309) and emit a `monitor_flag` graph node (tech-spec §2 Pillar 5 line 102).
4. **Retrieval disclosure** — recorded in `trace_event.retrieved_node_ids` (tech-spec §4.7 line 306) and `retrieval` (tech-spec §4.8 lines 326–340). Retrieval is metadata on other actions (synthesis §Q5 Type 4, line 440: "anti-pattern to avoid: showing retrieval as a separate inbox item").
5. **Verifier outcome** — produced by the verifier scheduler (tech-spec §3.4 lines 128–138; ADR-0016) and recorded as `obligation.status` plus optional `counterexample_node_id` (tech-spec §4.3 lines 233–234). Verifier outcomes attach to obligations (ADR-0019) and surface counterexamples as first-class graph nodes (tech-spec §2 Pillar 3 line 84).

The synthesis's Q5 deliverable is a per-type three-layer disclosure mapping (synthesis lines 412–453): **inbox row → expanded view → detail panel**, with explicit content rules per type at each layer. The synthesis also names cross-cutting visual conventions (lines 449–453): color reserved for type (not severity); confidence communicated by stroke style; source attribution by "Based on:" formatting; monitor verdicts as overlay chevrons rather than competing rows.

The substrate to render this taxonomy lands in Phase 4 (the inbox UI, the drift detection pipeline, the AgentRunner-produced proposals, the monitor LLM gate). The taxonomy is the load-bearing piece because every Phase 4 surface — inbox row layout, expanded-view content, detail-panel field rendering, status-bar interruption rule — inherits from it. Without an explicit commitment, each task will pick a treatment ad-hoc and the result will conflate types visually, producing the failure mode the synthesis names. The decision belongs in an ADR because it constrains the entire Phase 4 webview surface area and any Phase 5 surface that touches AI action presentation (counterexample provenance, verifier-caught toasts, monitor weekly digest).

This ADR commits to the taxonomy as a documented design system axis. It does not specify pixel-level styling — that is downstream UX work — but it does commit to the type set, the layer mapping, the per-type content rules at each layer, and the cross-cutting visual conventions that prevent type collision.

## Decision

**The five AI action types named above are a first-class design axis with documented per-type styling rules across three disclosure layers.** Adding a sixth type or merging two existing types is an ADR-level change, not a Phase 4 task-level change.

### 1. The five types are canonical

The set is closed at the substrate level: every AI action recorded through AgentRunner's `trace_event` row (tech-spec §4.7) is one of these five kinds, where:

- `kind='mutation'` AND the mutation came from drift detection → **Type 1 (drift detection)**.
- `kind='mutation'` AND the mutation came from a generation agent → **Type 2 (proposal generation)**.
- `kind='monitor'` → **Type 3 (monitor verdict)**.
- `kind='retrieval'` → **Type 4 (retrieval disclosure)**.
- `kind='verifier'` → **Type 5 (verifier outcome)**.

`kind='model_call'` and `kind='tool_call'` (tech-spec §4.7 line 297) are *substrate* events, not user-facing action types. They surface inside the trace panel as evidence supporting one of the five user-facing types. They never get their own inbox row.

The taxonomy is **type, not severity**: a Type 5 verifier outcome can be either a positive event ("verifier caught a problem before you saw it" — synthesis §Q5 finding 5, lines 405–407) or a negative event ("verifier failure on `auth/login.ts`"). Severity is orthogonal and is encoded by the inbox-tier system in ADR-0022 plus per-type stroke weight, **not by hue**.

### 2. The three disclosure layers

Each type renders content at three layers per synthesis §Q5 line 458:

- **Inbox row (Layer 1)** — type, headline, confidence cue, keyboard hints, monitor chevron if present. Cognitive purpose: triage (skip / open / act).
- **Expanded view (Layer 2)** — the diff or counterexample, one-sentence AI reasoning, monitor verdict, top-3 sources. Cognitive purpose: accept / reject / investigate decision.
- **Detail panel (Layer 3)** — full natural-language stack, all sources, history, verifier results. Cognitive purpose: deep investigation, edit.

Each type's content per layer is specified in §3 below. Surfaces that present AI actions outside the inbox (e.g., the canvas, the status bar) inherit the Layer 1 styling rules.

### 3. Per-type content rules

The rules below are normative for Phase 4. Phase 5 surfaces (counterexample provenance UI, weekly digests, merge-conflict resolver — see §4 below) inherit from these rules and may add type-specific Layer-2 affordances.

**Type 1 — Drift detection**

- Layer 1 (inbox row): yellow left-border. Headline: code drift on the affected symbol. Subhead: the divergent intent statement. Keyboard: Y (accept drift, update intent) / N (reject drift, fix code) / V (investigate).
- Layer 2 (expanded view): side-by-side current code vs. intent statement, with conflicting bits highlighted; one-sentence summary of the divergence.
- Layer 3 (detail panel): full intent stack + code anchor pointing to the divergent line; decision options inline.

**Type 2 — Proposal generation**

- Layer 1: blue left-border. Headline: AI-generated summary of the proposal. Subhead: confidence cue per ADR-0022 (asserted/inferred/semantic). Keyboard: Y / N / V.
- Layer 2: graph-mutation diff or code-patch diff; AI's stated reasoning (1–2 sentences); monitor verdict if available; source-of-context line ("Based on: …").
- Layer 3: full natural-language stack of affected nodes; the proposal applied as a preview.

**Type 3 — Monitor verdict**

- Layer 1: **annotated onto Type 2 rows, not a separate row** (synthesis §Q5 Type 3, lines 429–432). A small amber chevron at the right edge with a hover-tooltip. Exception: when the monitor's `recommended_action` is `block` (tech-spec.md:309), the verdict is escalated to its own row at Tier 1 of the inbox per ADR-0022. This is the synthesis's "Tier 1 hard stop" analog (lines 432–434), reserved as rare per ADR-0021.
- Layer 2: the verdict in plain language, framed as a teammate observation per ADR-0021.
- Layer 3: not applicable — monitor verdicts attach to the proposing trace event, not to graph nodes. The detail panel for an affected node may list a monitor-flagged history but does not host the verdict directly.

**Type 4 — Retrieval disclosure**

- Layer 1: **not surfaced in the row** (synthesis §Q5 Type 4, line 437: "would clutter"). Exception: in onboarding mode (ADR-0024 territory), the row may show a compact "Based on: N sources" hint to teach users what the AI is reading.
- Layer 2: a "Based on:" line at the bottom of the expanded view listing up to 3 sources with click-through.
- Layer 3: the detail panel for a node that the AI generated or modified shows a "context used" section listing what the AI retrieved when generating it.

**Type 5 — Verifier outcome**

- Layer 1 (failure): red left-border. Headline: verifier failure on the affected symbol. Subhead: counterexample summary. Keyboard: Y (acknowledge, view counterexample) / N (mark as false positive — requires reason per ADR-0022's structured-override-reason rule).
- Layer 1 (success, when proactively surfaced): no separate row; aggregated into a status item ("verifier caught X proposals this week") per Phase 5 task work.
- Layer 2: concrete counterexample — the failing input, the failing output, the contradicted intent or constraint, the inference path. Per the counterfactual provenance principle (synthesis §Q5 line 505).
- Layer 3: verifier history attached to each constraint per ADR-0019's load-bearing-vs-informational distinction; last-N runs visible.

### 4. Cross-cutting visual conventions

These apply to every type and every layer. They prevent the cross-type collisions the synthesis warns against.

- **Color is reserved for type, not severity.** The exception is red = verifier failure (Type 5), retained because it is universal enough that overriding it would be more confusing than consistent. Severity within a type is communicated by inbox tier (ADR-0022) and by border weight, **not by hue.**
- **Confidence is communicated by stroke style** (solid / dotted / question-mark / auto-badge), per ADR-0022. Stroke style is cross-cutting — it applies to nodes in the canvas, rows in the inbox, and fields in the detail panel.
- **Source attribution uses a consistent "Based on:" formatting** across types, with click-through to source. This appears in Layer 2 for Types 2 and 4, and in Layer 3 for any node that the AI generated or modified.
- **Monitor verdicts use a consistent chevron** that overlays other types rather than competing for row space. Chevron color (amber for hedge, escalating for block) is the only place monitor severity is encoded outside Tier 1 escalation.

### 5. The taxonomy is documented as code, not just prose

The Phase 4 webview package (`packages/webview`) commits a design-system module — concretely a `packages/webview/src/design-system/decision-types.ts` (or equivalent) — that exports:

- A `DecisionType` discriminated union over the five types, mapped from `trace_event.kind` and the `mutation` source where applicable.
- Per-type style tokens (border color, default keyboard binding, default Layer-1 content shape).
- Per-layer content adapters (input: `trace_event` row + linked `node` rows; output: structured Layer-1/2/3 props).

This module is the single source of truth for type styling. Every inbox row, expanded view, and detail-panel field that renders an AI action imports from this module. Surfaces that fork the styling (e.g., a one-off canvas annotation) violate this ADR and require the surface to either consume the module or open a follow-up ADR.

### 6. What is *not* in scope

This ADR does **not** specify:

- Pixel-level styling, font choices, or specific color values. Those are downstream UX work, constrained by §4 above.
- The inbox sort algorithm or tier assignment. ADR-0022 (categorical encoding for confidence and severity) owns that.
- The specific language of monitor verdicts. ADR-0021 (monitor LLM presentation framing) owns that.
- The merge-conflict inbox row type. ADR-0023 (branch-and-review) introduces a sixth type at the Phase 5 boundary; this ADR is forward-compatible because the type set is open to ADR-level extension.
- The provenance preservation rule on edits. ADR-0024 owns that and surfaces in the detail-panel Layer-3 rendering of any node with confidence cue.

## Schema implications

**No DDL change.** The taxonomy reads existing columns:

- `trace_event.kind` (tech-spec.md:297) provides the substrate discriminator.
- `node.confidence` (tech-spec.md:177) drives the stroke-style cross-cutting rule.
- `obligation.status` and `obligation.counterexample_node_id` (tech-spec.md:231–234) drive Type 5 rendering.
- `trace_event.monitor_verdict` (tech-spec.md:309) drives Type 3 chevron logic.
- `trace_event.retrieved_node_ids` (tech-spec.md:306) drives Type 4 source attribution.

The decision-types module adds an application-layer mapping but no new columns and no migration.

## Implementation implications

- `packages/webview/src/design-system/decision-types.ts` (new) — discriminated union, per-type style tokens, per-layer content adapters. Phase 4 task list amendment.
- `packages/webview/src/inbox/InboxRow.tsx` (new in Phase 4) — consumes `decision-types.ts` for Layer 1 rendering.
- `packages/webview/src/inbox/ExpandedView.tsx` (new in Phase 4) — consumes for Layer 2.
- `packages/webview/src/detail-panel/*` (extends existing Phase 3 detail panel) — consumes for Layer 3.
- `packages/shared/src/protocol/decision-events.ts` (new) — the wire-format mapping from `trace_event` rows to `DecisionType` events that the extension forwards to the webview.

The Phase 4 task list amendment includes a task that lands the `decision-types.ts` module and the protocol mapping before the inbox-row task, so every subsequent task can import from a single source of truth.

## Consequences

What this enables:

- **Every Phase 4 surface that renders an AI action inherits a known styling rule.** Cross-task consistency is enforced by the module, not by reviewer vigilance.
- **The synthesis's "explain for understanding, not completeness" principle becomes operational.** Layer 1 carries triage information; Layer 2 carries decision-supporting evidence; Layer 3 carries everything else. Each layer's content is type-aware.
- **The monitor's role as "teammate observation, not audit"** (ADR-0021) is supported visually: the chevron-overlay rule prevents monitor verdicts from looking like a separate severity dimension.
- **The substrate from ADR-0005 (faithfulness via architecture) becomes legible.** `trace_event` rows already carry the discriminator the taxonomy needs; the taxonomy is the user-visible projection of the substrate's epistemic distinctions.
- **Phase 5 surfaces extend the taxonomy by ADR.** A new type (e.g., the merge-conflict type from ADR-0023) lands as an ADR-level addition, which is the right scrutiny level given the cross-surface impact.

What this costs:

- **Adding a new type is non-trivial.** A future AI action kind (e.g., a "monitor disagreement-with-verifier" cross-event) requires an ADR amendment, not a Phase 4 ticket. This is intentional — the taxonomy's value comes from being closed.
- **The webview holds the canonical type-styling table.** The extension and skill packages don't render AI actions directly, so they don't need this module — but the mapping from `trace_event.kind` to `DecisionType` lives in `packages/shared`, which means the wire format becomes a contract that mid-Phase-4 changes have to honor.
- **Color-as-type forecloses color-as-severity.** A future request to "color critical drift events red" violates the rule and must be addressed via tier or border weight instead. This is consistent with the synthesis's cross-cutting visual conventions but may surprise contributors importing patterns from other dev tools.
- **The per-type Layer rules constrain UX revisions.** Once a type's Layer 2 content rule is committed, changing it (e.g., moving "AI's stated reasoning" from Layer 2 to Layer 3) is an ADR amendment.

## Alternatives considered

- **A single "AI action" type with severity-based styling.** Rejected. This is the failure mode the synthesis names (§Q5 finding 1, line 398): conflating the five types visually destroys the user's ability to predict what kind of mistake the system is making, which the trust-calibration literature (Q1 finding 2, lines 46–47) identifies as the precondition for selective trust. A single-type styling collapses the epistemic differences into a homogeneous "AI did a thing" surface.
- **Per-action-kind styling without a fixed type set.** Tempting because every new AI capability could specialize. Rejected because the result is the failure mode in a slower form: each Phase 4 / Phase 5 task picks its own treatment, and the cumulative effect is the conflated UI the synthesis warns against. Closing the type set at five (extensible only by ADR) is the load-bearing constraint.
- **Defer the taxonomy to a Phase 4 follow-up after the inbox lands.** Rejected. The synthesis's recommendation Q5 #1 is explicit: build the taxonomy *before* implementing the trace panel, "and the panel will then assemble itself" (line 21). Deferring forces a retrofit across multiple Phase 4 surfaces against authorship that has already committed ad-hoc styling.
- **Defer the design-system module to Phase 5.** Rejected for the same reason as the previous alternative — the substrate it organizes is Phase 4 substrate, and committing it after the surfaces ship requires re-touching every surface. The cost of the module up-front is small (one file, ~150 lines of TypeScript with type tokens and a discriminated union); the cost of retrofitting is multiplicative.
- **Encode the type-to-style mapping in CSS variables only, no TypeScript module.** Rejected because the per-layer content adapters (e.g., "Layer 2 for Type 2 includes monitor verdict if available") are conditional logic, not just style tokens. CSS variables can hold the colors but cannot express the layer's content shape.

## References

- `docs/research/ux-research-synthesis.md` §Q5 (lines 365–525) — full state of the legibility-taxonomy literature, the per-type three-layer rules, and the cross-cutting visual conventions.
- `docs/research/ux-research-synthesis.md` §Cross-Cutting Themes #4 (lines 629–632) — "Per-decision-type, not per-AI-action" as a cross-question principle.
- `docs/research/phase-coverage-matrix.md` rows P4.14, P4.15, P4.16, P4.17 — the matrix entries this ADR closes.
- tech-spec.md:289–323 — `trace_event` DDL providing `kind`, `monitor_verdict`, `retrieved_node_ids`.
- tech-spec.md:170–199 — `node` DDL providing `confidence` and per-kind body shapes.
- tech-spec.md:223–238 — `obligation` DDL providing `status` and `counterexample_node_id`.
- tech-spec.md:386 — `graph.diff_against_code` MCP tool providing the drift discriminator (`orphan_symbol | orphan_intent | signature_changed | body_semantic | moved`).
- ADR-0005 (faithfulness via architecture) — the substrate that produces the `trace_event` rows the taxonomy reads.
- ADR-0016 (verifier interface) — the substrate that produces Type 5 outcomes.
- ADR-0019 (obligation attachment semantics) — the load-bearing-vs-informational distinction the Type 5 detail-panel rendering inherits.
- ADR-0021 (monitor LLM presentation framing) — co-authoritative on Type 3 language and language rules.
- ADR-0022 (categorical encoding for confidence and severity) — co-authoritative on the stroke-style and tier conventions referenced here.
- ADR-0023 (branch-and-review for graph state) — introduces a sixth type (merge-conflict) at the Phase 5 boundary; this ADR is forward-compatible.
- ADR-0024 (provenance preservation on edits) — affects detail-panel Layer 3 rendering for nodes with confidence cue.
