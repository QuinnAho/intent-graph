# IntentGraph UX Research Synthesis

## A Foundation Document for Phase 4–5 Design

---

## Executive Summary

IntentGraph is shipping into a market where the underlying AI tooling is, by 2025–2026 evidence, both indispensable and untrustworthy. Stack Overflow's 2025 survey shows 84% adoption alongside trust collapsing from 40% to 29% year-over-year, with "almost right but not quite" as the dominant complaint (66% of developers). CodeRabbit's December 2025 study found AI-authored code contains roughly 1.7× more issues, 1.5–2× more security vulnerabilities, and nearly 8× more performance inefficiencies than human-written code. METR's randomized controlled trial (arXiv 2507.09089) found senior open-source contributors were 19% slower with AI tools while believing they were 20% faster — a perception/reality gap that goes to the heart of why an intent-graph supervision layer is needed. Anthropic's faithfulness work (arXiv 2505.05410, the "Reasoning Models Don't Always Say What They Think" paper) puts the chain-of-thought reveal rate around 25%, while Korbak et al. (arXiv 2507.11473) characterize CoT monitorability as a fragile, architecture-dependent opportunity rather than a guarantee. These findings are not background; they are load-bearing for every design decision below.

**The five most important findings, condensed:**

1. **Trust calibrates through visible, asymmetric failure, not through confidence bars.** The clinical decision support literature (override rates 49–96%, alert fatigue inversely proportional to specificity) and the autonomous vehicle disengagement literature (Nordhoff 2024, n=103 Tesla FSD users) converge: users develop calibrated trust only when the system *fails legibly* in known categories and *succeeds visibly* with traceable reasoning. Confidence numbers ("0.73") are reliably misread as accuracy. **Design implication: confidence in IntentGraph must be encoded categorically (asserted/inferred/semantic/extracted) and grounded in *what would falsify this*, not in a probability.**

2. **Review budget is ~60–90 minutes per day before quality collapses, and the curve is steep.** SmartBear's Cisco study (2,500 reviews, ~3.2M LOC) and the Bacchelli & Bird (Microsoft Research, ICSE 2013) work converge on 200–400 LOC per session, 300–500 LOC/hour, and a sharp drop-off after 60 minutes of continuous review. With AI generating 5–10× more change events than humans authored historically, an IntentGraph inbox left to its own volume will saturate users by 10am. **Design implication: the inbox must actively manage budget — sort by leverage, batch by type, and intervene with "stop now" prompts.**

3. **Onboarding to a graph-as-source-of-truth product is unprecedented; the closest analog is Figma branching, Linear triage, and developer-onboarding research (Begel & Simon, GitLab 2024, Cortex/Atlassian).** The literature points to one Day-1 outcome (a meaningful first PR), one mental model anchor (architecture before code), and progressive disclosure of complexity. **Design implication: the new-engineer entry point should be the *inbox* (concrete, bounded, decision-shaped), not the canvas (abstract, panoramic, intimidating).**

4. **Merging structured natural-language artifacts is an unsolved problem; the mature literature (Peritext, Automerge, Eg-walker, Fugue from Ink & Switch / Kleppmann group) tells us text CRDTs preserve characters but not author intent, and intent-level merges require either explicit review (Figma branching) or semantic conflict surfacing (Semenov & Aksenov 2026 PaPoC).** Pure CRDT merging of intent statements will silently corrupt meaning. **Design implication: IntentGraph should use Git-style branch-and-review for intent/decision/rationale nodes (semantic units) and CRDT only for editor-level coediting *within* a node.**

5. **AI legibility is a taxonomy problem, not a UI problem.** The XAI literature (Google PAIR, Microsoft HAX, IBM Design Ethics, Apple HIG-AI) and the developer-tools-specific work on Cursor/Devin/Cody show that *every distinct AI action type* needs its own visual treatment, and that "explain for understanding, not completeness" (PAIR Guidebook) outperforms maximalist trace dumps. **Design implication: build a per-decision-type legibility taxonomy (drift / proposal / monitor verdict / retrieval / verifier outcome) before designing the trace panel; the panel will then assemble itself.**

The cross-cutting theme is that **IntentGraph's wedge — persistent program theory plus structured verification — is *only* defensible if the UX makes faithfulness legible without making it threatening.** The Baker et al. monitor result (arXiv 2503.11926) is positive engineering news; the UX challenge is making "the monitor flagged this" feel like a teammate catching a bug, not a cop issuing a citation. The remainder of this document derives concrete design recommendations for each of the five questions, mapped to the canvas-with-detail-panel and the inbox surfaces, and tagged for build-plan phasing.

---

## Question 1 — Trust Calibration for AI Proposals

### State of the Research Literature

Trust calibration as a research subfield begins with Lee & See (2004), who framed trust in automation as a continuous variable that should align with system capability. This was extended for intelligent automated systems (CalTruIAS framework, PMC 11573890) and crystallized in 2025 in the Trust Calibration Maturity Model (TCMM, arXiv 2503.15511), which scores systems across five dimensions — performance characterization, bias/robustness, transparency, safety/security, usability — at four maturity levels. The TCMM is currently the most usable scaffold for thinking about IntentGraph trust posture.

Three adjacent literatures matter for IntentGraph:

**Autonomous vehicle handover.** Nordhoff's 2024 analysis (Sci. Reports, n=103 Tesla FSD Beta drivers) identified 35 sub-categories of disengagement events organized into five top-level categories (operator state, perception of automation, perception of others, automation's perception of operator, environmental incapability). The dominant findings: *overtrust correlates with eyes-off and mind-off behavior and is driven by long stretches of competent operation*; *undertrust correlates with disengagement on anticipated rather than actual failure*. Tesla's own response — escalating "strikeout" warnings that suspend Autopilot for a week after five inattentiveness events — is a behavioral intervention that directly applies to IntentGraph's "you've been accepting these without reading them" problem.

**Clinical decision support.** The CDS literature is the deepest empirical body on alert fatigue and override behavior. Override rates are routinely 49–96% (Khairat et al., JMIR Med Inform 2020). Phansalkar's tiered-severity work, replicated in subsequent CPOE studies (PMC 2605599), shows that *tiering compliance from 34% to 100% on Level-1 ("hard stop") alerts* is achievable when severity is differentiated and only the most consequential alerts are interruptive. The Ancker et al. cognitive overload study (PMC 5387195) distinguishes two mechanisms — cognitive overload (volume × complexity) and desensitization (repeated exposure to same alert) — both of which apply to IntentGraph's inbox. Hard-stop alerts are effective in 11/15 evaluated studies (PMC 6915824) but introduce delays and unintended consequences when used promiscuously.

**Aviation alarm history.** TCAS and GPWS/EGPWS evolved through 50 years of false-positive tuning. The current discipline — "treat all TCAS messages as genuine; only Windshear and GPWS override" — is the result of decades of resolution-advisory tuning to suppress nuisance alerts. The lesson for IntentGraph is that *alert priority hierarchies must be explicit and rare-event-tuned*: only the most serious classes (e.g., monitor flag of likely faithfulness violation) should ever be modal/interruptive.

**2023–2026 human–AI teaming literature.** Wischnewski, Krämer & Müller (CHI 2023) survey trust calibration measurement; the most actionable finding is that *pre-interaction calibration* (docs, tutorials, framing) is disproportionately important because *initial overtrust is harder to correct than initial undertrust*. The CodeScene action research at IDE level (arXiv 2412.15948) extends this to refactoring AI specifically, showing trust development is non-monotonic and individualized. Steinmetz et al. (TCMM, 2025) and Larasati (2025) now recommend adaptive, context-aware bandit/RL methods to update trust indicators dynamically.

### Specific Findings That Apply to IntentGraph

1. **Confidence numbers don't calibrate.** Modexa's 2025 industry analysis and the Visible Language journal (Issue 59-2, 2025) on uncertainty UI both converge on the same finding: *raw probability scores are reliably misinterpreted as accuracy*; users translate "0.73" as "73% correct" regardless of what the model actually means. The PAIR Guidebook ("Explain for understanding, not completeness") and the Google Explainability Rubric recommend mapping uncertainty to *decisions*, not numbers — i.e., "I'll do this," "I might be wrong here, please check," "I don't know."

2. **Failure must be legible in *categories*.** Both Nordhoff's automation findings and Phansalkar's tiered alerts point to the same conclusion: users build calibrated trust when they can predict *what kind of mistake the system makes*. An undifferentiated "AI sometimes gets things wrong" generates either rubber-stamping or wholesale distrust. An organized taxonomy — "the monitor catches reward hacking; the verifier catches contract violations; the inferred extraction catches bad readings of code" — generates appropriate selective trust.

3. **Volume kills calibration even with good content.** The CDS desensitization mechanism applies directly: even *correct* AI proposals, served at high volume, will be batch-accepted within ~2 weeks. The Ancker et al. data show acceptance dropping with repeated exposure to the same alert type for the same patient — IntentGraph's analog is "Alice has seen 14 'add null check' proposals from the AI this week."

4. **Pre-interaction framing matters more than runtime UI.** The Wischnewski survey, the Fly.io analysis, and the IDE-specific CodeScene work all converge: *expectations set in onboarding determine baseline trust posture, which is sticky*. IntentGraph cannot rely on the inbox to calibrate trust if the first-run experience oversells the AI.

5. **Acceptance-tracking interventions work in safety-critical domains, but only if non-punitive.** Tesla's strikeout system suspends FSD; clinical "hard stop" alerts force pharmacist consultation. These work because the friction is proportionate to the risk and is framed as protection, not punishment. The METR finding (developers thought they were 20% faster but were 19% slower) is direct evidence that humans cannot self-monitor their AI-acceptance behavior; the system must do it for them.

