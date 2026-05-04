# ADR 0023 — Branch-and-review for graph state: three-tier state model with merge as a new inbox item type

## Status

Accepted 2026-05-03.

## Context

Tech-spec leaves inter-developer coordination underspecified. §3.5 line 144 names "Yjs only at the *node-text* granularity — full graph CRDT is overkill for one webview." §6 phase 5 references "audit/replay" and "Codex parity tests" but does not define how two engineers' graph edits compose. §6 phase 4 line 463 mentions "5s undo window" via worktree shadow + WorkspaceEdit but treats this as single-user undo, not multi-user merge. §7-E (line 517) flags the unbenchmarked "1000 Y.Docs in one webview" risk but does not specify the inter-developer merge story.

The UX research synthesis at `docs/research/ux-research-synthesis.md` Q4 ("Team Coordination and Version Control") is the most-research-supported and most-spec-thin section. The synthesis cites Ink & Switch's Peritext (CSCW 2022, lines 257–259), Automerge, Eg-walker (2024, line 259), Fugue (2023), and Semenov & Aksenov (2026 PaPoC, line 260) as a convergent body of evidence on a single finding: **plain-text and rich-text CRDTs preserve characters but not author intent.** Synthesis Q4 finding 1 (lines 273–275) makes the operative claim concrete: "If Alice writes intent 'the system must reject expired tokens' and Bob concurrently writes 'the system must accept expired tokens within a grace window,' a character-level CRDT will merge into an incoherent sentence. **IntentGraph must use semantic-unit branching for nodes, not character-level CRDT.**"

The synthesis's Q4 also names the right architectural shape (lines 277–283, 327–333):

- **Per-developer state** (local-only): inbox state, per-user AI proposal history, snooze settings, acceptance-rate tracking.
- **Per-branch state** (Git-tracked): unmerged AI proposals, branch-specific verifier outcomes, branch-specific monitor verdicts.
- **Team-shared state** (Git-synced through main): graph structure (nodes, edges), node content (intent, criteria, constraints, decisions, rationale, code anchors), merge-event log, *resolved* AI proposals on shared branches.

Inside a branch, on a single node, multiple engineers may coedit; there CRDT (Yjs or equivalent) is the right tool because the conflict shape is character-level keystrokes by collaborators who share the same editorial intent. Across branches, on the same node, the conflict shape is *semantic* — Alice and Bob may have different editorial intents — and the tool is structured branch-merge with a resolver UI. The synthesis names Figma branching (lines 263–265, 277) as the closest industrial analog: real-time multiplayer *within* a branch, explicit branch/review/merge *between* branches.

The synthesis's Q4 also commits to the **merge-conflict UX as a new inbox item type** (lines 295–323): a sixth type alongside ADR-0020's five, with field-by-field structured conflict surfacing, AI-suggested merge proposals that route through the monitor LLM (ADR-0021), and per-field "use yours / use theirs / write a third" options. The synthesis explicitly notes (line 286) that *naive* three-way diff for natural-language intent fails because it shows character-level deltas; the resolver must show the *semantic diff* — what changed in meaning, not what changed in characters.

The Phase 5 substrate that implements branching — per-branch storage of unmerged proposals, AI-suggested merges that the monitor reviews, the resolver inbox row, the in-app "branch / open PR / resolve conflicts" affordances — must commit to the three-tier state model and the merge-as-new-inbox-type before Phase 5 task decomposition. Without an ADR-level commitment, three failure modes are likely:

1. The simplest implementation reaches for a graph-wide CRDT (Yjs over the whole `node` + `edge` projection), which the synthesis's evidence forbids for semantic units.
2. The next-simplest implementation reaches for last-writer-wins on `node.body` updates, which silently drops one party's edits and is the worst possible behavior for intent statements.
3. The substrate-flavored implementation merges via Git directly on the markdown projection (since intents live as `/spec/*.md` per ADR-0009), which works for character-shape conflicts on the markdown but bypasses the inbox/resolver UX entirely and leaves AI proposal history with no defined merge semantics.

