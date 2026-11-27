# UX Research → Build-Plan Coverage Matrix

**Status:** Draft (architect skill output, awaiting human review).
**Source:** [`docs/research/ux-research-synthesis.md`](./ux-research-synthesis.md), April 2026.
**Purpose:** Map every tagged design implication in the synthesis to one of: needs ADR, needs task, needs both, already covered, defer. The matrix is the human-reviewable artifact that establishes nothing is silently dropped.

## How to read this

Each row corresponds to one tagged recommendation in the synthesis. The synthesis tags items in two places:

1. The numbered "Concrete Design Recommendations" at the end of each Question (Q1–Q5), each marked `(informs phase 4)`, `(informs phase 5)`, or `(informs v1.1)`.
2. The consolidated "Specific Design Implications Mapped to the Two-Surface Design" section near the end, with codes `C-P4-*`, `D-P4-*`, `I-P4-*`, `S-P4-*`, `L-P4-*` (Phase 4); `B-P5-*`, `O-P5-*`, `T-P5-*`, `V-P5-*`, `M-P5-*` (Phase 5); `A-V11-*`, `TC-V11-*`, `SR-V11-*`, `N-V11-*` (v1.1).

Some recommendations appear in both places (the consolidated section is a re-tagging of the per-question recommendations). The matrix collapses those into a single row when they refer to the same concrete design choice; the synthesis section that names the recommendation in fullest detail is cited.

The five proposed ADRs (referenced in the *Disposition* column as ADR-0020 through ADR-0024) are drafts produced alongside this matrix. They are Proposed; the human accepts after review.

The five proposed task list amendments are drafts in `automation/tasks/phase-4-drift-detection/tasks.draft.json`, `automation/tasks/phase-5-retrieval-eval/tasks.draft.json`, and `automation/tasks/v1.1-parking-lot/tasks.json` (parking-lot file is new). They are not committed to the approved task lists; the existing approved Phase 2 list is untouched.

---

## Phase 4 implications

