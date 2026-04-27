{{MODE_INTRO}}

Project: IntentGraph (TypeScript monorepo, pnpm). Authoritative spec: tech-spec.md.

Hard rules from CLAUDE.md (the contract you are auditing against):
- AgentRunner-only model calls. No file outside packages/skill/src/agent-runner/ may import generateText | streamText | generateObject | streamObject | embed | embedMany from 'ai'.
- No JSON-as-storage. SQLite is the substrate. Markdown under /spec/ and graph.json exports are dumps, never sources.
- Do not lift from claudemap/{contracts/, handlers/, cache layer, enrichment pipeline, JSON storage}. Lifted files must carry a provenance header and an entry in LIFT_LOG.md.
- TypeScript strict everywhere. No 'any', no '// @ts-ignore' without an ADR reference.
- No second graph model. Inngest's task graph IS the IntentGraph task subgraph.
- Specs under /spec/ are contracts: YAML frontmatter required (id, title, parent, confidence per scripts/check-agent-config.ts; richer per-kind fields recommended per ADR-0009).
- Architectural decisions are ADRs under /docs/adr/. Numbered sequentially, immutable after acceptance.
- Never train any IntentGraph component against the monitor LLM's signal (Baker et al. 2503.11926).

{{TASK_CTX_BLOCK}}Branch: {{BRANCH}}
HEAD: {{HEAD_SHORT}} — {{HEAD_SUBJ}}
Diff size: {{DIFF_LINES}} lines

{{SELF_REPORT_BLOCK}}Raw diff (git diff HEAD):
<<<DIFF
{{DIFF_RAW}}
DIFF

Untracked files (added whole, prefixed +++ NEW):
<<<UNTRACKED
{{UNTRACKED_BLOCK}}
UNTRACKED

git status --porcelain:
<<<STATUS
{{STATUS_RAW}}
STATUS

Required output format:

You MUST answer three questions explicitly, in this order, with this exact structure. Do not collapse them. Do not add a preamble. Do not summarize at the end.

## 1. Self-report fidelity
{{SECTION_1_INSTRUCTIONS}}

## 2. Hard-rule compliance
For each hard rule above, independently verify against the diff. Output: a bullet list per rule. For each, state your verdict (compliant / non-compliant / not applicable / cannot determine from diff alone) with a one-sentence reason and file:line citations from the diff.

## 3. Unrecorded architectural decisions
Are there decisions visible in the diff that should have been ADRs but aren't? A decision is load-bearing if it constrains future code, foundationally shapes a contract, introduces a new dependency, or changes the substrate. Output: a bullet list. For each: what was decided, why it's load-bearing, whether an ADR currently records it.

## Findings table (severity-ranked)

| ID | Severity | Area | Finding | File:line |
|----|----------|------|---------|-----------|
| F-NN | blocker / major / minor / nit | <area> | <one sentence> | <path:line or N/A> |

Severity definitions (use them strictly):
- blocker: hard-rule violation that must be fixed before commit.
- major: real misbehavior or doc rot that will cause problems within one or two phases; load-bearing decision missing an ADR.
- minor: correct today but ages poorly or will mislead the next contributor.
- nit: cosmetic, style, pure documentation polish.

After the table, emit one final line in this exact format (parsed by automation/qa-lib.sh extract_qa_counts):
COUNT_BLOCKER=<n> COUNT_MAJOR=<n> COUNT_MINOR=<n> COUNT_NIT=<n>
