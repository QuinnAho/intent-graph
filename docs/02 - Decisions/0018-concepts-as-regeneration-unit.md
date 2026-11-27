# ADR 0018 — Concepts are the regeneration unit and the primary scaling axis

## Status

Accepted 2026-05-03.

## Context

The IntentGraph schema already names `concept` as one of the 9 node kinds (tech-spec.md:172–174) and gives the concept body a `regeneration_scope: 'atomic'|'cooperative'` field (tech-spec.md:193, with the inline comment "Jackson concept" pointing at Daniel Jackson's concept design, arXiv 2508.14511, declared as a Phase 0 dependency at tech-spec.md:541). The schema also makes the concept boundary first-class in two more ways: `node.parent_id` is annotated "concept boundary parent" (tech-spec.md:179), and the rendering layer treats concepts as React Flow sub-flows with `extent: 'parent'` (tech-spec.md:141). Concept-to-concept coordination is supported by the `syncs_with` edge kind (tech-spec.md:208–210), and the edge table's `edge_unique ON edge(src, dst, kind) WHERE deleted_at IS NULL` (tech-spec.md:216) handles the many-to-many shape that concept linkage produces.

What is *not* in the spec, and what this ADR adds, is the prose architectural commitment that ties those substrate features together: **concepts are the unit of regeneration, and big projects scale by concept count rather than by depth of intent nesting.** Today the only places this claim appears are an inline schema comment ("Jackson concept" at tech-spec.md:193) and a reading-list entry (tech-spec.md:541). Neither is load-bearing prose. ADR-0001..0005 establish the five pillars but none of them name concepts as the regeneration boundary, and ADR-0002 (relational graph store as substrate) declares concepts as a node kind without committing to their semantic role.

This gap was surfaced by a substrate-reflection check against the spec: the schema field exists, the rendering treatment exists, the edge kind exists, and the reading-list dependency is declared, but the interpretation that makes those substrate features cohere is not written down anywhere a future contributor or LLM session would find it. Per the project convention that load-bearing claims are recorded as ADRs so they can be superseded explicitly, that interpretation must live in `/docs/adr/`. This ADR closes the gap. It introduces no new substrate; it commits to the interpretation of substrate that already exists.

## Decision

### 1. Concepts are the regeneration unit

When a concept is regenerated, everything inside its boundary — every intent, constraint, rationale, decision, code_module, and code_symbol whose `parent_id` chains up to the concept (tech-spec.md:179) — is regenerated as one unit. The `regeneration_scope` field on the concept body (tech-spec.md:193) governs this unit's coordination posture:

- **`atomic`** means the concept regenerates wholesale. Its internal contents are produced as a single coherent output; partial regeneration of an `atomic` concept is not a supported state. The blast radius of a regeneration event for an `atomic` concept is exactly that concept's subtree.
- **`cooperative`** means the concept regenerates in coordination with the concepts it shares `syncs_with` edges with (tech-spec.md:208–210). A regeneration event on a `cooperative` concept may require concurrent or staged regeneration of its `syncs_with` neighbors; the regenerator must read the `syncs_with` edges and plan accordingly.

The schema field is now load-bearing: writes to `regeneration_scope` are not cosmetic, and downstream regeneration tooling (Phase 4–5) must respect it.

### 2. Big projects scale by concept count, not by depth of intent nesting

A "subsystem of a subsystem of a subsystem" in IntentGraph is **three concepts wired by `syncs_with` edges**, not a depth-3 intent hierarchy. The substrate already supports this directly: concepts are first-class containers via `parent_id` (tech-spec.md:179), `syncs_with` is one of the 9 typed edges (tech-spec.md:208–210), and `edge_unique` on `(src, dst, kind)` (tech-spec.md:216) lets the same concept participate in many concept-to-concept relationships without duplication. The rendering layer reinforces the model: concepts are React Flow sub-flow boundaries (tech-spec.md:141), so the visual experience of zooming into a subsystem is the same operation as crossing a regeneration boundary.

Deep intent nesting *within a single concept* is a design smell. It signals that a regeneration boundary is missing — the author has been growing internal structure where they should have been promoting a peer concept. Phase 4 and 5 tooling that flags this smell is downstream of this ADR; the commitment recorded here is what makes such a lint principled rather than stylistic.

### 3. Authoring rule: promote internal subtrees to concepts when their cadence diverges

When an internal subtree inside a concept develops any of the following properties, the author promotes it to a separate concept (a new `node` row with `kind='concept'`) and connects it to the parent with a `syncs_with` edge:

- It develops its own internal vocabulary that does not appear elsewhere in the parent concept.
- It develops its own contract surface — a coherent set of intents and constraints that other concepts could plausibly depend on without depending on the rest of the parent concept's contents.
- Its regeneration cadence diverges from the parent's. If the subtree changes on a different schedule, or in response to different drift events, than the rest of the parent concept, it has been a separate concept the whole time.

The `parent_id` chain (tech-spec.md:179) reorganizes accordingly: nodes that previously chained up to the parent concept now chain up to the promoted concept, and the promoted concept's `parent_id` either points back to the original parent (nested concept) or is null (peer concept). The `syncs_with` edge records the coordination requirement that made the promotion necessary.

This is the rule that makes commitment (2) actionable at edit time. Without it, "scale by concept count" is an aspiration; with it, an author has a concrete trigger for when to act.

## Consequences

What this enables:

- **Spec authors get principled guidance** on when to add a concept versus when to extend an existing one. Today a contributor faced with "this intent tree is getting deep" has no architectural rule to consult; after this ADR, the rule is: if the subtree's cadence, vocabulary, or contract surface has diverged, promote it to a concept and `syncs_with`-link it.
- **A principled answer to "how do big projects scale in IntentGraph"** that does not require reading Jackson's paper to extract. The answer is: by concept count, with `syncs_with` edges between them, not by intent-tree depth.
- **A foundation for ADR-0019 on obligation attachment.** The follow-up ADR closes the question of where obligations attach — to intents, to concepts, or to both — and that question is only well-posed once "concept boundary" has been committed to as a first-class regeneration unit. ADR-0019 will build on this commitment; without it, obligation attachment has no stable boundary to anchor against.
- **The reading-list dependency on Jackson 2508.14511 (tech-spec.md:541) becomes load-bearing.** Future contributors who skip the paper will discover, via this ADR, that the concept abstraction is doing real architectural work and is not a stylistic flourish.

What this costs:

- **We are now on the hook for tooling that helps authors recognize when an internal subtree should become a concept.** "Deep intent nesting is a smell" is a claim a future linter or skill should be able to enforce; until it lands, the rule depends on author discipline. The most natural home for that lint is the `intentgraph-spec-writer` skill (already covers frontmatter discipline) plus a CI check that flags concepts with intent subtrees deeper than some threshold. That work is out of scope for this ADR but is now on the implicit roadmap.
- **The three promotion triggers in commitment 3 (divergent vocabulary, divergent contract surface, divergent regeneration cadence) are heuristics until Phase 4–5 makes them mechanically enforceable.** Until then, they are author-facing guidance that the `intentgraph-spec-writer` skill and human reviewers apply by judgment. Mechanical enforcement requires (a) a vocabulary-extraction pass over a concept's intent subtree to detect terms that do not appear elsewhere, (b) a contract-surface analysis that identifies coherent intent/constraint clusters with external dependencies, and (c) regeneration-cadence telemetry that only exists once the regenerator from Phase 4–5 is actually running. Until all three exist, this ADR's commitment 3 is a discipline, not a check; treating it as a check before the substrate is in place would produce false positives the author has no principled way to dismiss.
- **The semantics of `regeneration_scope: 'atomic'|'cooperative'` are now load-bearing and need their own behavior spec at the point regeneration is implemented.** Phase 4 lands the AgentRunner and patch-proposal mode; Phase 5 lands the full forward-sync regeneration pipeline. By the time those phases execute, `atomic` and `cooperative` need a concrete operational definition: how the regenerator schedules `cooperative` concepts against their `syncs_with` neighbors, how partial-regeneration failures of `atomic` concepts are recovered, and how `event_log` records a multi-concept regeneration event. That is its own ADR (likely Phase 4) and its own implementation work; this ADR pins the field's *purpose*, not its operational semantics.
- **`syncs_with` edges in the spec corpus become more numerous.** As authors adopt commitment (3), the edge table grows in the `syncs_with` row — that is the intended outcome, but it means rendering performance (React Flow sub-flow density) and PPR retrieval (graphology pagerank traversals over `syncs_with`) need to be re-checked at L2/L3 dogfooding gates.
- **Existing intent-heavy spec content may need refactoring.** The `/spec/intents/` corpus today has no enforced concept structure; if this ADR is accepted and concept-promotion is later enforced, some intents will be reorganized under newly-introduced concept nodes. ADR-0019 and downstream phase work inherit that migration question.

## Implementation implications

**No code changes are required by this ADR.** The schema already has the `regeneration_scope` field on the concept body shape (tech-spec.md:193); the rendering layer already treats concepts as React Flow sub-flows (tech-spec.md:141); `syncs_with` is already in the edge kind list (tech-spec.md:208–210); and `node.parent_id` is already annotated as the concept boundary parent (tech-spec.md:179). This ADR is a prose-level commitment to the interpretation of substrate that already exists in tech-spec §4 and §3.5.

Code changes that *follow* from this ADR are explicitly out of scope and should land as their own tasks under Phase 4 or 5. Specifically:

- A lint or skill rule that flags deep intent nesting within a single concept and suggests promotion (commitment 3). Likely lives alongside `intentgraph-spec-writer` and runs in CI.
- A behavior spec — its own ADR — for the operational semantics of `regeneration_scope: 'atomic'` versus `'cooperative'` at the point the regenerator is built (commitment 1). Phase 4 or Phase 5.
- Any refactor of the existing `/spec/` corpus to introduce concept boundaries where the current intent trees have grown deep.

None of those are this ADR's work. This ADR's only deliverable is the prose commitment.

## Alternatives considered

- **Leave the commitment implicit in the schema (rejected).** The schema field, the rendering treatment, the edge kind, and the reading-list entry are all present, but no prose anywhere ties them together. Per the project convention that load-bearing claims are recorded as ADRs (CLAUDE.md "Hard rules"), implicit commitments cannot be superseded explicitly — a future ADR would have nothing concrete to point at when revising the regeneration model. The substrate-reflection check that prompted this ADR would not have surfaced the gap if a prose commitment existed; that the check *did* surface the gap is direct evidence that "leave it implicit" was not working.
- **Scale by depth instead of concept count (rejected).** Regenerating an intent in a deep tree cascades into all its descendants by `parent_id`, which is exactly the unbounded blast radius Jackson's concept abstraction (tech-spec.md:541, arXiv 2508.14511) exists to bound. Without a concept boundary, "regenerate this intent" has no natural stopping point; with one, the boundary is the concept. Choosing depth as the scaling axis would require either a different bounding mechanism (which the substrate does not provide) or an unbounded regeneration cost (which the architecture cannot afford in Phases 4–5).
- **Promote `syncs_with` to a separate `concept_link` table instead of a generic edge kind (rejected).** Tempting because concept-to-concept coordination is semantically distinct from, say, `realizes` or `references`. Rejected because the existing edge table handles the many-to-many shape cleanly via `edge_unique` on `(src, dst, kind)` (tech-spec.md:216), and a separate table would duplicate edge infrastructure (indices, soft-delete, body JSON, audit-via-event-log) for no schema gain. The 9-typed-edge model in tech-spec §4.2 is deliberate; specializing one kind into its own table sets a precedent the schema cannot afford.
- **Use the `syncs_with` edge but keep `regeneration_scope` as documentation only (rejected).** Equivalent to "leave the commitment implicit" but narrower: it would commit to concept-to-concept coordination via edges while leaving the per-concept regeneration cadence ambiguous. The two commitments (the unit *is* the concept; the cadence comes from `regeneration_scope`) are paired in the substrate — concepts that carry the field but not the meaning are dead schema. The ADR commits to both or neither.

## References

- tech-spec.md:172–174 (`concept` is one of the 9 node kinds in the `node.kind` CHECK constraint)
- tech-spec.md:179 (`node.parent_id` annotated "concept boundary parent")
- tech-spec.md:193 (concept body shape: `{ description, regeneration_scope: 'atomic'|'cooperative' }`, with the inline "Jackson concept" comment)
- tech-spec.md:208–210 (edge kind list including `syncs_with`)
- tech-spec.md:216 (`edge_unique ON edge(src, dst, kind) WHERE deleted_at IS NULL` — many-to-many concept linkage)
- tech-spec.md:141 (rendering: React Flow sub-flows for concept boundaries with `extent: 'parent'`)
- tech-spec.md:541 (Phase 0 reading list: Daniel Jackson, "The Essence of Software" / concept design, arXiv 2508.14511)
- ADR-0002 (relational graph store as substrate; `concept` is one of the node kinds, `event_log` is canonical)
- ADR-0003 (spec-driven loop; forward-sync regeneration is the operation this commitment shapes)