| # | Synthesis ref | Recommendation | Disposition | Notes |
|---|---|---|---|---|
| P4.1 | Q1 #1 / I-P4-3 | Four-state confidence visual encoding (asserted / inferred / semantic / extracted) plus fifth "monitor-flagged" yellow corner mark | **Needs both: ADR-0022 (categorical encoding) + task** | The four-state encoding is partly already in tech-spec §4.1 (`confidence` enum). ADR-0022 commits to the encoding as user-facing visual primitive and forbids percentage scores. Task: implement the mapping in webview node-rendering. |
| P4.2 | Q1 #2 / I-P4-2 | Two row layouts (confident vs. uncertain) — Y/N primary vs. V primary | **Needs ADR-0020 + task** | The two-layout rule is a per-decision-type styling consequence of the legibility taxonomy. ADR-0020 makes it a documented design system axis. Task: implement the layouts in the inbox component. |
| P4.3 | Q1 #5 / I-P4-8 | First-run failure-mode-by-category framing | **Needs task** (informed by research, A/B before hardening) | The synthesis flags this as Wischnewski's "pre-interaction calibration" finding, which is well-cited but operationally contested for software-tools UX. Land as v1 hypothesis with explicit user-test gate before hardening. |
| P4.4 | Q2 #1 / I-P4-1 | Three-tier inbox sort (blocking+monitor → high-leverage → backlog) | **Needs both: ADR-0022 (categorical severity) + task** | ADR-0022 establishes three-tier inbox severity as a forbidden-percentage primitive. Task: implement the sort algorithm. |
| P4.5 | Q2 #2 / S-P4-2 | Status-bar budget context display | **Needs task** | Externalization principle (cross-cutting theme #2). No architectural commitment beyond the existing status-bar surface. Task only. |
| P4.6 | Q2 #4 / I-P4-6 | Bulk-action affordances scoped per tier | **Needs task** | Direct consequence of the three-tier sort (P4.4); implement in the same inbox component. |
| P4.7 | Q2 #5 / I-P4-7 | Cmd-Shift-Enter "highest-leverage next item" jump | **Needs task** (flagged: research-thin) | Synthesis explicitly flags this affordance as derived from reasoning, not research. Mark task as "informed by research but unverified, A/B test before hardening." |
| P4.8 | Q2 #6 | Status-bar interruption policy: synchronous notification only for monitor-flagged or verifier-failed | **Needs both: ADR-0021 (monitor framing) + task** | ADR-0021's never-modal-except-tier-1 commitment governs the interruption policy. Task: wire the interruption rule in the extension's notification dispatcher. |
| P4.9 | Q3 #1 / C-P4-3 | Default new-user landing surface = inbox, not canvas | **Needs task** (flagged: research-thin) | Synthesis: "Is the canvas the right primary surface for *experienced* users?" is in the unanswered-questions list. This recommendation is for new users only; the experienced-user landing is left to v1.1+. Tag task accordingly. |
| P4.10 | Q3 #2 / I-P4-5 | Three pre-curated inbox items on first launch | **Needs task** | Bounded onboarding scaffold; no architectural commitment. |
| P4.11 | Q3 #3 / D-P4-1 | Onboarding-mode detail panel auto-expanded to 60% viewport for first 30 days | **Needs task** | Bounded UX choice. |
| P4.12 | Q3 #7 / C-P4-1 | Onboarding-mode "team activity" filter highlighting recently-touched nodes | **Needs task** | Canvas filter, no architectural commitment. |
| P4.13 | Q3 #7 (implied) / C-P4-2 | Cmd-K toggle preserves last-position in inbox | **Needs task** | Implementation detail. |
| P4.14 | Q5 #1 / L-P4-1 | Per-decision-type legibility taxonomy as documented design system | **Needs ADR-0020** (no separate task — taxonomy IS the deliverable) | The taxonomy is the load-bearing decision; ADRs 0020 establishes it. Task work then specializes per surface (P4.2, etc.). |
| P4.15 | Q5 #2 / L-P4-1 | Three-layer disclosure mapping (inbox row → expanded → detail panel) per type | **Needs ADR-0020 + task** | Part of ADR-0020. Task: implement the three-layer rendering in webview components. |
| P4.16 | Q5 #3 / I-P4-4 | Monitor chevron overlays other types rather than its own row | **Needs ADR-0020 + ADR-0021** | ADR-0020 (taxonomy: monitor verdict overlays Type 2 proposals) and ADR-0021 (monitor framing: never its own row except Tier 1). |
| P4.17 | Q5 #4 / L-P4-2 | Retrieval shown in expanded view, not row, except in onboarding | **Needs ADR-0020 + task** | Part of taxonomy (Type 4). Task: implement retrieval-source surface in expanded view. |
| P4.18 | Q3 #7 (process) | First-meaningful-contribution metric (Day 4–5 first edit) | **Defer** (instrumentation) | Phase 6 hardening territory; the metric requires telemetry the v1 product does not yet collect. Tag as v1.1. |
| P4.19 | adjacent: Mental-model gap (synthesis "Adjacent Findings") / D-P4-2 | Provenance preservation: inferred-flag downgrades only on explicit user assertion | **Needs ADR-0024** (no separate task: ADR is the deliverable) | Pure architectural commitment. The implementation surfaces in the upsert handler in Phase 4 (drift detection writes inferred intents) and Phase 3's `intent.upsert` (markdown-write-back path). |
| P4.20 | D-P4-3 | Constraints render verifier status with per-decision-type taxonomy | **Already covered by ADR-0019** (informational vs. load-bearing distinction) + **needs ADR-0020 styling** | ADR-0019 commits to the load-bearing-vs-informational distinction for verifier outcomes; ADR-0020's Type 5 (verifier outcome) styling specializes this for the inbox. |

---

## Phase 5 implications

