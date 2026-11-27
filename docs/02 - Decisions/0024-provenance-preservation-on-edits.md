# ADR 0024 — Provenance preservation on edits: confidence flags downgrade only on explicit assertion

## Status

Accepted 2026-05-03.

## Context

The `node` table's `confidence` column (tech-spec §4.1 lines 177–178) is a four-state enum — `extracted | inferred | semantic | asserted` — that records *who* introduced the node's content and *with how much epistemic warrant*. ADR-0022 commits to this enum as a user-facing primitive; this ADR addresses how it transitions across edits.

The substrate question this ADR closes is straightforward and load-bearing:

> When the AI extracts an intent statement from existing code (creating a node with `confidence='inferred'`), and a human later edits that intent's prose, what is the new value of `confidence`?

Tech-spec is silent. The Drizzle schema accepts any value; the application layer has no transition rule. Two answers are plausible at first glance, and neither is right by default:

1. **"Edit downgrades confidence to `asserted` automatically."** Wrong. An AI-inferred intent that a human lightly cleans up (fixes a typo, tightens a phrase) is not thereby asserted by the human — the human has not committed to the underlying claim, only to the surface text. Auto-promoting to `asserted` produces the failure mode the UX research synthesis names directly.
2. **"Edit preserves confidence at whatever it was before."** Wrong as a default for the opposite reason — when a human *does* explicitly assert (rewrites the intent from scratch with the conviction "this is what we want"), the system has no signal of the assertion, and the intent stays `inferred` against the human's actual epistemic state.

The UX research synthesis at `docs/research/ux-research-synthesis.md` flags this directly in the "Mental-Model Gap Between AI and Human" adjacent finding (lines 547–555). Citing the AI confabulation literature (Edwards 2023; Wolters Kluwer 2024; arXiv 2503.05806; PMC 10619792), the synthesis names "AI generating *plausible intent* the human didn't actually have" as the most dangerous form of confabulation in IntentGraph specifically (line 550): "If the AI extracts intent from code and writes 'the system intentionally allows expired tokens within a grace window' when in reality the code has a bug that allows expired tokens, the human reader has no way to distinguish AI-confabulated-intent from human-asserted-intent without provenance."

The synthesis's resolution (lines 552–553) is precise: "**This is precisely what the asserted/inferred/semantic/extracted confidence encoding solves** — but only if it's reliably maintained. The risk is that over time, inferred intents get edited by humans and lose their provenance. The fix is a *provenance-preserving edit history* on every node: when a human edits an inferred intent, the edit is timestamped and the inferred-flag downgrades only when the user explicitly asserts. Otherwise, the field stays inferred."

The Massenon et al. study (synthesis line 555; PMC 12365265) on user-reported LLM hallucinations in 3M mobile-app reviews found "false confident assertion" as the most common category of hallucination. The synthesis closes the section: "**the confidence visual encoding is doing real epistemic work and should not be deprioritized as a styling concern.**"

The Phase 3 substrate writes back to markdown via `intent.upsert` (tech-spec §6 phase 3 line 451) — meaning a human edit to `/spec/intents/auth.md` triggers a chokidar rebuild that updates the SQLite projection. Today, that path has no transition rule for `confidence`. The Phase 4 drift detection pipeline produces inferred and semantic intents from `intent.extract` (tech-spec §6 phase 4 line 458); humans then edit those intents. Phase 5 amendments include the resolver UI (ADR-0023) which is another source of human edits to AI-introduced material.

Without a transition rule, three failure modes are likely:

1. **Silent promotion:** the implementer of `intent.upsert` defaults to "treat any human-side edit as asserted" because that is the simplest write path. Every typo fix promotes the intent. The confabulation-as-asserted risk realizes.
2. **Silent preservation:** the implementer defaults to "preserve confidence at whatever the prior row had" because that is the next-simplest. A human writing a brand-new, fully-considered intent over an inferred draft leaves the intent `inferred`, and the user-facing surface continues to show the dotted stroke that says "AI is unsure."
3. **Per-call ambiguity:** different write paths choose differently (markdown sync via chokidar uses one rule, the TipTap node editor uses another, the resolver UI uses a third). The four-state enum becomes meaningless because its semantics are implementation-defined per surface.