### Design Implications Mapped to IntentGraph Surfaces

**On the inbox row:** Confidence should *not* render as a percentage. The product's existing decision — solid (asserted), dotted underline (inferred), question mark (semantic), auto badge (extracted) — is a categorical/visual encoding that aligns with the research. Strengthen this by adding a fifth treatment: **"monitor-flagged"** (yellow corner mark) when the cheap monitor LLM has a verdict, regardless of the underlying confidence level. Monitor-flagged items must *never* be batch-accepted.

**On the inbox row, when the AI is genuinely uncertain:** the row should look *different*, not just have a small icon difference. Specifically:
- A confident proposal renders as a single line with diff-summary and accept/reject keyboard hints (Y/N).
- An uncertain proposal renders as two lines — the proposal + the AI's *stated reason for uncertainty* (e.g., "no test exists for this branch," "couldn't find prior decision on null handling") — and replaces accept/reject with **investigate (V)** as the primary action.
- This mirrors the Cline/Builder.io finding that "verify continuously, because checking is cheap" is the trust-preserving pattern; making investigation the default for uncertain items creates the right behavioral nudge.

**On the inbox row, when the AI is confident but the *monitor* is uncertain:** this is the most novel UX state and the one most directly tied to the product's faithfulness pillar. The row should show *two confidence channels*: the proposer's confidence (asserted) and the monitor's verdict (questioning). Visually: the proposal renders solid (the AI is confident), but a small monitor-icon at the right edge renders amber. This makes Baker et al.'s monitor finding immediately actionable rather than burying it in metadata.

**Acceptance-tracking interventions:** Implement a per-user rolling 10-item acceptance rate. When accept-without-investigate exceeds 80% across 10 consecutive items of the same type, trigger an in-line, non-modal banner: *"You've accepted the last 9 'null-check' proposals without opening the trace. Want to spot-check one?"* — with a single-keystroke "show me a random one" affordance. Critically, this is *protective*, not punitive, and it is *type-scoped*, not global, so it doesn't fire when the user is correctly batch-approving low-stakes items. This is a direct port of Tesla's strikeout mechanism, calibrated for non-safety-critical software work.

**Calibration onboarding (pre-interaction):** First-run should explicitly frame the AI's failure modes by category — "the proposer is reliable for X, the monitor catches Y, the verifier catches Z" — not by overall capability. Wischnewski's finding that pre-interaction framing prevents *initial* overtrust (and that initial overtrust is asymmetrically hard to correct) makes this a one-shot opportunity.

### Concrete Design Recommendations for Q1

1. **(informs phase 4)** Implement the four-state confidence visual encoding (asserted/inferred/semantic/extracted) plus a fifth "monitor-flagged" yellow corner mark for items where the monitor LLM disagreed with the proposer.

2. **(informs phase 4)** Two distinct row layouts in the inbox: confident-row (one line, Y/N as primary) vs. uncertain-row (two lines with stated reason, V as primary).

3. **(informs phase 5)** Per-type acceptance-rate watcher with non-modal protective banners after 9-of-10 unread accepts; shows random spot-check.

4. **(informs phase 5)** Reserve modal/interruptive treatment for monitor-flagged items only — this is the IntentGraph "Level-1 hard stop" analog, tuned to be rare. Soft inline alerts handle the rest.

5. **(informs phase 4)** First-run experience explicitly enumerates AI failure modes by type, with a one-screen "what the AI gets wrong, by category" framing. This is the pre-interaction calibration anchor.

6. **(informs v1.1)** Track over time per-user trust calibration: ratio of accepts/rejects/investigates by confidence tier. If a user is rejecting high-confidence items at >40% or accepting low-confidence items at >60%, surface this in their settings as a personal metric, not a managerial one.

---

## Question 2 — Cognitive Load and Review Budget

### State of the Research Literature

The empirical foundation is clearer here than in Q1 because the SmartBear/Cisco study (Cohen, 2,500 reviews, ~3.2M LOC) and Bacchelli & Bird (Microsoft Research, ICSE 2013, 165 managers + 873 programmers + 17 interviews + 570 comments) provide convergent quantitative anchors:

- **200–400 LOC per session.** Defects-found drops sharply above this. Smaller PRs (under 85 LOC) get reviewed faster *and* with better feedback.
- **300–500 LOC/hour inspection rate.** Above 500 LOC/hour, defect density drops in 87% of cases.
- **60–90 minutes maximum continuous session.** SmartBear shows defect-detection plummeting after 60 minutes; the 90-minute cognitive-task fatigue threshold (replicated across knowledge-work studies) is the hard ceiling.
- **6–7 hours/week is the average reviewer burden** at Microsoft and large OSS projects; Google reports ~3.2 hours/week on a heavily tooled stack.
- **Reviewers find ~5–20 defects per hour** regardless of review size — meaning bigger reviews dilute defect density rather than increasing absolute finds.

The Bacchelli & Bird interview/survey work is the most underrated input here: *finding defects is the stated motivation, but the actual outcomes are knowledge transfer, increased team awareness, and creation of alternatives.* This matters for IntentGraph because the proposal-stream UX should not be optimized purely for "catch the bug" — it should also be optimized for *making the team aware of what the AI is doing* and *eliciting alternative framings of intent*.