| # | Synthesis ref | Recommendation | Disposition | Notes |
|---|---|---|---|---|
| P5.1 | Q1 #3 / T-P5-1 | Per-type acceptance-rate watcher with non-modal protective banners | **Needs task** (flagged: A/B before hardening) | Synthesis names "what's the right N for unread accepts" as an unanswered question. Picked 9-of-10 by Tesla analogy. Task tagged informed-but-unverified. |
| P5.2 | Q1 #4 / T-P5-3 | Modal/interruptive treatment reserved exclusively for monitor-flagged severe verdicts | **Needs ADR-0021** (no separate task) | ADR-0021's never-modal-except-tier-1 policy. The implementation lands in P4.8's interruption dispatcher — no separate Phase 5 task needed. |
| P5.3 | Q2 #3 / T-P5-2 | Adaptive 25-item / 45-minute "take a break" intervention, personalized | **Needs task** (flagged: A/B before hardening) | Synthesis names the 45-min threshold as picked by analogy, needs personalization. Tag accordingly. |
| P5.4 | Q3 #4 / O-P5-1 | Reading-mode toggle (R) on detail panel for full-screen TipTap prose view | **Needs task** | Bounded UX. |
| P5.5 | Q3 #5 / O-P5-2 | Cmd-Shift-D opens whole graph as traversable reading document in dependency order | **Needs task** | Bounded feature; "highest-leverage onboarding feature in v1" per synthesis. Worth user-testing early. |
| P5.6 | Q3 #6 / O-P5-3 | Day-1-to-Day-7 onboarding scaffold with explicit milestones | **Needs task** | Bounded scaffold; user-tests early per synthesis recommendation #4. |
| P5.7 | Q4 #1 / B-P5-1 | Figma-style branch-and-merge for graph state | **Needs ADR-0023** | ADR-0023 (branch-and-review) is the load-bearing architectural commitment. Implementation is broken out into multiple Phase 5 tasks. |
| P5.8 | Q4 #2 / B-P5-3 | Merge-conflict resolver UI as new inbox item type (M) | **Needs ADR-0023 + task** | ADR-0023 commits to the new item type; task implements the resolver UI. |
| P5.9 | Q4 #3 / B-P5-4 | AI-suggested merge proposals run through monitor LLM | **Needs ADR-0023 + ADR-0021 + task** | ADR-0023 commits to AI-suggested merges; ADR-0021 governs how the monitor verdict surfaces. Task: implement the resolver's "AI suggested merge" affordance. |
| P5.10 | Q4 #4 / B-P5-5 | Three-tier state model (per-developer / per-branch / team-shared) | **Needs ADR-0023** (no separate task: substrate decision threads through every Phase 5 task) | Pure architectural commitment. |
| P5.11 | Q4 #5 / B-P5-6 | Yjs (or Automerge) CRDT for in-node coediting *within* a branch | **Needs ADR-0023** (architectural commitment) + **task** (Yjs prototype already flagged in tech-spec §7-E as Open Call) | ADR-0023's "CRDT only inside a node within a branch" rule plus the existing tech-spec §7-E spike concern (1000 Y.Docs in one webview) merge into a Phase 3 spike + Phase 5 task. |
| P5.12 | Q4 #8 / B-P5-7 | In-app "branch / open PR / resolve conflicts" affordances | **Needs task** (assumes ADR-0023 accepted) | Implementation work; no separate ADR. |
| P5.13 | Q5 #5 / V-P5-1 | Counterexample provenance UI: literal input, output, contradicted spec, inference path | **Needs task** | Already structurally in tech-spec §4.1 (`counterexample` node kind has `input_repr`, `expected`, etc. — substrate is in place) and §3.4 (Verifier interface from ADR-0016). Task: implement the rendering. |
| P5.14 | Q5 #6 / V-P5-2 + V-P5-3 | Real-time low-noise "verifier caught" toasts + weekly digest | **Needs task** | Surface work; no architectural commitment. |
| P5.15 | Q5 #7 / M-P5-1 | Monitor verdict UI strictly framed as teammate; never subjects the user | **Needs ADR-0021** (no separate task) | ADR-0021 names the language rules. Implementation in the inbox row + expanded view is part of P4.16's task. |
| P5.16 | M-P5-2 | Aggregate weekly monitor-finding summary with override/fix/false-flag breakdown | **Needs task** | Surface work. |
| P5.17 | (cross-cutting theme 2) | Externalize what cannot be internalized — e.g., budget context, acceptance rate by type | **Already covered by P4.5** | The status-bar externalization in P4.5 covers this; Phase 5 adds the per-type acceptance metric (P5.1). |

---

## v1.1 implications (parking lot)