This ADR commits to an explicit transition rule that prevents all three failure modes. The rule is: **confidence downgrades (in the strength order from ADR-0022) only on explicit user assertion; otherwise, the prior confidence is preserved.** Explicit assertion is named below.

## Decision

**Confidence is preserved across edits unless the user takes an explicit assertion action.** Five sub-decisions specify the rule.

### 1. The transition rule

The strength ordering from ADR-0022 §1 is `asserted > inferred > extracted > semantic` (asserted strongest; semantic weakest because it is interpretive). For the transition rule, this ADR uses the term "stronger-than" with that ordering.

**The transition rule:** on any write to `node.body` for an existing row, the new `confidence` is computed as:

```
new.confidence = max(prior.confidence, write.declared_confidence)
```

where `max` is by the strength ordering, and `write.declared_confidence` is the explicit confidence the writer is claiming (defined in §2 below). If the writer does not declare a confidence, `write.declared_confidence` defaults to `prior.confidence` — meaning the row stays where it was.

Concretely:

- An AI-inferred intent (`prior.confidence='inferred'`) that a human edits *without* declaring assertion → stays `inferred`.
- An AI-inferred intent that a human edits *with* an explicit assertion action → becomes `asserted`.
- An asserted intent that the AI later refines (e.g., a drift-fix proposal that updates the prose) → stays `asserted` because the AI's `inferred` declaration cannot reduce the prior `asserted`.
- An extracted intent (e.g., from frontmatter) that a human edits without assertion → stays `extracted`. Mechanical extraction is not weaker than human casual editing; both leave the intent at the substrate's confidence.
- A semantic intent (e.g., LLM-extracted from prose) that a human edits without assertion → upgrades to `inferred` if the prior body changed materially, because the human's edit is a stronger epistemic action than the LLM's interpretive extraction. (The detail of "materially" is in §3 below.)

The asymmetric one-way nature is the load-bearing constraint: confidence can only go *up* the strength ordering through this transition rule. Going *down* requires an explicit "demote confidence" action (§4 below), which is rare and out-of-band.

### 2. What counts as explicit user assertion

Three concrete actions count as the user explicitly asserting a node's content:

- **Clicking an "Assert this" affordance in the detail panel.** A button or keyboard shortcut (suggested: `A`) that explicitly promotes the node to `asserted`. The user is making an in-product, in-the-moment claim that the content is right.
- **Authoring the node from scratch.** A user creating a new node — via the canvas's "new node" affordance, or by writing a brand-new `/spec/intents/<id>.md` file with frontmatter — sets `write.declared_confidence='asserted'` by default. The user is committing to material they wrote themselves.
- **Resolving a drift event in the "update intent to match code" direction with explicit assertion.** When the drift resolver (Phase 4) offers "accept drift, update intent" (per ADR-0020 §3 Type 1 keyboard `Y`), the action carries an explicit checkbox/option labeled "I assert this is the new intent." The default state of the checkbox is unchecked — the user must affirmatively check it. If unchecked, the intent is updated but `confidence` is preserved. This nuance respects the synthesis's rule: a human accepting an AI-flagged drift is not thereby asserting; assertion requires explicit affirmation.

The three actions are exhaustive for v1. A future affordance (e.g., explicit assertion via a CLI flag during markdown round-trip) would be added by ADR amendment — the discipline is that the set of assertion-producing actions is closed and audit-traceable.

### 3. What does NOT count as explicit user assertion

The following actions are explicitly NOT assertion, even though they are human-initiated and modify the node:

- **Editing prose in TipTap inside the detail panel.** A user fixing a typo, rephrasing for clarity, or expanding a description through the editor is editing the surface; no confidence change. The Yjs Y.Doc at the node-text granularity (tech-spec §3.5 line 144; ADR-0023 §2) does not assert — it coedits.
- **Editing markdown in `/spec/*.md` files directly.** The user opens VS Code, types into the markdown file, saves. The chokidar watch (Phase 3, tech-spec line 451) rebuilds the SQLite projection. No assertion. The user may have made a casual edit; the transition rule preserves prior confidence.
- **Accepting an AI proposal that includes a node creation or modification.** Per ADR-0021's framing, accepting an AI proposal is the user choosing to apply it; the underlying confidence on the resulting node is the AI's declared confidence (typically `inferred`), not `asserted`. Users who want the result to be asserted use the explicit "Assert this" affordance afterward.
- **Resolving a merge conflict by selecting "Use yours" or "Use theirs."** The merge resolver (ADR-0023 §4) preserves the chosen branch's confidence on the merged node. The user is not asserting by selecting a branch; they are picking which existing version survives.
- **Resolving a merge conflict by writing a third version.** The user is composing new prose under merge pressure, which is more than a typo but less than a deliberate assertion. The default is to set the confidence to the *stronger* of the two branches' confidence on that field; the user can promote to `asserted` afterward via the explicit affordance. This is the only case where merge-resolver authorship interacts with confidence beyond preservation, and it is a deliberate choice to err on the side of *not* auto-asserting.

The "materially changed" qualifier in the §1 rule for `semantic → inferred` upgrade applies here: a typo fix or whitespace normalization is not material. Materiality is determined by a normalized-prose hash comparison (e.g., normalize whitespace and case, then hash; if hashes differ, the change is material). The hash comparison lives at the application layer in `node.body` write handlers; the implementation detail is downstream of this ADR but the boundary is named.

### 4. Demotion is rare and out-of-band

Going *down* the strength ordering — e.g., demoting an `asserted` intent back to `inferred` — is not part of the routine transition rule. It happens only through:

