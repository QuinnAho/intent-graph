---
type: research
updated: 2026-11-27
by: a research agent (sonnet), brief and synthesis by the orchestrator
---
# Landscape: who else keeps a living graph of intent in sync with code (2026-11-27)

Tags: [O] = the agent opened the page. [S] = search snippet or third-party summary only.

## Landscape

| Product | What | Launch | Truth | Visual | Two-way | Drift | Verify | Weakness |
|---|---|---|---|---|---|---|---|---|
| Augment Intent [O intentapp.dev, rest S] | macOS multi-agent workspace. A coordinator writes a living spec, agents run in worktrees, a verifier agent checks | Apr 15 2026 [S] | Markdown spec | Text | Agents update the spec as they finish [S] | No named feature | Verifier agent checks build, test, lint [O demo] | The spec is a document, not a formal contract [S] |
| GitHub Spec Kit [O] | Spec toolkit: constitution, spec, plan, tasks | 2025 | Spec files per feature | Text | No | None named | Light | Spec lifetime is tied to the change, not the feature [S]. About 152k stars [O] |
| AWS Kiro [O kiro.dev, GA date S] | Spec IDE and CLI: requirements, design, tasks, hooks, steering | GA about May 7 2026 [S] | Specs plus steering markdown | Text | Not stated [O] | Not stated [O] | Property-based tests, bugfix specs [O] | Heavy ceremony for small changes [S] |
| Tessl [O] | Was spec-as-source. Now an "agent enablement platform": skills registry | Sept 2025 | Skills registry | Text | n/a | n/a | Evals of skills | Pivoted away from spec-as-source [O] |
| OpenSpec [S] | Delta specs (ADDED/MODIFIED/REMOVED), archive merges into specs | 2025 | Specs folder | Text | Merge on archive | No | validate command | Mostly one maintainer [S] |
| Traycer [S] | Plan, then a verification pass against the plan | 2025 | Plan | Text | Edits the plan mid-run | Yes, output versus plan | Yes | The plan can change from what the user approved [S] |
| Windsurf Codemaps, DeepWiki [S] | Generated code maps and wiki | 2025 | The code | Visual map | No | No | No | Derived views, no intent or rationale |
| Google Antigravity [S] | Agent IDE with plan and walkthrough artifacts | Nov 2025 | Per-task artifacts | Text and screenshots | No | No | Walkthrough | Artifacts are per-task and throwaway |
| Cursor Plan Mode [S] | Editable plan saved to .cursor/plans | 2025 | Plan files | Text | No | No | No | Plans are not maintained |
| Swimm [O] | Pivoted to legacy modernization with a code-derived map | n/a | Code-derived map | Yes | Claims sync to main | Claims "in sync" status | Expert review | Left the dev-docs niche |
| Qodo [S] | Review gate: rules, Software Map, blast radius | 3.0 Oct 1 2026 | Rules and code | Partly | No | Review-time | Yes (review) | Review, not intent |
| Factory [S] | Droids, spec mode, Missions, AutoWiki | n/a | Markdown specs | Text | No | No | Review | Specs are per-feature plans |
| PlayerZero [O] | Production "context graph" for SRE and QA | 2026 | Code, tickets, incidents | n/a | n/a | n/a | Simulation | Ops focus, not design rationale |
| Drift (Fiberplane) [O] | CLI binds markdown specs to code symbols with tree-sitter. CI flags stale specs | Mar 25 2026 | Markdown | Text | No | Staleness only | No | Detects staleness, cannot judge meaning [O] |

Not found as a product: any 2026 tool that calls itself an intent graph, decision graph or program theory tool. Code-graph MCPs index code or chat memory, not intent with verification.

## Context graphs and decision traces

- Coined by Jaya Gupta and Ashu Garg at Foundation Capital in Dec 2025 [S]. A follow-up dated 2026-11-25 [O] defines the context graph as "a living record of decision traces, linked across entities and time". It explicitly excludes model chain-of-thought.
- Target: enterprise go-to-market, finance and support. Software engineering appears only in passing.
- Overlap: IntentGraph's decision nodes and agent traces fit the idea, so the vocabulary is useful. Nobody found ties decision traces to code-level obligations and verification. No evidence yet that decision-memory tools improve agent outcomes [S].