This ADR commits to the three-tier state model, names the merge-conflict inbox item type, and specifies how AI-suggested merges interact with the monitor LLM. It does **not** specify the resolver UI's pixel-level layout — that is downstream UX work — but it does commit to field-by-field structured conflict surfacing.

The substrate hooks already exist where they need to: `node` rows are timestamped and OCC-versioned (tech-spec §4.1 line 180); `event_log` (§4.6) is the canonical merge audit trail; `trace_event` (§4.7) records monitor verdicts on AI-suggested merges identically to other monitor reviews. The Yjs node-text granularity decision (tech-spec §3.5 line 144) is already aligned with this ADR — it is the *inside-a-branch* CRDT this ADR endorses.

## Decision

**IntentGraph implements Figma-style branch-and-review for graph state. Three tiers: per-developer state stays local; per-branch state is Git-tracked alongside the user's branch; team-shared state lands on main. Inside-a-branch coediting uses CRDT (Yjs node-text granularity, per tech-spec §3.5). Across-branch merges use a structured resolver UI surfaced as a new inbox item type.**

### 1. The three-tier state model

State is partitioned into three tiers with explicit storage rules:

**Tier A — Per-developer (local-only, never synced).**
- Inbox state: which items the user has reviewed, snoozed, dismissed.
- Per-user AI proposal history that has not been promoted to a branch (e.g., the user's local AgentRunner's exploratory suggestions).
- Snooze settings, quiet hours (when v1.1 lands those), acceptance-rate tracking (per ADR-0022).
- Personal trust calibration metrics (v1.1).

Storage: rows in the user's local SQLite that are *not* in the canonical event-log shape — they live in tables specifically marked `local-only` (the migration adds an explicit `local_user_state` schema namespace; details below). These rows do not enter `event_log` (which is the canonical commit-tracked log per ADR-0002). They never sync.

**Tier B — Per-branch (Git-tracked).**
- Unmerged AI proposals attached to nodes that exist on the branch.
- Branch-specific verifier outcomes (the obligation table per branch).
- Branch-specific monitor verdicts on proposals against branch state.
- The `event_log` rows produced on the branch since it diverged from main.

Storage: the SQLite database file is per-branch, named `intentgraph-<branch-hash>.db`, located in `.intentgraph/branches/`. Git tracks the database file using lfs-style binary tracking (synthesis line 81 explicitly observes "no `down.sql`, restore-from-backup instead" — the branch DB file is committed). Two engineers on different branches each have their own database file; pulling a branch fetches the database file alongside the markdown projection.

**Tier C — Team-shared (on main, Git-synced).**
- Graph structure: `node` rows, `edge` rows on main.
- Resolved decisions: `event_log` rows whose `kind` is a merge-resolution event.
- The `/spec/**/*.md` markdown projection (existing per ADR-0009; this ADR does not change markdown semantics).

Storage: `intentgraph-main.db`. This is the canonical state that other branches diverge from.

The boundary rule: when a user merges Tier B to Tier C (the equivalent of a Git merge to main), the merge-event log is the only thing that crosses the boundary unconditionally. Per-branch verifier and monitor outcomes from Tier B are written into Tier C's `trace_event` table only if the corresponding proposals were *accepted*; rejected/orphaned proposals stay in the branch DB and are pruned with the branch.

### 2. Inside-a-branch coediting uses Yjs node-text granularity