| # | Synthesis ref | Recommendation | Disposition | Notes |
|---|---|---|---|---|
| V1.1.1 | Q1 #6 / A-V11-3 | Per-user trust calibration metric (accepts/rejects/investigates by tier) | **Defer to v1.1** | Personal dashboard; non-blocking for L3. Park as task in v1.1 list. |
| V1.1.2 | Q2 #7 / A-V11-1 | Per-user budget tuning that learns from post-hoc accuracy | **Defer to v1.1** | Adaptive layer on P5.3's static threshold. Park. |
| V1.1.3 | Q2 #8 / A-V11-2 | Insert one novel-type item per five Tier-2 items (Bacchelli & Bird knowledge transfer) | **Defer to v1.1** | Adaptive layer on the Phase 4 sort. Park. |
| V1.1.4 | Q3 #8 / TC-V11-3 | Buddy/mentor pairing affordance (node-comment that pings a designated mentor) | **Defer to v1.1** | Team feature; depends on V1.1.5's permission model. Park. |
| V1.1.5 | Q4 #6 / TC-V11-1 | Per-node comment threads with @-mentions generating inbox items | **Defer to v1.1** | Team feature, depends on Phase 5's branch-and-review substrate. Park. |
| V1.1.6 | Q4 #7 / TC-V11-2 | Permission model mapped to GitHub roles (read/write/admin) | **Defer to v1.1** | Team feature, depends on ADR-0023 accepted. Park. |
| V1.1.7 | adjacent: Skill atrophy / SR-V11-1 | Opt-in "unaided review" mode (AI's stated reasoning hidden during review) | **Defer to v1.2+** (synthesis explicitly tags v1.2+) | Park, but flag at the front of the parking lot file as not-v1.1-but-on-the-roadmap. |
| V1.1.8 | adjacent: Skill atrophy / SR-V11-2 | Per-user agreement rate between unaided judgments and verifier outcomes | **Defer to v1.2+** | Pairs with V1.1.7. Park together. |
| V1.1.9 | adjacent: Notification design / N-V11-1 | Hourly batching for low-priority drift events | **Defer to v1.1** | Tuning of Phase 4 inbox; non-blocking for L2. Park. |
| V1.1.10 | adjacent: Notification design / N-V11-2 | Quiet hours setting | **Defer to v1.1** | Park. |
| V1.1.11 | adjacent: Notification design / N-V11-3 | Auto-filter previously-dismissed items of same exact type | **Defer to v1.1** | Sentry-pattern; park. |
| V1.1.12 | adjacent: Direct manipulation | Direct manipulation as first-class operation alongside proposal review | **Already covered** by tech-spec §3.5 (TipTap node editor) and ADR-0001 (extension is a controller, not a proposal-only surface) | The synthesis's adjacent finding flags this as a known autonomy hazard; the existing architecture already preserves it. Note in v1.1 file as "verify, do not implement." |
| V1.1.13 | Q3 (no number, in body) | Reading-mode-as-default-onboarding-affordance | **Already covered by P5.4** | Same recommendation, already a Phase 5 task. |

---

## Already-covered items (no new ADR or task)

| Synthesis ref | Recommendation | Coverage |
|---|---|---|
| Q1 #4 (existing) | Confidence cue stroke style (solid/dotted/?/auto) | Existing visual language per synthesis §Q1; tech-spec §4.1 `confidence` enum. ADR-0022 makes it a forbidden-percentage commitment but does not change the encoding itself. |
| S-P4-1 | Pending count with severity-colored dot | Existing status-bar spec; no new ADR or task. |
| Cross-cutting theme 1 | Categorical legibility beats continuous scoring | Encoded in ADR-0022 (the new ADR consolidates this principle). |
| Cross-cutting theme 3 | Monitor is teammate, not auditor | Encoded in ADR-0021. |
| Cross-cutting theme 4 | Per-decision-type, not per-AI-action | Encoded in ADR-0020. |
| Cross-cutting theme 5 | Branch-and-review for semantic units | Encoded in ADR-0023. |
| (Q5 verifier outcome) | Load-bearing vs. informational distinction for obligation outcomes | **Already in ADR-0019** (concept contract surface). The Phase 4 styling task (P4.20) inherits this. |

---

## Deferred (with reasoning)

| Synthesis ref | Recommendation | Defer reason |
|---|---|---|
| Q3 #1 (experienced-user surface) | "Is canvas the right primary surface for experienced users?" | Synthesis explicitly names this as research-thin; the answer requires real-user data. Defer to post-L3 telemetry. |
| Q5 (faithfulness UI tier 4 papers, e.g. F-Fidelity) | Operationalizing arXiv 2510.27378 / 2410.02970 metrics in the verifier | Synthesis: "Almost no published research; the closest analogs are static-analysis warnings and CDS alerts. **This is the riskiest area of the design and deserves the most user-testing investment.**" Defer formal-faithfulness-UI metrics to post-L3. |
| Adjacent: Long-term skill atrophy (broad) | Tracking skill metrics with and without AI | v1.2+ per synthesis. Parked above. |

---

## Summary of dispositions

- **Needs ADR (new):** 5 — ADRs 0020–0024 (drafts produced).
- **Needs task (new) in Phase 4:** 14 (see `automation/tasks/phase-4-drift-detection/tasks.draft.json`).
- **Needs task (new) in Phase 5:** 12 (see `automation/tasks/phase-5-retrieval-eval/tasks.draft.json`).
- **Needs task (new) in v1.1 parking lot:** 11 (see `automation/tasks/v1.1-parking-lot/tasks.json`).
- **Already covered by existing ADRs/spec:** 7 (no action).
- **Deferred with reasoning:** 3 (no action).

Three highest-priority items for human review first (load-bearing, blocks downstream tasks):

1. **ADR-0020 (per-decision-type legibility taxonomy).** Every Phase 4 inbox/canvas/detail-panel task inherits from this. Approve before Phase 4 task list is approved.
2. **ADR-0021 (monitor LLM presentation framing).** The most consequential framing decision in the product per synthesis. Wrong here cascades into every monitor-touching surface.
3. **ADR-0023 (branch-and-review for graph state).** Phase 5's substrate decision; locks in the three-tier state model and the merge-conflict UX. Phase 5 cannot decompose without this.

ADR-0022 (categorical encoding) and ADR-0024 (provenance preservation) are also load-bearing but smaller in surface area and more local in consequence; review next.
