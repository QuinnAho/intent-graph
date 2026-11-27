# UX Research — Open Questions for Human Resolution

**Status:** Draft (architect skill output, awaiting human review).
**Source:** [`docs/research/ux-research-synthesis.md`](./ux-research-synthesis.md) §Risks and Unknowns (April 2026), plus the synthesis's "Recommended early user-testing priorities" list.
**Purpose:** Surface the questions the research literature cannot answer for IntentGraph specifically. List the synthesis's own user-testing priorities. Tag each question as resolvable by spike work, real-user testing, or deferred to v1.

The synthesis is opinionated about the strength of its evidence base (lines 731–746) and explicit about contradictions the design must navigate (lines 748–751). The questions below are not the synthesis's recommendations — those are catalogued in `phase-coverage-matrix.md`. These are the questions left *open* by the synthesis itself.

## How to read this

Each open question carries:

- **Question** — what's actually unresolved.
- **What the synthesis says** — citation to the synthesis line where the question is named or implied.
- **What we don't know** — the empirical or product gap.
- **Resolution path** — one of: **spike**, **user-test**, **defer-until-v1**, **defer-until-v1.1**, **defer-until-telemetry-exists**.
- **Blast radius** — what the wrong answer costs.

The five highest-priority questions appear at the top in the "User testing — must happen before Phase 5 freeze" section (the synthesis's own priority list, line 759). The remainder are grouped by category.

---

## User testing — must happen before Phase 5 freeze

The synthesis's recommended early user-testing priorities (lines 760–764). Each requires real users; none can be answered by spike or telemetry alone.

### 1. Monitor-verdict framing — A/B test (audit vs. teammate language)

**Question.** Does the teammate framing committed in ADR-0021 produce measurable behavioral differences vs. an audit framing baseline?

**What the synthesis says** (line 760, also Cross-Cutting Theme #3 lines 626–628). "A/B test with 10–20 users, measure both subjective comfort and behavioral change."

**What we don't know.** The published research base on monitor-LLM verdicts as a user-facing element is "almost no published research" (line 743). The closest analogs (CDS alerts, static-analysis warnings) produce override rates 49–96% in the audit framing. We have no empirical evidence that the teammate framing IntentGraph commits to actually moves the rate.

**Resolution path.** **User-test** before Phase 5 freeze. 10–20 users, two arms (audit copy vs. teammate copy from ADR-0021 §1), measure both subjective ("does this feel adversarial?") and behavioral (override rate, time-to-decide, false-positive marks).

**Blast radius.** ADR-0021 is load-bearing for the entire monitor surface. If the framing moves the rate the wrong way, the ADR has to amend (or be superseded) before Phase 5 surfaces harden. The synthesis is explicit (line 743): "**This is the riskiest area of the design and deserves the most user-testing investment.**"

### 2. Two row layouts — eye-tracking study

**Question.** Do users actually read the second line of the uncertain-row layout (the AI's stated reason for uncertainty)?

**What the synthesis says** (line 761): "eye-tracking study to verify users actually read the second line."

**What we don't know.** The two-row layout is committed in ADR-0020 (§3 Type 2) and Phase 4 task `p4-r06`. The behavioral assumption — that the second line is read enough to alter decisions — has no direct empirical support in the synthesis; it is a reasonable inference from PAIR's "support the user's next decision" principle but not a tested claim for this layout.

**Resolution path.** **User-test** with eye-tracking or scroll/dwell instrumentation. ~10 users navigating a realistic inbox of 20 uncertain rows.

**Blast radius.** If users skip the second line, the layout is decorative — they get the same triage decision they would get from a single-line confident-row layout, without the autonomy benefit of the V (investigate) primary keybinding. Phase 4 amendment lands.

### 3. Merge-conflict resolver — task-completion testing

**Question.** Can users actually resolve realistic merge conflicts using the resolver UI committed in ADR-0023?

**What the synthesis says** (line 762): "task-completion testing with realistic conflict scenarios."

**What we don't know.** The resolver is committed in ADR-0023 §4 with field-by-field per-field options. The UX has no direct industrial analog — Figma branching is the closest but its "structured units" (frames, components) differ from intent-statement prose. The semantic-divergence indicator (an AI-generated prose summary routed through the monitor) is novel.

**Resolution path.** **User-test** with prepared conflict scenarios drawn from realistic IntentGraph merges (e.g., the "expired tokens" scenario from synthesis lines 296–317). Measure task completion rate, time, errors (selected wrong branch's content), and confidence.

**Blast radius.** ADR-0023 is Phase 5's substrate decision. If the resolver UX fails task-completion testing, the substrate stays valid (the three-tier state model is independent of UI), but the resolver UI requires redesign before external pilot users (Phase 6).

### 4. Onboarding inbox-first vs. canvas-first — split test

**Question.** Does the inbox-first onboarding (ADR-coverage P4.9) actually produce better time-to-first-meaningful-edit than a canvas-first alternative?

**What the synthesis says** (line 763): "split test with new users, measure time-to-first-meaningful-edit."

**What we don't know.** Synthesis Q3 finding 1 (lines 192–193) argues canvas is the wrong starting point because "a node-link diagram of a complex system is overwhelming to a newcomer." The inbox-as-onboarding-default recommendation is well-grounded in the Linear/Notion industrial analog but has no IntentGraph-specific data.

**Resolution path.** **User-test** with new engineers (target Day-4-to-5 first edit per synthesis Q3 line 217). Two arms: inbox-first (ADR commitment) vs. canvas-first. Measure time to first meaningful edit, subjective overwhelm rating, retention through Day 7.

**Blast radius.** Phase 4 task `p4-r15` ships the inbox-first default. If canvas-first wins the test, the default flips and the auto-expanded detail panel logic adapts. Lower-blast than #1–#3 because the surface change is bounded.

### 5. "Highest-leverage next item" — usability testing

**Question.** Is the Cmd-Shift-Enter "highest-leverage next item" jump actually used? If not, retire it.

**What the synthesis says** (line 764): "usability testing to verify it gets used; if not, retire."

**What we don't know.** The synthesis explicitly tags this affordance as "derived from reasoning, not from research" (line 745, "no direct empirical analog"). Phase 4 task `p4-r10` ships it as a v1 hypothesis with the `[A/B before hardening]` tag.

**Resolution path.** **User-test** through 4-week telemetry: how often is the keybinding pressed? On what kinds of inboxes (small vs. large)? Do users who use it have lower review fatigue (per ADR-0022 acceptance-rate signals)?

**Blast radius.** Tiny — retire the keybinding if unused. The tier sort itself (which the keybinding consumes) stays.

---

## Spike-resolvable questions

Questions where focused engineering investigation, not user testing, produces the answer.

### 6. The right N for the "unread accepts" trigger

**Question.** Is 9-of-10 the right threshold for the per-type acceptance-rate watcher's protective banner (Phase 5 task `p5-r12`)?

**What the synthesis says** (line 754): "Picked 9-of-10 by analogy to Tesla; needs A/B testing." But the underlying question — is there a heuristic basis for picking N at all? — is also open.

**What we don't know.** Tesla's strikeout system uses 5 inattentiveness events suspending FSD for a week. The translation 5→9 is justified by the lower stakes of code-acceptance vs. driving, but no number is empirically grounded for IntentGraph.

**Resolution path.** **Spike** + **A/B test**. The spike: instrument the inbox to record per-user, per-type acceptance streaks during dogfood (Phase 4 onward, before the trigger ships). Use the dogfood telemetry to find the natural inflection point where the system begins to mis-accept (e.g., when does verifier-found-bad-accept show up?). Then A/B test thresholds around the inflection point.

**Blast radius.** Wrong N produces either nuisance banners (too low, fatigue and dismissal) or no protection (too high, the synthesis's deskilling failure mode).

### 7. The right session-length threshold for take-a-break interventions

**Question.** Is 45 minutes the right take-a-break threshold (Phase 5 task `p5-r13`)?

**What the synthesis says** (line 755): "Picked 45min as a soft floor of SmartBear's 60–90; needs personalization."

**What we don't know.** SmartBear's data is for code review, not for AI proposal review. The cognitive load is plausibly different (proposal review may be more decision-dense per minute and therefore have a steeper fatigue curve).

**Resolution path.** **Spike** through dogfood telemetry (continuous review session length + per-session accuracy via post-hoc verifier agreement). The spike is bounded — measure for 4 weeks during Phase 4–5 dogfood, find the per-user inflection points, set the initial threshold to the cohort median. Personalization (v1.1 task `v11-r02`) layers on top.

**Blast radius.** Wrong threshold is a UX nuisance (banner fires too early or too late) but not architecturally significant. Per-user personalization in v1.1 mitigates either failure mode.

### 8. Yjs at 1000+ Y.Docs in one webview (tech-spec §7-E)

**Question.** Does Yjs at the per-node-text granularity scale to 1000+ Y.Docs in a single webview (the IntentGraph case at L2+)?

**What the synthesis says.** Cross-references tech-spec §7-E (line 517): "Per-node Y.Doc is conceptually clean but unbenchmarked at 1000+ docs in one webview. **Open call:** prototype 1000 Y.Docs in a stress page in Phase 3 before committing."

**What we don't know.** The Yjs literature does not include this specific stress profile. ADR-0023 (branch-and-review) sanctions Yjs only inside-a-branch-and-inside-a-node, which bounds the question but does not answer it — a single user's working session can plausibly open many nodes in sequence.

**Resolution path.** **Spike** in Phase 3 per existing tech-spec §7-E. The spike is already on the roadmap; this open question is a pointer to it from the UX research perspective.

**Blast radius.** If Yjs does not scale, the inside-a-branch coediting story changes (perhaps to lazy-doc-lifecycle or Automerge-per-node alternatives). ADR-0023 is forward-compatible because it commits to "CRDT only inside a node within a branch" as the principle, not to Yjs specifically; an Automerge swap is bounded.

### 9. ELK perf at 5k nodes (tech-spec §7-C, also Phase 2 task p2-t12+t13)

**Question.** Already covered by existing Phase 2 tasks; mentioned here for cross-reference because UX research's onboarding scaffold (ADR coverage matrix P5.6) presupposes the canvas can render the team's full graph.

**What the synthesis says.** Implicit in the canvas-as-onboarding-surface debates. If ELK fails at 5k nodes, the canvas is unusable for the synthesis's "team activity" filter (P4.12) and the dependency-order reading document (P5.5).

**Resolution path.** **Spike** is in flight (Phase 2 `p2-t12` and `p2-t13`).

**Blast radius.** Already accounted for in tech-spec §6 phase 6 (server-side ELK escape hatch).

---

## Real-user-testing-required (post-L3, post-pilot)

Questions where the research literature is genuinely thin and only operational data answers them.

### 10. Is the canvas the right primary surface for *experienced* users?

**Question.** Synthesis Q3 commits the inbox-first onboarding for new users but explicitly leaves open whether experienced users should also live in the inbox (lines 755–757): "depends on whether IntentGraph's canvas is more like a Figma file (panoramic) or more like a Linear roadmap (dashboard)."

**What the synthesis says.** "The research can't say."

**What we don't know.** The whole question. Linear-style canvas-as-dashboard is one model; Figma-style canvas-as-edit-surface is another. The two imply different default-view, default-affordance, and default-keybinding decisions.

**Resolution path.** **Defer-until-telemetry-exists** + later real-user-testing. Once L3 is reached and the team has 2-3 months of dogfood data, instrument what experienced users actually do (canvas time vs. inbox time, canvas actions vs. inbox actions). Use the data to commit a v1.1 default-view ADR.

**Blast radius.** No immediate blast — both modes are accommodated by current substrate. The decision affects what is highlighted vs. backgrounded in the v1.1 default UI.

### 11. How much do per-user trust-calibration metrics affect actual behavior?

**Question.** Do personal trust dashboards (v1.1 task `v11-r01`) actually produce calibration improvement, or are they ignored?

**What the synthesis says** (lines 757–758): "Untested; the research suggests they should help, but personal trust dashboards in productivity tools have a mixed track record."

**What we don't know.** The mechanism the synthesis cites (Wischnewski / TCMM frameworks) is consistent with "personal metrics help calibrate," but the productivity-tools track record is mixed — many users glance at metrics and never adjust behavior. IntentGraph users may or may not be different.

**Resolution path.** **Defer-until-v1.1** behind telemetry. Once `v11-r01` ships, measure: (a) how often users open the dashboard; (b) whether dashboard-opening users exhibit different behavioral signatures (e.g., higher investigate-rate after viewing). If null effect, retire the dashboard.

**Blast radius.** Low. The dashboard is opt-in by virtue of being a separate surface; null effect is a deletion, not a regression.

### 12. Long-term skill atrophy in software engineering specifically

**Question.** Does AI-assisted code review and proposal acceptance produce measurable deskilling in software engineering, on the timescale of months-to-years?

**What the synthesis says** (lines 743–744): "The medical-imaging analog is suggestive but not a tight fit; software engineering has different practice patterns, and the deskilling literature there is essentially anecdotal."

**What we don't know.** Whether the v1.2+ "unaided review mode" (v1.2 tasks `v12-r01`, `v12-r02`) is actually a useful intervention vs. a feature looking for a problem.

**Resolution path.** **Defer-until-v1.2+** per synthesis line 609. The architecture should accommodate it (already does — local_user_state schema in ADR-0023 §1 holds the per-user agreement-rate metric); whether to ship the feature waits for evidence.

**Blast radius.** Negligible for v1. The architecture choice (accommodate) is already made.

---

## Cross-cutting tensions the design has to navigate

The synthesis names three internal contradictions in the research (lines 748–751). These are not "open questions" in the answer-able sense; they are tensions the design must hold in balance. They are listed here so reviewers see the same framing the synthesis adopts.

### A. PAIR's "explain for understanding, not completeness" vs. faithfulness's audit-trail requirement

Synthesis resolution adopted: progressive disclosure (ADR-0020 three-layer mapping). Layer 1 minimal, Layer 3 complete. The tension is held by *layering*, not by choosing one principle over the other.

**Status.** Resolved by ADR-0020. Not an open question.

### B. Tesla strikeout intervention vs. autonomy preservation

Synthesis resolution adopted: protective framing, dismissible, non-punitive (per ADR-0021 §1 language rules; per coverage matrix P5.1 and `p5-r12`).

**Status.** Resolved by ADR-0021 + Phase 5 task discipline. Not an open question.

### C. Notification batching for fatigue reduction vs. immediate surfacing for monitor-flagged items

Synthesis resolution adopted: tier-based interrupt policy — only Tier 1 interrupts (per ADR-0021 §3 + ADR-0022 §2 + Phase 4 task `p4-r13`).

**Status.** Resolved by ADR-0021 + ADR-0022. Not an open question.

---

## Summary

- **5 questions require user-testing before Phase 5 freeze** (the highest priority list per synthesis line 759).
- **3 questions resolvable by spike work** (one already in flight, two new spikes recommended in Phase 4 dogfood telemetry).
- **3 questions deferred to post-L3 telemetry or v1.1+** (the canvas-as-experienced-user-surface, trust-dashboard effectiveness, deskilling).
- **3 cross-cutting tensions resolved by ADR.** Not open.

Three highest-priority items the human should resolve first:

1. **Question #1 (monitor-verdict framing A/B test).** Highest blast radius; most novel design choice in the product per synthesis Cross-Cutting Theme #3.
2. **Question #3 (merge-conflict resolver task-completion test).** Phase 5 substrate decision can ship without it, but the resolver UI cannot harden until it's run.
3. **Question #6 (right N for unread-accepts trigger).** The Phase 5 protective banner copy and timing depend on this; the spike is bounded and can run during Phase 4 dogfood.