- **Explicit "demote confidence" action**, requiring a typed reason (per ADR-0022's structured-override-reason rule). The reason lands in `event_log` as `kind='confidence.demoted'` with the prior and new values plus the reason. This is the audit-traceable path.
- **Substrate-level changes** that legitimately reduce confidence — for example, if a future tooling enhancement makes "asserted" reachable via a lower-friction action and we need to demote prior asserted nodes that were created under the higher-friction action. That kind of bulk demotion happens through a migration with a clear ADR amendment, not through the routine write path.

The asymmetric default (write paths can promote confidence on explicit assertion; demotion requires out-of-band action) is the load-bearing posture: confidence is precious and the system errs on the side of preserving the stronger epistemic state.

### 5. Audit trail

Every write to `node.body` that involves an explicit assertion (the three actions named in §2) emits an `event_log` row with `kind='node.asserted'`. The payload includes the node id, the prior confidence, and the action that triggered the assertion (one of `assert_button | new_node | drift_accept_with_assertion`). The hash-chained `event_log` (tech-spec §4.6) preserves the assertion sequence.

Routine writes that do not change confidence (the typo-fix case) do not emit an `event_log` row specifically for confidence — the existing `node.updated` event log entry already records the body change; the confidence transition is implicit ("preserved").

The `intentgraph-spec-writer` skill checks this discipline at author time: when the skill is helping a user edit an intent, it does not auto-promote the node's confidence and does not pre-check the "I assert this" checkbox in drift resolution. The skill discipline is consistent with this ADR's substrate rule.

The QA pass (`/qa`, ADR-0013/0014) reads the assertion `event_log` entries when reviewing commits that touch nodes with `confidence` transitions — a commit that promotes ten nodes from `inferred` to `asserted` without ten matching `node.asserted` events is a flag.

## Schema implications

**No DDL change.** The transition rule reads existing columns:

- `node.confidence` is the existing four-state enum.
- `node.version` is the existing OCC field; transitions are atomic per the OCC compare-and-set already in tech-spec §3.3.
- `event_log.kind` accepts new application-layer values (`node.asserted`, `confidence.demoted`) per the existing free-form `kind TEXT NOT NULL`.

The Drizzle write helpers in `packages/skill/src/db/` add the transition rule at the application layer. The Zod schema for write inputs (in `packages/shared/src/schemas/node.ts`) gains an optional `declared_confidence` field; the row schema is unchanged.

## Implementation implications

- `packages/skill/src/db/node-write.ts` (or equivalent) — implements the §1 transition rule on every `node.body` write. Single chokepoint, mirroring the AgentRunner-only chokepoint pattern from ADR-0005.
- `packages/skill/src/parser/spec-md/` (existing per Phase 2 task `p2-t04`) — when the markdown sync writes, it never declares `asserted`; the transition rule preserves prior confidence. New-file creation (a `/spec/intents/<id>.md` that didn't exist) is treated as "new node" per §2 and gets `asserted`.
- `packages/extension/src/commands/assert-node.ts` (Phase 4 task) — the in-detail-panel "Assert this" action; emits `event_log.kind='node.asserted'`.
- `packages/webview/src/inbox/DriftResolver.tsx` (Phase 4 task per ADR-0020 Type 1) — the "I assert this" checkbox on the drift-accept flow, default unchecked.
- `packages/webview/src/merge/Resolver.tsx` (Phase 5 task per ADR-0023) — preserves the selected branch's confidence; "Write a third" defaults to the stronger of the two branches.
- `.claude/skills/intentgraph-spec-writer/SKILL.md` — discipline note on never auto-promoting confidence and never pre-checking the assertion checkbox. Same for `.codex/skills/`.

The Phase 4 task list amendment includes a task that lands the `node-write.ts` chokepoint and the assertion-event log convention; downstream tasks (drift resolver, merge resolver, assert-button affordance) consume the chokepoint.

## Consequences

What this enables:

- **The four-state confidence enum stays meaningful across the system's lifetime.** Users can rely on a dotted stroke meaning "the AI proposed this and no human has yet asserted it"; that meaning does not silently degrade as the codebase evolves.
- **The synthesis's confabulation risk is mitigated at the substrate level.** AI-inferred-then-human-edited intents stay flagged as inferred until the user explicitly asserts; a reader looking at the canvas can distinguish AI-confabulated content from human-committed content with reliable signal.
- **The audit/replay tool (Phase 5) gains a clean assertion timeline.** The hash-chained `event_log` carries a complete record of when each node moved into `asserted`, by which user, through which action.
- **The QA pass has a discipline check.** A commit that quietly bumps 50 nodes to `asserted` without matching `node.asserted` events is detectable; the QA pass can flag the divergence.
- **Cross-surface consistency.** Markdown sync, TipTap edits, drift-resolver, merge-resolver, AgentRunner — all six write paths use the same transition rule. There is no surface where editing means "promote to asserted" by accident.

What this costs:

- **Users sometimes have to take an extra action to assert.** A user who deliberately rewrites an intent with conviction and then realizes the dotted stroke is still showing must click "Assert this" or check the drift-resolver checkbox. The synthesis's stance on this is the right one: the friction is the protection. But the pattern has to be taught — the onboarding (per coverage matrix P4.10's three pre-curated items) should include an example of explicit assertion.
- **The "third version" default in merge resolver is conservative.** Setting confidence to the *stronger* of the two branches when the user composes a third version is an arbitrary choice; the alternative ("set to weaker," "set to neither and require explicit declaration") is also defensible. This ADR picks "stronger" and accepts that some users will want to demote afterward.
- **Demotion is friction-heavy.** A user who wants to step back from an `asserted` claim (e.g., realized after acceptance that the intent is wrong) must use the structured-override-reason path. This is intentional but contributes to the asymmetry — it is easier to assert than to retract — which over time may produce a graph that overstates how much is asserted.
- **The transition rule is application-layer only, not DB-enforced.** A buggy or adversarial writer could bypass the rule by writing directly through Drizzle. The single chokepoint pattern (§Implementation implications) is the protection; it is the same protection AgentRunner provides for model calls (ADR-0005). ADR-0019's pattern of "discipline at the application layer, not enforcement at the DB" is mirrored here.
- **Material-change detection requires a normalized hash comparison.** The detail (whitespace normalization, case folding, possibly punctuation) is downstream and may produce edge cases (does adding a markdown link count as material?). Phase 4 task work includes the spec for materiality; this ADR commits to the principle but defers the algorithmic detail.

## Alternatives considered

- **Always preserve prior confidence; provide no auto-promotion path.** Tempting because it is the simplest rule and avoids any silent promotion failure mode. Rejected because the absence of an in-product assertion path makes the four-state enum slowly become meaningless: every node remains at its initial value (typically `inferred` for AI-introduced material), and `asserted` becomes unreachable except through ADR-amendment-style migration. Users would have no way to communicate "this is right" to themselves or their team. The explicit-assertion path closes this gap.
- **Auto-promote on any human edit.** The synthesis explicitly forbids this (lines 552–553). Rejected for the same reason this ADR exists: it produces the confabulation-as-asserted failure mode.
- **Promote based on edit-size heuristic.** "If the user changed >50% of the prose, treat as assertion." Rejected because the heuristic's edge cases create user-facing surprises (a 49% edit is not asserted; a 51% edit is) and because the synthesis's principle is that *explicit* assertion is the bar. Heuristic assertion is implicit assertion.
- **Promote based on time-spent heuristic.** "If the user spent >30 seconds editing, treat as assertion." Rejected for the same reason as edit-size and additionally because the heuristic surfaces editing speed as a confidence signal, which is wrong on its face (a slow editor is not more committed than a fast one).
- **Make promotion the default in the drift-resolver "accept drift" flow.** The default state of the assertion checkbox would be checked, requiring uncheck for non-assertion. Rejected because the synthesis's rule (line 553: "downgrades only when the user explicitly asserts") implies the assertion is opt-in. Default-checked is opt-out, which is implicit assertion.
- **Track confidence per-field rather than per-node.** A future state where each field of a node body (`description`, `acceptance_criteria`, etc.) has its own confidence value. Rejected for v1 because (a) the substrate enum is per-node (tech-spec §4.1 line 178), (b) the per-field model multiplies the surface area for transitions, and (c) the synthesis names the per-node encoding as "doing real epistemic work" without per-field granularity. A future ADR may revisit.

## References

- `docs/research/ux-research-synthesis.md` Adjacent Findings §"The Mental-Model Gap Between AI and Human" (lines 547–555) — the confabulation finding and the provenance-preservation rule.
- `docs/research/phase-coverage-matrix.md` row P4.19 — the matrix entry this ADR closes.
- tech-spec.md:177–178 — the four-state `confidence` enum.
- tech-spec.md:273–286 — `event_log` shape; this ADR adds application-layer `kind` values.
- tech-spec.md:451 — the markdown sync write-back path (Phase 3) that this ADR's transition rule applies to.
- tech-spec.md:458 — `intent.extract` (Phase 4) that produces inferred intents the rule preserves through subsequent edits.
- ADR-0005 (faithfulness via architecture) — the chokepoint pattern this ADR's `node-write.ts` mirrors.
- ADR-0009 (spec frontmatter schema) — the markdown projection whose round-trip the transition rule preserves.
- ADR-0019 (obligation attachment semantics) — the precedent for "discipline at the application layer, not enforcement at the DB."
- ADR-0020 (per-decision-type legibility taxonomy) — the Type 1 (drift) keyboard binding `Y` whose flow this ADR amends with the assertion checkbox.
- ADR-0022 (categorical encoding for confidence and severity) — the strength ordering this ADR's transition rule uses.
- ADR-0023 (branch-and-review for graph state) — the merge-resolver flow whose interaction with confidence this ADR specifies.
- Synthesis cited primary sources: Edwards 2023; Wolters Kluwer 2024; arXiv 2503.05806; PMC 10619792; Massenon et al. PMC 12365265.