Two engineers working on the same branch and the same node (e.g., pair-editing an intent's prose body) coedit through Yjs at the per-node-text granularity, consistent with tech-spec §3.5 line 144. The Yjs Y.Doc lifetime is bounded to the node focus (TipTap is lazy-mounted on focus per tech-spec §3.5 line 143; the Y.Doc is created when the editor mounts and torn down when it unmounts). The Y.Doc's update events become `event_log` rows when the editor commits (e.g., user blurs the field, or the auto-commit timer fires).

Inside-a-branch CRDT is the only CRDT this ADR sanctions. Cross-branch merging is **never** CRDT-resolved — the resolver UI is the merge mechanism.

The §7-E spike (1000 Y.Docs in one webview) named in tech-spec is unaffected by this ADR; the spike still proceeds in Phase 3 as planned and validates the inside-a-branch case.

### 3. Across-branch merges surface as a new inbox item type

When the user attempts to merge a branch into main (or to merge another branch into their working branch), the merge process compares Tier B against Tier C node-by-node and emits one inbox item per conflicting node. This is the **sixth decision type** (extending ADR-0020's five), tagged `merge_conflict` with keyboard binding `M` (per synthesis line 295). The type extends ADR-0020's design system module.

Per-type rules for the sixth type (merge_conflict):

- **Layer 1 (inbox row)**: purple left-border (chosen because purple is unused in the existing taxonomy and the merge surface is semantically distinct from the five action types). Headline: "Conflict on `<node-id>`." Subhead: count of conflicting fields. Keyboard: M (open resolver) / S (snooze) / no Y/N — accept/reject does not apply at the row level; the resolver opens by default.
- **Layer 2 (expanded view)**: the resolver UI itself, with field-by-field conflict surfacing per §4 below.
- **Layer 3 (detail panel)**: not applicable directly — the resolver itself is the deep view. After resolution, the detail panel for the merged node returns to its normal Type 1/2/etc. rendering.

For non-conflicting fields on the same node (e.g., Alice added an acceptance criterion, Bob added a different one), the merge auto-resolves with a small "merged: 2 acceptance criteria from both branches" annotation, reviewable via the resolver but not a blocker.

For conflicting fields where both branches added structured artifacts (both added a constraint, both added a decision alternative), the resolver shows them side-by-side with "keep both / replace / combine" options.

### 4. The resolver UI shows semantic diff, not character diff

The resolver, for each conflicting field, shows:

- **Base** — the field value at the common ancestor commit. Cited as `(<timestamp>, <author>)`.
- **Yours** — the field value on the current user's branch.
- **Theirs** — the field value on the branch being merged.
- **Semantic divergence indicator** — a one-sentence prose summary of how the two values differ in *meaning*, generated by an AgentRunner trace (T1 model per tech-spec §2 Pillar 4 line 92). The prose summary is itself routed through the monitor LLM per §5 below.
- **Per-field action affordances**: "Use yours" / "Use theirs" / "Write a third version" / for structured fields, "Keep both" / "Replace" / "Combine."

The resolver does NOT render a character-level three-way diff for natural-language fields (intent, rationale, decision context, decision consequences). The character-level diff is available behind a "show character diff" toggle for users who want it, but it is not the primary surface.

For non-natural-language fields — code anchors (`uri`, `range`), structured frontmatter values (priority, kind, parent_id) — character/value-level diff is the primary surface because those fields have unambiguous identity.

The resolver writes the merge result to the user's branch DB (Tier B) and emits an `event_log` entry of `kind='merge.resolved'` with the field-by-field decisions. When the merge target is main, the same event log entry is what crosses into Tier C on the merge commit.

### 5. AI-suggested merges run through the monitor LLM

Per synthesis Q4 finding (lines 324–325), when the AgentRunner can propose a merge that preserves both intents, it surfaces the proposal in the resolver as one of the per-field options, alongside "Use yours" / "Use theirs" / "Write a third." The AI-suggested merge:

- Carries a confidence cue per ADR-0022 (asserted / inferred / semantic / extracted; in practice always `inferred` or `semantic` because the AI's merge is an inference from two human-written values).
- Routes through the monitor LLM identically to any other AgentRunner action — `trace_event.kind='model_call'` produces the merge proposal; `trace_event.kind='monitor'` produces the verdict; the verdict surfaces per ADR-0021 (heads-up framing, chevron-overlay on the proposed-merge option, never modal except at `recommended_action='block'`).
- Is **never the default selection.** The user must explicitly click "Use AI suggestion" — the resolver does not pre-select it. This is the synthesis's "always accept/edit/override" rule (line 351) plus ADR-0021's never-silent-override discipline.

A `block` verdict on an AI-suggested merge prevents that merge option from being selected without the override flow from ADR-0021 §2. "Use yours" / "Use theirs" are unaffected — they are the human-written branches, not the AI proposal.

### 6. In-app branch/PR/resolve affordances (no CLI required)

Per synthesis Q4 finding 8 (line 361), the IntentGraph UI exposes "branch from main," "open PR," and "resolve conflicts" affordances directly in the webview, mirroring Figma's in-app branching. The implementation maps to underlying Git operations:

- "Branch from main" → `git checkout -b <branch>` plus copy `intentgraph-main.db` to `intentgraph-<branch>.db`.
- "Open PR" → `git push` plus `gh pr create` if a remote exists. If no remote, the affordance is hidden.
- "Resolve conflicts" → opens the resolver inbox items for the in-progress merge.

These affordances are convenience surfaces, not substrate. Power users can continue to use Git CLI directly; the affordances do not replace the CLI but add an in-app path for users who do not want it.

### 7. What is *not* in scope

This ADR does not specify:

- The **permission model** (read/write/admin mapped to GitHub roles per coverage matrix V1.1.6). That is a v1.1 task and depends on this ADR being accepted but does not block this ADR.
- **Per-node comment threads** (coverage matrix V1.1.5). Threads layer on top of the three-tier state model but are independent and v1.1.
- The **resolver UI's pixel-level layout.** Phase 5 task work fills this in within the constraints of §3 and §4.
- The **conflict-detection algorithm** beyond "node-by-node, field-by-field." Phase 5 task work specifies how `node.body` JSON shapes are compared field-by-field (probably via Zod schema introspection plus a field-level equality check; details deferred).
- The **branch-DB pruning policy** (when does an abandoned branch DB get cleaned up?). Phase 5 hardening territory.

## Schema implications

**Modest DDL change, all additive.** The schema namespace `local_user_state` is added with at least these tables:

```sql
CREATE TABLE local_inbox_state (
  user_id   TEXT NOT NULL,
  node_id   TEXT NOT NULL,
  status    TEXT NOT NULL CHECK (status IN ('reviewed','snoozed','dismissed','pending')),
  ts        INTEGER NOT NULL,
  PRIMARY KEY (user_id, node_id)
) STRICT;

CREATE TABLE local_acceptance_rate (
  user_id     TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  accepts     INTEGER NOT NULL DEFAULT 0,
  rejects     INTEGER NOT NULL DEFAULT 0,
  investigates INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL,
  PRIMARY KEY (user_id, decision_type, window_start)
) STRICT;
```

These tables live in the per-branch DB but are flagged as local-only and are excluded from the `intentgraph-main.db` projection. The Drizzle migration that adds them runs only when the user first opens IntentGraph; no team-wide migration is required (each branch DB has its own copy).

The `event_log` (tech-spec §4.6) gains application-layer convention: `kind='merge.resolved'`, `kind='merge.ai_suggested'`, `kind='merge.proposed'`. No DDL change for `event_log` itself; the new `kind` values are application-layer per the §4.6 schema's free-form `kind TEXT NOT NULL`.

The branch-DB scheme requires a small change to existing tooling:

- `packages/skill/src/db/init.ts` — gains a per-branch DB selector (open `intentgraph-main.db` if on main, otherwise `intentgraph-<branch-hash>.db`).
- The Atlas migration linter in CI applies to the schema definition, not to per-branch DBs (the schema is still the same).

The `node` and `edge` and `obligation` and `trace_event` tables are unchanged. The lease table (§4.4) likewise.

## Implementation implications

- `packages/skill/src/db/branch-resolver.ts` (new, Phase 5) — given a Git branch name, returns the branch DB path; creates if missing.
- `packages/skill/src/merge/resolver.ts` (new, Phase 5) — node-by-node, field-by-field comparator that produces conflict descriptors.
- `packages/skill/src/merge/ai-suggest.ts` (new, Phase 5) — AgentRunner-routed AI merge proposal, monitor-reviewed.
- `packages/webview/src/inbox/MergeConflictRow.tsx` (new, Phase 5) — sixth-type row.
- `packages/webview/src/merge/Resolver.tsx` (new, Phase 5) — the resolver UI; consumes ADR-0020's design system for the sixth type's styling.
- `packages/extension/src/git/branch-affordances.ts` (new, Phase 5) — wraps `git`, `gh` CLIs for the in-app affordances.
- `packages/shared/src/protocol/merge-events.ts` (new, Phase 5) — wire format for conflict descriptors and resolution events.
- `.intentgraph/branches/.gitignore` and Git LFS configuration — Phase 5 task work to set up the branch-DB tracking convention.

The Phase 5 task list amendment groups these into: (a) three-tier state model substrate (DB selector, local_user_state schema), (b) the resolver inbox-row type and Resolver UI, (c) AI-suggested merge with monitor routing, (d) in-app branch affordances. Tasks (a) is the prerequisite for (b)–(d).

## Consequences

What this enables:

- **Two engineers can work on the same intent without one silently overwriting the other's meaning.** This is the load-bearing capability for team adoption.
- **Per-branch AI proposal history is properly scoped.** Bob's local AI proposals do not show up in Alice's inbox; they live in his branch DB until merged.
- **The synthesis's "verify continuously, because checking is cheap" pattern (line 388) extends to merges.** The resolver's per-field surface plus the AI-suggested merge plus the monitor verdict combine into a verifiable merge step.
- **Audit/replay (tech-spec §6 phase 5) gains merge events as first-class.** Past merge resolutions are reconstructable via `event_log` entries.
- **The Yjs decision in tech-spec §3.5 stays valid.** Inside-a-branch CRDT is the right tool for a coediting case; this ADR confirms it and bounds it.

What this costs:

- **Per-branch DB files are larger artifacts than markdown.** Git LFS-style tracking is required, which is a contributor friction (LFS hooks, occasional checkout complexity). Teams without LFS tooling have to set it up before adoption.
- **Branch DBs require a pruning policy.** Abandoned branches accumulate DB files; Phase 6 hardening covers the cleanup story but until then, repos may grow unboundedly. This is acceptable for v1 dogfood but needs a story before external pilots.
- **The resolver UI is new surface area with no v1.0 dogfood signal.** The synthesis recommends user-testing the resolver before hardening (line 762: "the merge-conflict resolver — task-completion testing with realistic conflict scenarios"). Phase 5 task list flags this with the "informed by research but unverified, A/B test before hardening" tag.
- **AI-suggested merges add a model-call cost on every merge.** Per merge with N conflicting fields, the AgentRunner is invoked at least N times (one prose summary per field, plus one monitor verdict per AI suggestion). This is fine at typical traffic but could become expensive on large merges. Phase 5 task work includes a cap (e.g., AI-suggest only on the first 5 conflicts; the rest get plain Use-yours/Use-theirs without a prose summary).
- **The CRDT-only-inside-a-node rule forecloses ambient cross-node CRDT.** A future product feature like "live multi-user canvas editing" (multiple users dragging nodes around in real-time) is not unlocked by this ADR. It would require a separate ADR amendment that is careful about the per-developer/per-branch boundary.
- **Markdown-as-canonical (ADR-0009) is preserved but the branch-DB is the working state.** When a user is on a branch, the markdown is regenerated from the branch DB on save; when they merge, the markdown projection on main is what other tooling sees. The two stay in sync via the bidirectional markdown sync from Phase 3, but the substrate of truth shifts to the branch DB inside the IntentGraph workflow.

## Alternatives considered

- **Graph-wide CRDT (Yjs over the entire graph).** Rejected. The synthesis's evidence base on character-level CRDT failure for intent statements (Peritext, Automerge, Eg-walker, Fugue, Semenov & Aksenov 2026) is unanimous: CRDT preserves characters, not author intent. A graph-wide Yjs would silently corrupt meaning in exactly the failure mode the synthesis names (line 275). Yjs at the per-node-text granularity (this ADR §2) is the maximum scope where the technology is fit for purpose.
- **Last-writer-wins on `node.body` updates.** Rejected. This is the worst-of-all-worlds posture: silent data loss without even the partial preservation that CRDT offers. A developer's day of work on an intent could be erased by a competing edit elsewhere on the team. The synthesis Q4 finding 1 is explicit that this is the failure mode the architecture must prevent.
- **Markdown-only merging via Git on `/spec/*.md`.** Tempting because the markdown projection already exists per ADR-0009 and Git's three-way merge is well-understood. Rejected because (a) the AI proposal history on a branch (Tier B) is not in markdown — it's in the SQLite tables — and Git on markdown alone leaves no merge semantics for proposals, monitor verdicts, or verifier outcomes; (b) Git's character-level merge on natural-language prose has the same intent-loss failure mode the synthesis warns about; (c) the user-facing UX would be Git's CLI conflict resolution (`<<<<<<<` markers in markdown), which violates the synthesis's "in-app branch / open PR / resolve conflicts" affordance recommendation. The hybrid proposed here — Git on markdown for compatibility plus IntentGraph's resolver for semantic merge — is the right shape; this ADR commits the resolver side.
- **One database file shared by all branches with branch-aware row tags.** Tempting because it avoids per-branch DB files and LFS tracking. Rejected because (a) the locking story is hard — multiple checked-out worktrees concurrently writing to one DB is the exact failure mode the better-sqlite3 + WAL choice was made to avoid (tech-spec §2 Pillar 2 line 71, "1 writer / N readers"); (b) cleanup of abandoned branches becomes a row-level pruning problem instead of a file-level delete; (c) the simplicity of "branch DB = file = Git artifact" makes audit and rollback obvious.
- **Defer the merge-conflict UX to v1.1 and ship Phase 5 with single-branch only.** Rejected. Single-branch-only is acceptable for solo dogfooding (which is L0–L2's gate model), but L3 explicitly contemplates "no merged PR contains an undocumented exported symbol" (CLAUDE.md L3 gate), which presupposes a team workflow with merges. Without the resolver, the team workflow has no merge story, and external pilot users (Phase 6) will hit the failure mode the synthesis warns about within their first week of two-developer use.

## References

- `docs/research/ux-research-synthesis.md` §Q4 (lines 250–361) — full state of the structured-document CRDT literature, the three-tier state model, the resolver UI, AI-suggested merges, and the in-app affordances.
- `docs/research/ux-research-synthesis.md` §Cross-Cutting Theme #5 (lines 633–635) — "Branch-and-Review for Semantic Units."
- `docs/research/phase-coverage-matrix.md` rows P5.7–P5.12 — the matrix entries this ADR closes.
- tech-spec.md:71–76 — Pillar 2 substrate (better-sqlite3 + WAL, single-writer constraint that drives the per-branch-DB choice).
- tech-spec.md:144 — Yjs node-text granularity (the inside-a-branch CRDT this ADR endorses).
- tech-spec.md:273–286 — `event_log` shape that holds merge-resolution events.
- tech-spec.md:289–323 — `trace_event` shape that holds AI-suggested-merge model calls and monitor verdicts.
- tech-spec.md:517 — §7-E open call (1000 Y.Docs spike); preserved as a Phase 3 spike.
- ADR-0002 (relational graph store as substrate) — the event_log canonical-shape commitment that constrains where merge events live.
- ADR-0005 (faithfulness via architecture) — the trace-event substrate this ADR's AI-suggested merges fit into.
- ADR-0009 (spec frontmatter schema) — the markdown projection that the branch-DB regenerates and the merge ultimately writes back to.
- ADR-0015 (schema scope: monolithic) — the migration baseline this ADR's additive `local_user_state` schema is layered onto.
- ADR-0020 (per-decision-type legibility taxonomy) — extended by this ADR with the sixth type (`merge_conflict`).
- ADR-0021 (monitor LLM presentation framing) — applied to AI-suggested merges' verdict surface.
- ADR-0022 (categorical encoding for confidence and severity) — confidence on AI-suggested merges follows the four-state vocabulary; resolver does not show probability.
- Synthesis cited primary sources: Peritext (Litt et al. CSCW 2022); Automerge / Eg-walker / Fugue work from Ink & Switch / Kleppmann group; Semenov & Aksenov 2026 PaPoC; Figma blog "How (and why) we built branching."