## Evidence update 2026

- GitClear "Maintainability Gap" [O, 2026 year to date]: duplicated blocks up 81% from 2023 to 2026, two-week churn up 15%, moved or refactored lines down from 21% (2022) to 3.8%. Correlational, and GitClear sells analytics.
- METR [O list page]: redesigned its developer experiment in Feb 2026 because of selection effects. The 2025 figure of 19% slower is not reversed [S]. The follow-up's "18% faster" has a confidence interval that includes zero, and METR calls it weak evidence [S]. Do not cite it.
- DORA ROI report [O via InfoQ, May 11 2026]: AI is an amplifier. 35 to 40% gain on simple greenfield work but 10% or less on complex legacy code.
- Storey, "Technical Debt to Cognitive and Intent Debt" [O abstract, arXiv 2603.22106, Mar 2026]: defines intent debt as missing written rationale, goals and constraints that humans and agents need. A conceptual paper that names the problem IntentGraph targets.
- Rationale extraction, arXiv 2609.03721 [S]: LLMs recover the "what" of decisions from commits but often miss the "why". This weakens the idea that AI can back-fill intent from code.
- Premise recovery, arXiv 2611.21367 [O, Nov 16 2026]: 1,060 ADRs in 36 repos. Best model F1 0.756 against a 0.466 baseline. Finding dependencies between decisions is feasible.

## Demand and failure signals

- Spec staleness is the named pain: specs frozen after the task, and a later feature changes an earlier one's behaviour [S].
- Pestelos, Jul 14 2026 [O]: write-back alone is the narrowest fix. Encodable intent belongs in tests and types. Non-encodable intent belongs in thin prose with human review. This matches the obligations idea.
- Retreated: Tessl dropped spec-as-source [O], Swimm left dev docs [O], CodeSee shut down.
- Traycer user warning: auto-updated specs drift from what the human signed off [S]. Any two-way sync needs a human gate.

## Where IntentGraph stands

**Commodity, do not build**: markdown spec generation and task breakdown, code maps and wikis, plan files, multi-agent worktree orchestration, agent memory stores, review gates.

**Still different, worth building**:
1. Typed nodes for decision, constraint and obligation, with obligations that bind to executable checks. Nobody ships this as a graph.
2. Drift judged at the intent level, not "the file changed".
3. Agent-action traces tied to those nodes.
4. Premise links between decisions (supported by 2611.21367).

**Risky**: models infer the "why" poorly. Augment Intent or Kiro can add a graph view in a release. Incumbents have distribution. One developer, a static graph and no sync loop yet. Keep human review on every write-back.

## Read first

1. Storey, Triple Debt Model: https://arxiv.org/abs/2603.22106 (Mar 2026)
2. Pestelos, "Your Living Spec Is Still Lying": https://ngpestelos.com/writing/your-living-spec-is-still-lying/ (Jul 14 2026)
3. Foundation Capital on context graphs: https://foundationcapital.com/ideas/context-graphs-ais-trillion-dollar-opportunity (Nov 25 2026 version)

## Sources opened

- https://intentapp.dev/ , https://github.com/github/spec-kit , https://kiro.dev/ , https://tessl.io , https://swimm.io , https://ampcode.com
- https://www.gitclear.com/the_ai_code_quality_maintainability_gap , https://metr.org/research/ , https://www.infoq.com/news/2026/05/dora-roi-ai-assisted-dev-report/
- https://arxiv.org/abs/2611.21367 , https://blog.fiberplane.com/blog/drift-documentation-linter/ , https://playerzero.ai/resources/context-graphs-building-engineering-world-models-for-the-age-of-ai-agents

## Not verified

Snippet-only: OpenSpec, Traycer, Codemaps and DeepWiki status, Antigravity, Cursor, Qodo, Factory, Kiro's GA date, Augment Intent's launch date, the original Foundation Capital essay date, the METR follow-up numbers, arXiv 2609.03721. Storey's full text was not read. No search found a 2026 "intent graph" product, which does not prove none exists.