The decision-fatigue literature (Frontiers in Cognition 2025; Atlassian's review of ego-depletion; super-productivity.com analysis of dev-specific patterns) converges on three findings: (1) decision quality declines monotonically across the day for most knowledge workers, with the steepest drop after lunch; (2) experts are particularly susceptible because they don't notice fatigue (arXiv 1706.01521 on cognitive depletion); (3) the highest-stakes decisions should happen in the first 2–3 hours.

The context-switching/attention-residue literature (Leroy 2009; Carnegie Mellon studies; recent dev.to/Hatica/Software.com syntheses) adds that **each context switch costs 20+ minutes of recovery and ~20% of cognitive capacity**, and that attention residue persists even after physically returning to the original task.

The Linear/Sentry/GitHub priority-sort literature is more design-oriented than empirical, but consistent: **fixed-rule priority sorts (severity × recency) outperform learned ones for first-impression usability**, but learned sorts win at scale once users understand the system's reasoning. Sentry's discussion #68908 and issue #48477 are explicit about this — users wanted to disable automatic prioritization until they could see and trust the rules.

### Specific Findings That Apply to IntentGraph

1. **The hard cap is ~30–50 inbox items/day, not unlimited.** Translating SmartBear's 200–400 LOC per 60–90 minutes onto an inbox of *graph-sized decisions* (each typically representing tens to a few hundred LOC of impact), and assuming a 3–4 hour daily review budget at the high end, IntentGraph users can sustainably review ~30–50 items/day. With AI generation rates significantly higher than this, **the inbox volume problem is structural, not a tuning issue.**

2. **Sort order for the *first 20 items* is disproportionately important.** Decision-fatigue research means that whatever the user reviews early in the day gets disproportionately careful attention, while the same items reviewed at 4pm get rubber-stamped. The optimal sort for the first 20 is therefore *the items where careful attention has the highest expected value*: highest severity × highest uncertainty × highest blast radius.

3. **The Bacchelli & Bird "knowledge transfer" finding inverts a naive priority sort.** If the secondary purpose of review is awareness, then *items the user has never seen this type of before* deserve early-day placement even at low severity, because they build the user's mental model of what the AI is doing. This cuts against pure severity-sorting.

4. **Snooze/dismiss/bulk-action affordances must respect the budget rather than burning it.** The Linear triage model (snooze with conditional resurface, bulk-status changes, fast keyboard) and the Sentry priority system (high/medium/low with default-filter on low) both work because *they reduce decision count*, not because they reduce work.

5. **"You should stop reviewing" interventions work if framed as protective.** The decision-fatigue literature is unanimous: users do not self-monitor fatigue accurately. The Stenzel Clinical and super-productivity.com analyses both recommend external structural interventions (timed breaks, hard caps).

6. **Highest-leverage suggestion is harder than highest-priority.** "Highest-leverage" requires reasoning about *the user's current cognitive state* + *the item's current decision criticality* + *what other items downstream depend on this one*. The graph data structure makes the third tractable in IntentGraph in a way it isn't in flat-list inboxes.

### Design Implications Mapped to IntentGraph Surfaces

**Inbox sort algorithm (the most consequential single design decision in this section):** A multi-tier sort, not a single score:

- **Tier 1 (top of inbox, capped at ~10 items): blocking + monitor-flagged + verifier-failed.** These are the IntentGraph analog of "Level-1" CDS alerts. They must be reviewed today.
- **Tier 2 (~10 items): high-leverage proposals.** Score by `severity × confidence-uncertainty × downstream-blast-radius`. Items in this tier are where the user's careful morning attention pays off most.
- **Tier 3 (low-priority backlog): low-severity inferred suggestions, drift events on stable nodes, etc.** These are filterable-out by default, with a counter visible in the status bar.
- **Smart "Catch-up" insertion:** every fifth item in Tier 2 should be a *novel-type* item (a category the user has not reviewed in the past N days), even if it scores lower, to support the Bacchelli & Bird knowledge-transfer benefit.

**Bulk-action affordances:**
- **Bulk-accept by type only inside Tier 3.** Bulk-accept across tiers is dangerous; bulk-accept within "low-severity inferred suggestions" is appropriate.
- **Bulk-snooze with conditional resurface** ("come back when there's new information"), modeled directly on Linear's snooze + activity-based resurface pattern.
- **Bulk-dismiss requires a typed reason** for monitor-flagged items only — borrowing from CPOE override-reason research, which shows that *requiring a structured override reason reduces inappropriate overrides without significantly slowing throughput.*

**"Stop reviewing now" intervention:**
- After **45 minutes of continuous review** *or* **25 items reviewed in a session**, a non-modal lower-screen banner appears: *"You've reviewed 25 items since 10:14am. Defect-finding accuracy drops sharply above this. Want to take a 10-minute break? [Break] [Five more, then break] [Dismiss]"*
- This is a *suggestion*, not a hard stop, in keeping with the autonomy-respecting principle from the human-AI teaming literature.
- The 25-item threshold should be personalized over time — if a user consistently maintains accuracy (measured by post-hoc agreement with verifier outcomes) at higher item counts, raise their threshold; if they don't, lower it.

**"Highest-leverage next item" affordance:**
- Cmd-Shift-Enter (or similar) jumps to *the highest-Tier-2 item not yet reviewed today*. This is the IntentGraph analog of Linear's `Cmd-K` quick-jump and is intended specifically for the "I have 15 minutes, what's most valuable?" use case.
- The status bar should display *current budget context*: e.g., `IntentGraph: 12/25 reviewed · 23min · 3 high-leverage remaining`. This externalizes the budget into the user's visual field, addressing the cognitive-depletion finding that experts can't self-monitor.

**Respect for context-switching cost:**
- When the user is in the canvas view and an inbox notification fires, do *not* interrupt synchronously. Batch into the status-bar count, with audio/visual cue only when monitor-flagged or verifier-failed.
- The Cmd-K toggle between canvas and inbox is the right primitive; reinforce it by making the inbox preserve the user's last-reviewed position (avoid re-scrolling cost).

### Concrete Design Recommendations for Q2

1. **(informs phase 4)** Three-tier inbox sort with explicit visual tier markers. Tier 1 capped at ~10 items, Tier 2 personalized to the user's daily budget, Tier 3 collapsed by default.

2. **(informs phase 4)** Status-bar budget indicator: `12/25 · 23min · 3 high-leverage remaining`. Externalizes the budget per the cognitive-depletion literature.

3. **(informs phase 5)** Adaptive 25-item / 45-minute soft "take a break" intervention, personalized by post-hoc accuracy. Non-modal, dismissible, never punitive.

4. **(informs phase 4)** Bulk-action affordances: bulk-accept restricted to Tier 3, bulk-snooze with activity-based resurface (Linear pattern), bulk-dismiss with typed reason for monitor-flagged items only.

5. **(informs phase 4)** Cmd-Shift-Enter "show me the highest-leverage item" jump.

6. **(informs phase 4)** Status-bar interruption policy: synchronous notification only for monitor-flagged or verifier-failed items; everything else batches.

7. **(informs v1.1)** Per-user budget tuning that learns from post-hoc accuracy. Initial parameters from SmartBear (25 items / 45 min) but adapts within ±50%.

8. **(informs v1.1)** Insert one novel-type item per five Tier-2 items to support knowledge-transfer benefit (Bacchelli & Bird).

---

## Question 3 — Onboarding New Engineers

### State of the Research Literature

Developer onboarding research is more practical-industrial than academic. The most cited foundational work is Begel & Simon's "Novice Software Developers, All Over Again" (2008) on new-developer mental models, but the recent industrial corpus (GitLab 2024, Atlassian, Cortex, Port.io, daily.dev) is more directly applicable. Key empirical anchors:

- **44% of organizations take >2 months to onboard a developer** (GitLab 2024). 22% leave within 90 days under poor onboarding (daily.dev).
- **Time-to-first-PR is the dominant outcome metric**; well-onboarded engineers ship within Day 1–3, structured-onboarding teams reach the median by Week 1.
- **Structured onboarding reduces ramp time 40%** (Stack Overflow data via River 2026); HBR finds 62% greater new-hire productivity and 50% greater retention with structured programs.
- **The first week's job is mental-model construction, not output.** Architecture before code. Cortex, Port.io, FullScale all converge on this.
- **Psychological safety (Project Aristotle, Edmondson) is the most predictive onboarding variable**; documentation alone can't substitute.

Cognitive load theory (Sweller) applied to onboarding: **intrinsic load** (the inherent complexity of the codebase) is fixed, **extraneous load** (the tooling and documentation friction) must be minimized, **germane load** (effortful learning) must be invested in. IntentGraph specifically increases germane load (a new abstraction layer) but should *radically reduce* extraneous load (the codebase's history is now legible in graph form).

Recent AI-assisted onboarding research is sparse and contested. A 2024 Empirical Software Engineering study (cited in Jellyfish's review) found psychological safety mediates AI tool effectiveness; the Cortex/Port pattern is to use AI primarily for *navigating* documentation, not for replacing it. Devin/Cursor onboarding patterns suggest that AI-assisted onboarding works best when the AI reads alongside the human, not for them.

The most directly relevant adjacent literatures:

- **Linear's onboarding pattern** (the triage inbox as first-touch, rather than the project view) is the closest analog to IntentGraph's two-surface choice. Linear users consistently report the inbox as the natural starting point because *its boundedness gives the brain something to terminate on*.
- **Notion's onboarding** uses progressively-disclosed templates as scaffolds rather than blank canvases; this is the right pattern for IntentGraph documents/intents.
- **Figma branching's onboarding** (the "branch first, then merge" workflow) introduces version-controlled exploration as a *first-day* concept, which is unusual in design tools but normalized for engineers.

### Specific Findings That Apply to IntentGraph

1. **The canvas is the wrong starting point.** A node-link diagram of a complex system is overwhelming to a newcomer (the "expanded blueprint" problem documented in node-graph editor reviews from gboisse.github.io and others). The cognitive load theory prediction is that intrinsic load + the unfamiliar visual abstraction will exceed working-memory capacity.

2. **The inbox is the right starting point.** It is bounded, decision-shaped, and each item is a small concrete artifact. New engineers can build mental model *bottom-up from individual decisions* rather than top-down from the system.

3. **Day-1 first PR remains the right outcome metric, but redefined.** In IntentGraph, "first PR" should be "first accepted AI proposal where you actually read the trace" — i.e., a meaningful deliberate review, not a rubber-stamp.

4. **Document-reading affordance (currently collapsed at the bottom of the detail panel) is critical for onboarding and underweighted in the spec.** The Cortex/GitLab finding that engineers need *architecture docs before code* maps directly: in IntentGraph, intent statements + rationale + decisions are the architecture documentation. New engineers should be reading *those*, not code, in week 1. The current design treats them as "expandable references"; for onboarding, they should be the primary content.

5. **Guided experiences should be sample-task-based, not tutorial-based.** GitHub's onboarding research and the developer-onboarding industrial literature consistently find *real bounded tasks* outperform tutorials. A "first task" template — review three pre-selected inbox items, traverse to one canvas node, edit one rationale — outperforms a 30-minute video.

6. **Buddy systems work, but only if the buddy has bandwidth.** This is consistent across all the onboarding literature and is not novel to IntentGraph; mention it for completeness in the team workflow design.

7. **The graph itself is a learnable artifact** — Begel-style mental model formation can be supported by *highlighting recently-touched-by-team nodes* on the canvas, so newcomers can see "here's what the team has been working on" as a default view.

### Design Implications Mapped to IntentGraph Surfaces

**The "first 30 minutes" experience:**
- Minute 0–2: A single-screen welcome explaining IntentGraph's two-surface model, with the failure-mode-by-category framing from Q1's pre-interaction calibration. (No video; one screen of text + one diagram.)
- Minute 2–10: The user is dropped into the **inbox**, pre-populated with *three pre-curated items* from their actual codebase (selected by the AI for clarity and didactic value). Each is annotated with a small "tour pointer" that explains: this is an inferred suggestion, this is a drift event, this is a verifier failure.
- Minute 10–20: The user accepts/rejects/investigates each, with light coaching ("try opening the trace on this one" — once, not repeatedly).
- Minute 20–30: The user is invited to switch to the canvas (Cmd-K), which opens *centered on the node touched by their first accepted item*, not on a panoramic view. This is the bottom-up entry to the canvas. They can zoom out from there.

**The "first week" experience:**
- Day 1: Inbox-only mode by default. The canvas is accessible but not pushed.
- Days 2–3: The detail panel's natural-language stack (intent / acceptance criteria / constraints / decisions / rationale / code anchors) becomes the primary surface. The user is encouraged to *read* nodes, not edit them.
- Day 4–5: The user is encouraged to make a first edit — typically a rationale clarification or an acceptance-criterion refinement, *not* a code change. This is the IntentGraph version of "first PR" and explicitly inverts the traditional code-first onboarding.
- End of Week 1: The user has reviewed ~50 inbox items, read ~20 nodes, and made ~3 small edits. Time-to-first-meaningful-contribution is targeted at Day 4–5.

**Document-reading affordance redesign:**
- For onboarding mode (first 30 days, automatically detected), the detail panel's natural-language stack expands to ~60% of viewport instead of the default 380–440px. Code anchors stay collapsed at the bottom.
- A "reading mode" toggle (R) flips the detail panel into a full-screen prose layout for sustained reading of intent + rationale + decisions.
- A "team activity" filter on the canvas highlights nodes touched in the last 30 days, with author avatars on each. New engineers can navigate by recent team activity.

**Guided experiences:**
- The three pre-curated items use the existing inbox structure; no separate tutorial UI. (This avoids the maintenance burden of a parallel tutorial system, per Atlassian's onboarding guidance.)
- An "explore mode" canvas treatment: dimmed background, highlighted recent-activity subgraph, persistent "what is this node?" tooltip on hover. Auto-disabled after 7 days or after the user manually disables.

**A small but important detail:** the document-reading affordance should be a *first-class navigation surface*, not just a panel. Specifically, allow Cmd-Shift-D to open the entire codebase's intent-graph as a *reading document* in TipTap, traversed in dependency order. This is the IntentGraph analog of "read the architecture doc before the code" and is the most defensible single onboarding feature.

### Concrete Design Recommendations for Q3

1. **(informs phase 4)** Default new-user landing surface is the inbox, not the canvas. Canvas accessible via Cmd-K but not pushed.

2. **(informs phase 4)** Three pre-curated inbox items on first launch, with light didactic annotations on type. Auto-disabled after first session.

3. **(informs phase 4)** Onboarding-mode detail panel: auto-expanded to 60% viewport for first 30 days, with code anchors collapsed. Reverts to default after.

4. **(informs phase 5)** Reading-mode toggle (R) on the detail panel, opening full-screen TipTap prose view of intent + rationale + decisions for the current node.

5. **(informs phase 5)** Cmd-Shift-D opens the whole graph as a traversable reading document, in dependency order. This is the highest-leverage onboarding feature in v1.

6. **(informs phase 5)** Canvas "team activity" filter as the default view in onboarding mode: highlights recently-touched nodes with author avatars.

7. **(informs phase 4)** First-meaningful-contribution metric internalized in product: target is Day 4–5 first edit (rationale or acceptance-criterion), with light analytics nudge if not reached by Day 7.

8. **(informs v1.1)** Buddy/mentor pairing affordance: a node-comment that pings a designated mentor without escalating to general team channels.

---

## Question 4 — Team Coordination and Version Control

### State of the Research Literature

This is where the existing IntentGraph spec is thinnest and where adjacent literature has the most to say.

**Structured-document collaborative editing.** The Ink & Switch group (Peritext, Automerge, Eg-walker, related work by Kleppmann, Weidner, Gentle) has produced the most rigorous body of research on rich-text and structured-document CRDTs. The key findings:
- **Plain-text CRDTs preserve characters but not author intent.** The Peritext paper (CSCW 2022) shows that when User A bolds "fox" and User B inserts "quick brown" before it, naive merges either lose the formatting or apply it to the wrong text. **Intent preservation requires structural awareness.**
- **CRDTs are weak for conflicts that require human judgment.** Multi-Value Registers return both values to the application; the application must resolve. For semantic edits (intent statements), this means the resolver UI does the real work.
- **Eg-walker (2024) and Fugue (2023)** improve performance but do not solve the intent-preservation problem; they address different optimization frontiers.
- **Semenov & Aksenov (2026 PaPoC)** propose a *semantic conflict model* using three-way merges over a replicated journal — closest to IntentGraph's needs.

**Industrial structured-document tools.**
- **Notion** uses block-level OT/CRDT for live coediting but has no formal branching; conflict resolution is last-writer-wins with version history.
- **Linear** uses real-time collaborative editing within issues but treats issues as units of branching (a new issue, not a branched issue).
- **Figma branching** (Fuetsch, Kuwamoto, the 2021 Config launch) is the most directly relevant: it combines real-time multiplayer *within* a branch with explicit branch/review/merge between branches. The Figma team's blog explicitly notes that the merge problem was harder than expected — not because of conflicts, but because of state-management edge cases (file changes during review, dropped connections mid-merge).

**Code-review workflows in teams of various sizes.**
- The Bacchelli & Bird study + the Greiler review-process work + the Augment/Jellyfish 2025–2026 syntheses converge on: PR queue size grows with team size super-linearly; review SLAs (24h to first response, 12h elite) are the single biggest predictor of throughput; psychological safety dominates tool choice.
- The 2024 arXiv 2412.18531 study on automated code review in practice found that LLM-based review *increased* PR closure time from ~5h52m to ~8h20m even as comment resolution rates rose to 73.8%. Useful AI generates more work, not less, in review.

**Async-collaboration research.** The Notion/Linear best-practices literature is unanimous on a few points: separate the document layer (Notion) from the action layer (Linear); make decisions traceable to documents; use templates to reduce documentation friction. The Climate Policy Radar case study (alaniswright.com) is a useful concrete example: actions in Linear, notes in Notion, with explicit links.

### Specific Findings That Apply to IntentGraph

1. **Pure CRDT merging of intent statements will silently corrupt meaning.** This is the most important single finding for Q4. If Alice writes intent "the system must reject expired tokens" and Bob concurrently writes "the system must accept expired tokens within a grace window," a character-level CRDT will merge into an incoherent sentence. **IntentGraph must use semantic-unit branching for nodes, not character-level CRDT.**

2. **Git-style branch-and-review is the right primitive for inter-developer state.** Specs sync through Git as markdown (per the existing spec), but the *graph state* — including AI proposal history, monitor verdicts, verifier outcomes — should also flow through a branch model. The Figma branching pattern (real-time *within* branch, explicit *between* branches) is the right architectural choice.

3. **CRDTs are still useful — but only inside a node, not across nodes.** Two engineers editing the same intent-statement TipTap field simultaneously should get smooth coediting (Yjs, Automerge, or similar). Two engineers editing the same node on different *branches* should get a structured merge UI.

4. **AI proposal history should not sync per-developer by default.** This is a non-obvious design decision. If Bob's local AI has been proposing aggressive refactors based on his coding style, those proposals shouldn't show up in Alice's inbox — they're derived from Bob's context, not the team's. **However**, *team-shared proposals* (drift events, monitor verdicts, verifier failures on shared branches) should sync. The split is: per-developer state for proposals derived from local AI work; team-shared state for ground-truth events on shared branches.

5. **The escalation point from per-developer to team-shared state is the merge.** When Alice merges her branch into main, her accepted/rejected proposals on shared nodes become part of the team's record (audit trail), but her *unreviewed* per-developer proposals stay local. This is consistent with how Git handles working-tree state vs. committed state.

6. **The resolver UI for natural-language merges is the main UX challenge.** Three-way diff (base / Alice / Bob) for code is well-understood. For natural-language intent + structured fields (acceptance criteria as bullets, constraints as cards, decisions with alternatives), the resolver needs to:
   - Show the semantic diff (what changed in meaning, not what changed in characters).
   - Surface AI-suggested merges, with explicit confidence about whether the merge preserves both intents.
   - Allow side-by-side accept-this-version / accept-that-version / write-a-third for each conflicted field independently.

7. **The team-vs-solo permission model should follow the canvas/inbox split.** Canvas state (the graph structure) is team-shared via Git. Inbox state (review queue) is per-developer. Detail-panel edits are per-developer until merged.

### Design Implications Mapped to IntentGraph Surfaces

**The merge-conflict UX:**
When Alice and Bob both edit the intent of node `auth.login.expiry-check` on different branches, the merge surfaces as an inbox item of a new type: **"merge conflict"** (let's call this `M` in keyboard shortcuts). The merge-conflict row expands to:

```
╭─ Conflict on auth.login.expiry-check ───────────────────╮
│ Field: Intent statement                                  │
│                                                          │
│ Base (3 days ago, alice):                                │
│   "The system must reject expired tokens."               │
│                                                          │
│ Yours (alice/strict-auth):                               │
│   "The system must reject expired tokens immediately,    │
│    without grace period."                                │
│                                                          │
│ Theirs (bob/grace-window):                               │
│   "The system must accept expired tokens within a 5-min  │
│    grace window, with a refresh attempt."                │
│                                                          │
│ ⚠  Semantic divergence detected: these intents conflict. │
│ AI cannot auto-merge.                                    │
│                                                          │
│ [ Use yours ] [ Use theirs ] [ Write a third version ]   │
│ [ Open both nodes side-by-side in canvas ]               │
╰──────────────────────────────────────────────────────────╯
```

For *non-conflicting* fields on the same node (e.g., Alice added an acceptance criterion, Bob added a different one), the merge auto-resolves with a small "merged: 2 acceptance criteria from both branches" note, reviewable but not blocking.

For conflicting fields where both branches added structured artifacts (e.g., both added a constraint), the resolver shows them side-by-side with "keep both / replace / combine" options.

**The "AI-suggested merge" affordance:**
When the AI thinks it can preserve both intents (e.g., Alice's "reject expired tokens" + Bob's "after 5-min grace window" = "reject expired tokens that exceed a 5-minute grace window"), it surfaces this as a *proposal*, not a default. The resolver shows the AI's proposed merge with explicit confidence (using the same asserted/inferred/semantic encoding from Q1) and the user can accept, edit, or override. The AI's merge proposals must run through the monitor LLM — this is exactly the kind of "did the AI faithfully capture both intents?" question the monitor exists to answer.

**Per-developer vs. team-shared state model:**
- **Per-developer (local-only):** inbox state, per-user AI proposal history, snooze settings, acceptance-rate tracking.
- **Team-shared (Git-synced):** graph structure (nodes, edges), node content (intent, criteria, constraints, decisions, rationale, code anchors), merge-event log, *resolved* AI proposals on shared branches.
- **Per-branch (Git-tracked):** unmerged AI proposals, branch-specific verifier outcomes, branch-specific monitor verdicts.

This means: when Alice pulls Bob's branch, she sees Bob's resolved decisions but not Bob's local inbox of unprocessed proposals.

**Permission model:**
- **Solo / branch-owner:** full edit on own branch.
- **Reviewer:** can comment on any node; can suggest edits via the proposal mechanism (AI proposals and human suggestions share the same UI primitive — this is a *strong* design choice that emerges from the research).
- **Maintainer:** can approve merges and resolve conflicts.
- These map cleanly to existing GitHub roles, which is the lowest-friction adoption path.

**Async coordination affordances:**
- Per-node comment thread (like Linear, like Notion) that lives *in the graph*, not in a separate channel.
- @-mentions on nodes generate inbox items for the mentioned user.
- "Decision request" inbox type (already in the spec) is the right primitive for explicit cross-developer coordination ("Alice, this needs your call before I merge").

### Concrete Design Recommendations for Q4

1. **(informs phase 5)** Implement Figma-style branch-and-merge for graph state, with per-branch AI proposal history and team-shared resolved-state on main.

2. **(informs phase 5)** Merge-conflict resolver UI as a new inbox item type (M for merge), with structured field-by-field conflict surfacing (not character-level diffs).

3. **(informs phase 5)** AI-suggested merge proposals with explicit monitor-LLM run; users see the AI's proposed merge but always accept/edit/override.

4. **(informs phase 5)** Three-tier state model: per-developer (inbox, snoozes), per-branch (proposals, branch-specific verifier outcomes), team-shared (graph structure, resolved decisions).

5. **(informs phase 5)** Yjs (or equivalent) CRDT for in-node coediting *within* the same branch; explicit branch-merge for inter-branch coordination.

6. **(informs v1.1)** Per-node comment threads with @-mentions generating inbox items.

7. **(informs v1.1)** Permission model mapped to GitHub roles (read/write/admin) for adoption ease.

8. **(informs v1.1)** "Branch from main" / "Open PR" / "Resolve conflicts" affordances exposed in the IntentGraph UI rather than requiring CLI git, mirroring Figma's in-app branching UX.

---

## Question 5 — Legibility of AI Decisions

### State of the Research Literature

The XAI literature has grown rapidly from 2022 onward, but the practitioner-oriented synthesis is anchored in four design-pattern libraries:

- **Google PAIR Guidebook** ("Explain for understanding, not completeness"). Their Explainability Rubric provides 22 concrete pieces of information across three levels. The key principle: explanations should support *the user's next decision*, not exhaust the system's reasoning.
- **Microsoft HAX Toolkit** (18 evidence-based guidelines across four phases: initially, during interaction, when AI is wrong, over time). Particularly relevant for IntentGraph: G6 ("Mitigate social biases"), G9 ("Support efficient dismissal"), G10 ("Support efficient correction"), G11 ("Scope services when in doubt").
- **IBM Design Ethics for AI** (transparency, accountability, explainability principles).
- **Apple HIG-AI guidelines** (2024–2025, integrated into Apple Intelligence).

The 2025 academic literature on faithfulness UI (arXiv 2510.27378, arXiv 2510.00047, arXiv 2409.17774, arXiv 2410.02970) is technically sophisticated but sparsely operationalized. The most actionable findings:

- **Counterfactual Consistency Score** (Ding et al., arXiv 2510.00047) — when an explanation cites concept X, modifying X should change the answer. This is directly applicable to IntentGraph's verifier outcomes ("here's the failing input that contradicts the intent" is a counterfactual).
- **Adversarial Sensitivity** (Manna & Sett, arXiv 2409.17774) for evaluating explanation faithfulness.
- **F-Fidelity** (arXiv 2410.02970) for formal evaluation of XAI methods.

The CoT-monitorability literature is the IntentGraph-specific anchor:
- **Anthropic's 2025 "Reasoning Models Don't Always Say What They Think"** — CoT reveal rate ~25% on hint-disclosure tasks; faithfulness training plateaus quickly.
- **Baker et al. (arXiv 2503.11926)** — cheap monitor LLMs catch reward hacking on stronger reasoners; this is the empirical backbone for IntentGraph's monitor architecture.
- **Korbak et al. (arXiv 2507.11473)** — CoT monitorability is fragile and architecture-dependent; *direct optimization on CoT erodes faithfulness*. This is the "never train against the audit signal" principle in IntentGraph's pillars and must be reflected in the UX (the monitor verdict is *about* the proposer's faithfulness, not used to retrain the proposer).

The developer-tools work on AI explanation:
- **Cursor**: keeps reasoning *close to the code*; intermediate steps visible; user verifies continuously because checking is cheap (Builder.io comparison). This is the "verify continuously" pattern.
- **GitHub Copilot**: probabilistic suggestions framed as suggestions, not commands; explicit "developer in the loop" framing.
- **Cody (Sourcegraph)**: source attribution by default — every suggestion links to the retrieved code/docs that informed it.
- **Devin (Cognition)**: transparent task execution — plan, progress, reasoning at each stage, with course-correction affordances. Devin 2.0's "Interactive Planning" presents the plan for review *before execution*. The Builder.io comparison frames Devin as creating "shared ownership by design" through summarized rather than streamed reasoning.
- **Cline**: opens-source extensible; explicit "explains its reasoning" + plan-then-execute pattern; emphasizes user-in-the-loop at every step.

The progressive-disclosure literature (Nielsen, IxDF, recent agentic-design.ai work) provides the structural pattern: agent reasoning should be exposed as **summary → detailed steps → technical reasoning trace**, with each layer revealed on demand.

### Specific Findings That Apply to IntentGraph

1. **Different AI action types need different visual treatments, not different sizes of the same treatment.** The dominant failure mode in current AI dev tools is treating "the AI did a thing" as a single category. IntentGraph has at least five distinct AI action types (drift detection, proposal generation, monitor verdict, retrieval, verifier outcome), and they are *epistemically* different — the monitor's verdict is *about* the proposer; the verifier's outcome is *about* code conformance to spec. Conflating them visually destroys legibility.

2. **"Explain for understanding, not completeness" is the right principle but is often mis-applied.** Practitioners read this as "show less" — but the actual principle is "show *what supports the next decision*." For IntentGraph, the next decision is accept/reject/investigate. The explanation that supports that decision is: *what does the AI claim*, *what evidence does it cite*, *did the monitor agree*, *did the verifier agree*. That's it. Everything else is on-demand.

3. **Retrieval source must be shown when retrieval occurred — but selectively.** Cody's pattern (every suggestion has a source) is the right default for code anchors. But for proposals derived from inferred reasoning across the graph, showing every retrieval would overwhelm. The PAIR rubric's distinction between *level 1* (the answer), *level 2* (key supporting evidence), *level 3* (full reasoning) is the right scaffold.

4. **Monitor verdicts should feel actionable, not threatening.** This is the most important Q5 finding. Cursor's "shared ownership" feel comes from the user being *part of* the verification loop. Devin's "shared ownership through delegation" is more remote. IntentGraph's monitor must feel like the former: a teammate who flagged something, not an auditor who caught the user. The framing should be: "Heads up: the monitor flagged this proposal as possibly unfaithful to the rationale. You probably want to check the trace." Not: "Faithfulness violation detected."

5. **Verifier outcomes are a *positive* feedback opportunity, not a failure.** When the verifier catches a problem with an AI proposal *before* it reaches the user's inbox, that's the system working. Surface this as: "the verifier caught this AI proposal — saved you a review." Aggregated weekly: "this week, the verifier caught 47 problematic AI proposals before you saw them." This is the analog of Sentry showing "errors prevented" or static-analysis showing "issues fixed pre-PR."

6. **Counterexample provenance must be concrete, not abstract.** Following the Counterfactual Consistency Score literature: "the verifier found this failing input: `{user: null, expiry: -1}` produces unauthorized access" — show the actual input, the actual output, the actual contradicted intent, and the inference path. The anti-pattern is "the verifier detected an issue."

7. **Inbox row vs. expanded view vs. detail panel is a three-layer disclosure problem, mapping cleanly to PAIR's three levels.** The inbox row is level 1 (the headline + decision affordance). The expanded view is level 2 (key supporting evidence, the trace). The detail panel is level 3 (the full natural-language stack and code anchors).

### A Per-Decision-Type Legibility Taxonomy

This is the most concrete Q5 deliverable. For each of the five AI action types, here is the proposed visual treatment across the three layers.

**Type 1: Drift Detection** (the AI noticed code diverged from intent)

- **Inbox row:** Yellow left-border. Headline: "Code drift on `auth/login.ts`." Subhead: "Implementation no longer matches intent: 'reject expired tokens'." Keyboard: Y (accept drift, update intent), N (reject drift, fix code), V (investigate).
- **Expanded view:** Side-by-side: the current code vs. the intent statement, with the conflicting bits highlighted. A single sentence: "The implementation now allows tokens up to 5 minutes past expiry; the intent says 'reject expired tokens' without qualification."
- **Detail panel:** Full intent stack + code anchor pointing to the divergent line. Decision options inline.

**Type 2: Proposal Generation** (the AI is suggesting a graph mutation or code patch)

- **Inbox row:** Blue left-border. Headline: AI-generated summary of the proposal. Subhead: confidence cue (asserted/inferred/semantic). Keyboard: Y/N/V.
- **Expanded view:** Diff (graph mutation or code patch) + AI's stated reasoning (1–2 sentences) + monitor verdict if available. Source-of-context shown ("derived from rationale on `auth.security`, decision on `token-handling`").
- **Detail panel:** Full natural-language stack of affected nodes; the proposal applied as a preview.

**Type 3: Monitor Verdict** (the cheap monitor LLM has assessed the proposer's reasoning)

- **Inbox row:** *Annotated onto* a Type 2 row, not a separate row. A small amber chevron at the right edge with hover-tooltip: "Monitor: low faithfulness — the proposer cited rationale R but the proposal contradicts R."
- **Expanded view:** Monitor's verdict in plain language ("The proposer's stated reasoning doesn't match what the proposal does. The proposer says 'preserves grace window'; the diff removes the grace check"), framed as a heads-up. *Critical:* the monitor is presented as a teammate, not an auditor.
- **Detail panel:** N/A — monitor verdicts attach to proposals, not nodes.
- **When monitor disagrees strongly:** Tier 1 (top-of-inbox) treatment. When monitor mildly hedges: Tier 2 with the chevron.

**Type 4: Retrieval Disclosure** (the AI looked something up to make this proposal)

- **Inbox row:** Not surfaced — would clutter.
- **Expanded view:** A "sources" line at the bottom: "Based on: `decision/token-handling` (3 days ago), `rationale/security-policy` (2 weeks ago), code at `auth/login.ts:42-58`." Each source is a click-through to the original.
- **Detail panel:** When the user opens a node that the AI generated/modified, the detail panel shows a "context used" section listing what the AI retrieved when generating it.
- **Anti-pattern to avoid:** showing retrieval as a separate inbox item. Retrieval is metadata on other actions.

**Type 5: Verifier Outcome** (the structured verifier ran against the proposal and produced a result)

- **Inbox row (failure):** Red left-border. Headline: "Verifier failure on `auth/login.ts`." Subhead: counterexample summary. Keyboard: Y (acknowledge, view counterexample), N (mark as false positive — requires reason).
- **Expanded view (failure):** Concrete counterexample: the failing input, the failing output, the contradicted intent or constraint, and the inference path the verifier used. Per the counterfactual provenance principle.
- **Inbox row (success, when proactively surfaced):** Green check inline, no separate row. Aggregated weekly into "verifier caught X proposals this week" status item.
- **Detail panel:** Verifier history attached to each constraint (already in the spec: "constraints as cards with verifier status"). Last-N runs visible.

**Cross-cutting visual conventions:**
- **Color is reserved for type, not severity.** Severity is communicated by inbox tier and by border weight, not hue. (Exception: red = verifier failure is universal enough to keep.)
- **Confidence is communicated by stroke style** (solid/dotted/question-mark/auto-badge) per the existing spec.
- **Source attribution uses a consistent "Based on:" formatting** across types, with click-through to source.
- **Monitor verdicts use a consistent chevron** that overlays other types rather than competing.

### Specific Findings on Each Q5 Sub-Question

**"Which trace details belong in the inbox row vs. expanded view vs. detail panel?"**

| Layer | What lives here | Cognitive purpose |
|---|---|---|
| Inbox row | Type, headline, confidence, keyboard hints, monitor chevron if present | Triage decision: skip / open / act |
| Expanded view | Diff or counterexample, 1-sentence AI reasoning, monitor verdict, top-3 sources | Accept/reject/investigate decision |
| Detail panel | Full natural-language stack, all sources, history, verifier results | Deep investigation, edit |

**"How to render 'the AI was uncertain about this' legibly?"**

Three signals together:
1. **Stroke style** on the confidence cue (dotted, semantic question mark).
2. **Two-line row layout** (the AI's *reason* for uncertainty as the second line).
3. **Default action shifted from Y/N to V** (investigate, not accept).

The three together make uncertainty *behaviorally distinct*, not just visually distinct. This is the key shift from the existing spec.

**"When to show retrieval source vs. just answer?"**

- For code anchors: always (Cody pattern).
- For graph-derived proposals: in the expanded view, not the row.
- For onboarding mode: more aggressively, even in the row, to teach users what the AI is reading.

**"How to make monitor LLM verdicts feel actionable rather than threatening?"**

Five framing rules:
1. Frame as a teammate observation, never as an audit finding.
2. Always paired with a concrete next action (open trace, override, ask for second opinion).
3. Never blocks the user's action without a hard-stop trigger (only for severe faithfulness violations on high-blast-radius proposals).
4. Aggregate positively: "this week, the monitor flagged 4 issues. You overrode 1, fixed 2, and the third turned out to be a false flag."
5. The monitor's verdict is shown *about* the proposer, not *about* the user. The user's behavior is never the subject.

**"How to surface 'this AI decision was caught by the verifier' as positive feedback?"**

- Per-week status item: "Verifier caught 47 AI proposals before you saw them." Click-through shows the list.
- Real-time toast (dismissible, low-noise): "Verifier caught a proposal on `auth.login`. Won't surface in your inbox."
- Weekly summary email/in-app digest: "This week the system prevented N issues from reaching you."

This frames verifier-caught issues as the system protecting the user, which is the correct affordance for the faithfulness pillar.

**"How to show counterexample provenance clearly?"**

- Show the literal failing input. Format as code.
- Show the literal failing output. Highlight the contradiction.
- Cite the contradicted intent/constraint by node and version.
- Show the inference path: "verifier found this by case-splitting on `expiry < 0`."
- One-click "open this in the canvas" to see the affected node.

This is the counterfactual-consistency principle from arXiv 2510.00047 made concrete.

### Concrete Design Recommendations for Q5

1. **(informs phase 4)** Build the per-decision-type legibility taxonomy as a documented design system before implementing the trace panel. The five types each get their own treatment.

2. **(informs phase 4)** Three-layer disclosure mapping: inbox row → expanded view → detail panel, with explicit content rules per layer per type.

3. **(informs phase 4)** Monitor verdicts overlay other types with a consistent chevron; never their own row except for Tier 1 severe verdicts.

4. **(informs phase 4)** Retrieval shown in expanded view, not the row, except in onboarding mode.

5. **(informs phase 5)** Counterexample provenance UI: literal input, literal output, contradicted spec, inference path, click-through.

6. **(informs phase 5)** Weekly "verifier caught" digest and real-time low-noise toasts, framing verifier-caught issues as protective.

7. **(informs phase 5)** Monitor verdict UI strictly framed as teammate observation, never as audit. No language that subjects the user.

8. **(informs v1.1)** Aggregated trust dashboard: per-month accept/reject/investigate rates, monitor agreements, verifier catches. Personal-only, never shared with managers.

---

## Adjacent Findings

### The Human-as-Supervisor-of-AI Pattern

The canonical research is the Endsley & Kiris (1995) "Out-of-the-Loop Performance Problem" paper, replicated repeatedly: when humans supervise rather than directly operate, four things degrade — vigilance, situation awareness, complacency-resistance, and skill retention. This is not an AI-era problem but a 1990s automation problem made urgent again.

The 2024–2026 literature converges on a few emerging patterns that work:

- **"Bicycle for the mind" framing** (Benson 2025, Substack): AI as augmentation, not replacement. The design move is to keep the human cognitively engaged in *decisions*, not just monitoring outputs.
- **Mixed-initiative interfaces** (the 2025 agentic-design.ai pattern library): both human and AI can initiate; neither is purely reactive.
- **Plan-then-execute pattern** (Cline, Devin 2.0 Interactive Planning): the AI proposes a plan, the user reviews and approves, then execution proceeds. Reduces complacency vs. streaming execution.
- **Confirmation breakpoints at high-risk moments** (UXmatters 2025 IT operations analysis): the AI pauses before significant actions and asks. Maps directly to IntentGraph's "Tier 1" hard-stop tier.

What's known to fail:
- **Pure dashboard-monitoring** (the operator watches the AI work) — leads to vigilance decrement within ~30 minutes.
- **Trust-but-verify with no verification affordance** — users say they verify but don't.
- **Asymmetric automation** where the AI handles 95% but the human is expected to catch the 5% — humans cannot maintain the necessary vigilance.

**Implication for IntentGraph:** the inbox is the right primary surface specifically because it engages the user in *active decision-making* rather than passive monitoring. The canvas is at risk of becoming a dashboard if not paired with active interaction. This argues for canvas affordances that require user input (selection, navigation, comments) rather than just visualization.

### The Mental-Model Gap Between AI and Human

The AI confabulation literature (Edwards 2023; Wolters Kluwer healthcare analysis 2024; arXiv 2503.05806; PMC 10619792) clarifies the term: AI produces *plausible-sounding fabrications* that fill gaps, not perceptual errors. The user-facing manifestation is "almost right but not quite" — exactly Stack Overflow's #1 developer complaint (66% of respondents).

In IntentGraph specifically, the most dangerous form of confabulation is the AI generating *plausible intent* the human didn't actually have. If the AI extracts intent from code and writes "the system intentionally allows expired tokens within a grace window" when in reality the code has a bug that allows expired tokens, the human reader has no way to distinguish AI-confabulated-intent from human-asserted-intent without provenance.

**This is precisely what the asserted/inferred/semantic/extracted confidence encoding solves** — but only if it's reliably maintained. The risk is that over time, inferred intents get edited by humans and lose their provenance. The fix is a *provenance-preserving edit history* on every node: when a human edits an inferred intent, the edit is timestamped and the inferred-flag downgrades only when the user explicitly asserts. Otherwise, the field stays inferred.

The Massenon et al. study (PMC 12365265) on user-reported LLM hallucinations in 3M mobile-app reviews found 1.75% prevalence in flagged reviews and 7 distinct user-perceived categories. The most common category is "false confident assertion." Direct implication: **the confidence visual encoding is doing real epistemic work and should not be deprioritized as a styling concern.**

### Notification Design Under High-Volume Async Events

The Sentry priority-sort experiments (issues #48477, #68908), Linear's triage inbox model, and the broader notification-infrastructure literature (Courier, SuprSend, NotificationAPI) converge on:

- **Three-tier priority** is the practical ceiling. More tiers and users can't keep them straight.
- **Batching by type within time-window** (15-min, 1-hour, daily digest) reduces notification fatigue 40–80%.
- **Default-filter-out low-priority** is critical at scale — Sentry's automatic filtering of low-priority issues from the default view was contentious but research shows it works.
- **Conditional resurface** (Linear's snooze-until-activity) is preferred to time-based snooze.
- **Quiet hours** (per-user preference) are now table stakes.
- **Aggregate "this week" summaries** for low-priority items.

GitHub's notification-inbox label-priority system (author > assigned > review-requested > participating) is a useful reference for how IntentGraph could prioritize when a single item has multiple reasons to surface.

**Implication for IntentGraph:** the existing inbox spec is consistent with these patterns but needs explicit batching and filtering rules. Recommended:
- Hourly batching for low-priority drift events on stable nodes.
- Per-week "summary digest" of low-confidence inferred suggestions.
- Default filter-out of items the user has dismissed previously of the same exact type (Sentry-style).
- Quiet hours setting (default off, opt-in).

### Direct Manipulation vs. Proposal-Based Interaction

Hutchins, Hollan & Norman's (1985) classic work on direct manipulation establishes that immediate, reversible, visible action is the gold standard for user agency. Proposal-based interaction (the user evaluates AI proposals rather than acts directly) inherently moves away from this gold standard.

The known failure modes specific to proposal-based interaction:
1. **Proposal blindness**: users stop reading proposals after a few hundred and start batch-accepting.
2. **Loss of authorship feeling**: users no longer identify with the work being done; this affects motivation and skill development.
3. **Diff-blindness**: humans are bad at reviewing diffs of natural-language artifacts (the *change* is hard to see when the *whole* is also unfamiliar).
4. **Reverse-engineering the proposal**: users spend time figuring out *why* the AI proposed something, rather than evaluating *whether* it's correct.

Mitigations from the research:
- **Allow direct edits alongside proposal review.** The user can always bypass the AI and edit directly. This is a critical autonomy affordance.
- **Frame proposals as suggestions, not assignments.** Language matters: "the AI suggests" vs. "the AI has proposed" vs. "complete this AI task." The first preserves user agency.
- **Make rejection cheap and consequence-free.** No follow-up "are you sure?" Every rejected proposal should disappear cleanly.
- **Show the diff in *meaning* terms** for natural-language artifacts, not just text-diff terms.

**Implication for IntentGraph:** ensure direct manipulation is a first-class operation. The user should be able to edit any node directly without going through a proposal. The proposal flow is *one way* to make changes, not the only way.

### Long-Term Skill Atrophy

The medical-imaging deskilling literature is the most direct analog: a 2024 Lancet study found adenoma detection rate fell from 28.4% to 22.4% when colonoscopists reverted to non-AI procedures after AI use. The Springer review (link.springer.com/10.1007/s10462-025-11352-1) catalogs deskilling across radiology, pathology, surgery, and primary care, with consistent findings that overreliance erodes both technical and cognitive skills.

The PMC 11239631 study finds that performers don't notice their own deskilling — a particularly important finding for IntentGraph because it means the user cannot self-correct.

The known mitigations:
- **Forced unaided practice on a regular cadence** (medical "use it or lose it" recommendations of 1-in-5 cases unaided).
- **Active critical engagement frameworks** like DEFT-AI (Diagnosis, Evidence, Feedback, Teaching).
- **Tracking skill metrics with and without AI** to detect divergence.

For software engineering specifically, the METR finding (arXiv 2507.09089) that experienced developers were 19% slower with AI but felt 20% faster is the canonical evidence that self-perception is unreliable.

**Implication for IntentGraph:** consider an opt-in "unaided review" mode where the user reviews a small number of proposals without the AI's stated reasoning visible — they have to derive their own understanding from the diff and the trace. Frame as a skill-retention practice, not a productivity feature. Aggregate per-user agreement rates between unaided judgments and the verifier's eventual outcome — this is a personal calibration metric.

This is a v1.2+ feature, not a v1, but it's worth flagging now because the architecture should accommodate it.

---

## Cross-Cutting Themes

Five themes emerge across all five questions and the adjacent findings:

### 1. Categorical Legibility Beats Continuous Scoring

Across confidence visualization (Q1), inbox sorting (Q2), AI legibility (Q5), and notification priority (adjacent), the same finding recurs: **categorical encodings (asserted/inferred/semantic/extracted; Tier 1/2/3; type-based color) outperform continuous scores (0.73 confidence, percentile sort, severity number).** This is true both because users misread continuous scores and because categorical schemes scaffold cross-team conversation. IntentGraph's existing visual language is already aligned with this; the recommendation is to *resist* the temptation to add continuous scores in v1.

### 2. Externalize What Cannot Be Internalized

The cognitive-depletion (Q2), automation-complacency (adjacent), and METR self-perception (across) findings all point to the same conclusion: **users cannot reliably self-monitor their own state under AI assistance.** The system must externalize: budget remaining, acceptance-rate by type, time since last break, items reviewed unread. The status bar is the right surface for this; it's already in the spec but should be extended to externalize budget context, not just pending count.

### 3. The Monitor Is a Teammate, Not an Auditor

Across Q1 trust calibration, Q5 legibility, and the human-as-supervisor adjacent finding, the framing of the monitor LLM is the single most consequential UX decision. **If the monitor feels like surveillance, users will work around it. If the monitor feels like a peer reviewer, users will engage with its verdicts.** Every UI surface where the monitor appears must use the teammate framing (heads up, you might want to check) rather than the audit framing (faithfulness violation detected).

### 4. Per-Decision-Type, Not Per-AI-Action

The legibility taxonomy (Q5), the trust calibration approach (Q1), and the notification design (adjacent) all converge on the principle that **the unit of design is the decision type, not the AI action.** Drift detection, proposal generation, monitor verdict, retrieval, verifier outcome — each is epistemically different and gets a different treatment. The spec already gestures at this with type badges in the inbox; the recommendation is to make this an explicit design-system axis with per-type styling guidelines documented.

### 5. Branch-and-Review for Semantic Units

The merge-conflict literature (Q4) and the structured-document CRDT literature (adjacent) both argue against character-level CRDT for intent statements, decisions, and rationale. **Branch-and-review at the node level, with CRDT only inside a node within a branch, is the correct architectural choice.** This influences phase 5 deeply and should not be deferred.

---

## Specific Design Implications Mapped to the Two-Surface Design

Below, every recommendation made above is consolidated and tagged for build-plan slotting.

### Informs Phase 4 (Core Surfaces, v1.0)

**Canvas:**
- C-P4-1: Onboarding-mode "team activity" filter highlighting recently-touched nodes.
- C-P4-2: Cmd-K toggle preserves last-position in inbox to avoid scroll cost.
- C-P4-3: Default canvas view is the recently-touched subgraph for new users in their first 30 days.

**Detail Panel:**
- D-P4-1: Onboarding mode auto-expands panel to 60% viewport with code anchors collapsed.
- D-P4-2: Provenance preserved on every field; inferred-flag downgrades only on explicit assertion.
- D-P4-3: Constraints render verifier status with the per-decision-type taxonomy.
- D-P4-4: Confidence visual encoding maintained: solid/dotted/question-mark/auto-badge.

**Inbox:**
- I-P4-1: Three-tier sort (blocking+monitor-flagged → high-leverage → backlog) with explicit tier markers.
- I-P4-2: Two row layouts: confident (one-line, Y/N primary) and uncertain (two-line, V primary).
- I-P4-3: Type-specific row treatments per the legibility taxonomy (drift / proposal / monitor / verifier).
- I-P4-4: Monitor chevron overlays other types rather than its own row.
- I-P4-5: Three pre-curated items on first launch with light didactic annotations.
- I-P4-6: Bulk-action affordances scoped per tier; bulk-accept restricted to Tier 3.
- I-P4-7: Cmd-Shift-Enter "highest-leverage next item" jump.
- I-P4-8: First-run failure-mode-by-category framing screen.

**Status Bar:**
- S-P4-1: Pending count with severity-colored dot (existing).
- S-P4-2: Budget context display: `12/25 · 23min · 3 high-leverage remaining`.

**Three-Layer Disclosure:**
- L-P4-1: Inbox row → expanded view → detail panel content rules per type, documented as a design system axis.
- L-P4-2: Retrieval source surfaced in expanded view, not row, except in onboarding mode.

### Informs Phase 5 (Team & Advanced Surfaces)

**Branching/Merging:**
- B-P5-1: Figma-style branch-and-merge for graph state.
- B-P5-2: Per-branch AI proposal history; team-shared resolved state on main.
- B-P5-3: Merge-conflict resolver UI as new inbox item type (M).
- B-P5-4: AI-suggested merge proposals run through monitor LLM; user always accepts/edits/overrides.
- B-P5-5: Three-tier state model (per-developer / per-branch / team-shared).
- B-P5-6: Yjs (or Automerge) CRDT for in-node coediting within a branch.
- B-P5-7: In-app "branch / open PR / resolve conflicts" affordances (no CLI required).

**Onboarding Deep Features:**
- O-P5-1: Reading-mode toggle (R) on detail panel for full-screen TipTap prose view.
- O-P5-2: Cmd-Shift-D opens whole graph as traversable reading document in dependency order.
- O-P5-3: Day-1-to-Day-7 onboarding scaffold with explicit milestones (3 inbox items by EOD-1, 20 nodes read by EOW-1, first edit by Day-4).

**Trust & Calibration:**
- T-P5-1: Per-type acceptance-rate watcher with non-modal protective banners (9-of-10 unread accepts triggers spot-check).
- T-P5-2: 25-item / 45-minute soft "take a break" intervention, personalized.
- T-P5-3: Modal/interruptive treatment reserved exclusively for monitor-flagged severe verdicts.

**Verifier & Counterexamples:**
- V-P5-1: Counterexample provenance UI: literal input, literal output, contradicted spec, inference path.
- V-P5-2: Real-time low-noise "verifier caught" toasts.
- V-P5-3: Weekly "verifier caught X proposals" digest.

**Monitor:**
- M-P5-1: Monitor verdict UI strictly framed as teammate; no language that subjects the user.
- M-P5-2: Aggregate weekly monitor-finding summary with override/fix/false-flag breakdown.

### Informs v1.1+

**Adaptive & Personalized:**
- A-V11-1: Per-user budget tuning that learns from post-hoc accuracy (±50% from initial 25/45).
- A-V11-2: Insert one novel-type item per five Tier-2 items to support knowledge-transfer (Bacchelli & Bird).
- A-V11-3: Per-user trust calibration metric: ratio of accepts/rejects/investigates by confidence tier; personal-only.

**Team Coordination:**
- TC-V11-1: Per-node comment threads with @-mentions generating inbox items.
- TC-V11-2: Permission model mapped to GitHub roles (read/write/admin).
- TC-V11-3: Buddy/mentor pairing affordance.

**Skill Retention:**
- SR-V11-1: Opt-in "unaided review" mode where AI's stated reasoning is hidden during review.
- SR-V11-2: Per-user agreement rate between unaided judgments and verifier outcomes (personal calibration metric).

**Notifications:**
- N-V11-1: Hourly batching for low-priority drift events on stable nodes.
- N-V11-2: Quiet hours setting.
- N-V11-3: Auto-filter previously-dismissed items of same exact type.

---

## Risks and Unknowns

This synthesis is opinionated, but several places deserve explicit honesty about what the research does and does not support.

**Strong evidence base:**
- Code review fatigue thresholds (SmartBear, Bacchelli & Bird) are robust.
- Clinical decision support override rates and tiering effects (Phansalkar et al., systematic reviews) are robust.
- Stack Overflow / METR / CodeRabbit AI productivity findings are recent but well-cited and consistent.
- CRDT limitations for natural-language merging (Peritext, Automerge research) are well-established.

**Moderate evidence base:**
- Trust calibration UX patterns (TCMM, CHI 2023 Wischnewski survey) are conceptually mature but operationally contested.
- Onboarding patterns derived primarily from industrial reports rather than RCTs; convergence is high but causal claims are weak.
- Decision-fatigue research is sometimes contested (ego-depletion replication concerns); the practical recommendations hold but the underlying mechanism is debated.

**Weak or thin evidence base:**
- The specific UX of monitor-LLM verdicts as a user-facing element. Almost no published research; the closest analogs are static-analysis warnings and CDS alerts. **This is the riskiest area of the design and deserves the most user-testing investment.**
- Long-term deskilling specifically in software engineering. The medical-imaging analog is suggestive but not a tight fit; software engineering has different practice patterns, and the deskilling literature there is essentially anecdotal.
- The faithfulness UI literature is genuinely new (most cited papers from 2024–2025) and the practical patterns are not yet well-validated. Treat all faithfulness-UI recommendations as v1 hypotheses to be tested.
- The "highest-leverage next item" sort algorithm has no direct empirical analog; it is derived from reasoning rather than from research.

**Internal contradictions in the research that the design must navigate:**
- **PAIR's "explain for understanding, not completeness"** vs. **the audit-trail requirement** (faithfulness via architecture). The first argues for less detail; the second argues for complete traces. *Resolution adopted here:* progressive disclosure — minimal in inbox row, expandable to full trace.
- **Tesla's strikeout intervention** vs. **autonomy preservation in human-AI teaming.** Tesla's pattern is mildly punitive; the human-AI literature pushes against punitive patterns. *Resolution adopted here:* protective framing, dismissible, non-punitive — mimics Tesla's *function* without the *valence*.
- **Notification batching for fatigue reduction** vs. **immediate surfacing for monitor-flagged items.** *Resolution adopted here:* tier-based interrupt policy — only Tier 1 interrupts.

**Questions the research does not answer for IntentGraph:**
- What's the right N for the "unread accepts" trigger? Picked 9-of-10 by analogy to Tesla; needs A/B testing.
- What's the right session-length threshold for take-a-break? Picked 45min as a soft floor of SmartBear's 60–90; needs personalization.
- Is the canvas the right primary surface for *experienced* users or should they also live in the inbox? The research can't say; depends on whether IntentGraph's canvas is more like a Figma file (panoramic) or more like a Linear roadmap (dashboard).
- How much do per-user trust calibration metrics affect actual behavior? Untested; the research suggests they should help, but personal trust dashboards in productivity tools have a mixed track record.

**Recommended early user-testing priorities (before phase 5 freeze):**
1. The monitor-verdict framing (audit vs. teammate language) — A/B test with 10–20 users, measure both subjective comfort and behavioral change.
2. The two row layouts (confident vs. uncertain) — eye-tracking study to verify users actually read the second line.
3. The merge-conflict resolver — task-completion testing with realistic conflict scenarios.
4. The onboarding inbox-first vs. canvas-first flow — split test with new users, measure time-to-first-meaningful-edit.
5. The "highest-leverage next item" affordance — usability testing to verify it gets used; if not, retire.

---

## Reading List for Phase 4–5 Design Internalization

In order of impact for IntentGraph specifically:

**Tier 1 — Must-read before phase 4 begins (core conceptual scaffolding):**
1. **Bacchelli, A. & Bird, C. (2013). Expectations, Outcomes, and Challenges of Modern Code Review.** ICSE 2013. (Microsoft Research). The single most relevant empirical work on what code review actually is and is not.
2. **The PAIR Guidebook chapter on Explainability + Trust** (pair.withgoogle.com/guidebook). Operational design patterns directly applicable to the legibility taxonomy.
3. **Anthropic (2025). Reasoning Models Don't Always Say What They Think.** arXiv 2505.05410. The faithfulness-rate finding that justifies the monitor architecture.
4. **Korbak et al. (2025). Chain of Thought Monitorability: A New and Fragile Opportunity for AI Safety.** arXiv 2507.11473. Why monitorability is architecture-dependent and what that means for never-train-against-the-audit-signal.
5. **Stack Overflow 2025 Developer Survey AI section** (survey.stackoverflow.co/2025/ai). The 84%/29% adoption-trust gap and the dominant frustration patterns.
6. **METR (2025). Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity.** arXiv 2507.09089. The 19% slowdown / 20% perceived-speedup finding.

**Tier 2 — Must-read before phase 5 begins (team and merge-specific):**
7. **Litt, Schickling, Gentle, Kleppmann (2022). Peritext: A CRDT for Rich-Text Collaboration.** Ink & Switch / CSCW. Why character-level CRDTs lose author intent.
8. **Figma Engineering. How (and why) we built branching.** figma.com/blog/how-and-why-we-built-branching/. Industrial case study most analogous to IntentGraph's needs.
9. **Phansalkar et al. (2009/2013). Tiered alerts for drug-drug interactions.** PMC 2605599. The 34%-to-100% compliance finding for tiered Level-1 hard stops.
10. **Endsley, M. R. & Kiris, E. O. (1995). The Out-of-the-Loop Performance Problem and Level of Control in Automation.** Human Factors. Foundational work on supervisor-mode degradation.

**Tier 3 — Background internalization (broader context):**
11. **Microsoft HAX Toolkit** (microsoft.com/en-us/haxtoolkit). The 18 guidelines, particularly G6, G9, G10, G11.
12. **Baker et al. (2025). Monitoring Reasoning Models for Misbehavior and the Risks of Promoting Obfuscation.** arXiv 2503.11926. The cheap-monitor-catches-strong-reasoners result.
13. **Steinmetz et al. (2025). Trust Calibration Maturity Model.** arXiv 2503.15511. Best current scaffold for trust posture self-assessment.
14. **Nordhoff (2024). A conceptual framework for automation disengagements.** Sci. Reports / PMC 11018869. Tesla disengagement study; the closest empirical analog to "supervising AI proposals."
15. **CodeRabbit (Dec 2025). State of AI vs Human Code Generation Report.** The 1.7×-issues-2.74×-XSS findings that justify structured verification as a wedge.
16. **Lee, J. D. & See, K. A. (2004). Trust in Automation: Designing for Appropriate Reliance.** Human Factors. The foundational trust-calibration paper everything else builds on.
17. **Linear's blog on UI redesign and triage.** linear.app/now/how-we-redesigned-the-linear-ui and linear.app/docs/triage. Concrete patterns directly portable.
18. **Sentry Issue #48477 ("Priority Sort") and Discussion #68908.** Industrial example of priority-sort tradeoffs in inbox UI.

**Tier 4 — Specialized but valuable:**
19. **Ding et al. (2025). Explanation-Driven Counterfactual Testing for Faithfulness in Vision-Language Model Explanations.** arXiv 2510.00047. Counterfactual provenance principle.
20. **Shapiro et al. and Phansalkar follow-ups on CDS alert fatigue mechanisms** (PMC 5387195). Cognitive overload vs. desensitization distinction.
21. **The Ink & Switch local-first essay** (inkandswitch.com/local-first/) for the broader philosophy of how the per-developer / team-shared state model should feel.
22. **Wischnewski, Krämer & Müller (CHI 2023). Measuring and Understanding Trust Calibrations.** The pre-interaction calibration finding.
23. **Cline's design choices and the Builder.io Devin-vs-Cursor analysis** (builder.io/blog/devin-vs-cursor) for the "verify continuously, because checking is cheap" pattern.

---

This synthesis represents the current research landscape as of April 2026 and should be treated as a living document. The riskiest design decisions — monitor-verdict framing, the merge-conflict resolver, and the inbox-as-onboarding-default — deserve early user testing before they harden into product habits the user base will then defend against change.