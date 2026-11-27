# ADR 0026 — `parent_id` is concept-boundary only; module-symbol containment is edge-expressed

## Status

Accepted 2026-05-03.

## Context

Tech-spec §4.1 line 179 declares the `node.parent_id` column as `-- concept boundary parent`. Tech-spec §3.5 line 141 commits the renderer to "sub-flows for concept boundaries (`extent: 'parent'`)". These two lines together fix `parent_id` as the substrate for one specific UX primitive: a concept rendering as a React Flow sub-flow that visually contains its child intents and constraints. ADR-0009 (spec frontmatter schema) already encodes this on the authoring side, mapping `/spec/*.md` frontmatter `parent` fields onto `parent_id` for spec nodes whose parent is a concept.

The walker added in p2-t05 / p2-t06 produces two node kinds beyond what `/spec/*.md` produces: `code_module` (one per source file) and `code_symbol` (one per exported symbol). The walker as it shipped at commit 5c78f68 set `parentId: moduleId` on every `code_symbol`, expressing module-contains-symbol containment via `parent_id`. It also emitted a `produced_by` edge from each symbol to its module, expressing the same containment via the edge table.

This double-encoding silently broke the L0 canvas. p2-t08 / p2-t09 wired the webview loader to translate `parent_id` into React Flow's `parentId` + `extent: 'parent'` whenever the parent existed in the same envelope (`packages/webview/src/transport/graph-json-loader.ts:154` at HEAD before this ADR's fix). The check was existence-only, not kind-aware, so every `code_symbol` became a sub-flow child of its `code_module`. React Flow then rendered each symbol *inside* the module's chrome at position (0, 0) relative to the parent — the chrome did not expand, so the cards drew on top of each other. The L0 webview screenshot at `issue.png` shows the symptom: every visible "doubled card" is a module with one symbol stacked on it.

The walker's intent was reasonable read in isolation — modules do contain symbols — and ADR-0009 did not preclude using `parent_id` for non-concept relationships, because at the time it was written no producer was emitting non-concept parents. The renderer's existence-only check was reasonable read in isolation — at p2-t09 there was no canonical place to ask "is this parent supposed to be a sub-flow?". The two reasonable choices composed into a wrong one.

The deeper architectural question is whether `parent_id` should mean "concept boundary" only (tech-spec's stated reading) or "any container relationship" (the walker's expanded reading). Three forces push toward the narrower reading:

1. **Tech-spec §4.1 line 179 says "concept boundary parent"**, in the column definition itself. The narrower reading is the stated reading.
2. **Tech-spec §3.7 line 152** describes the structural code graph as "tree-sitter + LSP edges contain/import/invoke/inherit". Module-contains-symbol is a `contain` edge, not a parent_id link. The retrieval consumer (PPR-over-graphology, §3.7 lines 153–156) is written against edges, not against parent_id traversal.
3. **Tech-spec §3.5 line 141 names sub-flows as the only `parent_id`-driven render primitive**. Adding a second primitive (hierarchical layout for module-symbol nesting via ELK's `INCLUDE_CHILDREN`) is a real design choice — it asks how modules collapse, how edges cross the boundary, what a child-symbol's coordinate space is — and tech-spec asks none of those questions. Doing it now is committing to a UX that hasn't been specced.

Counter-argument for the broader reading: a future expand-a-module-to-see-its-symbols UX would want exactly the sub-flow primitive, and re-routing module-symbol through `parent_id` later would cost a walker change plus a migration. This is real but defers cleanly: when that UX is specced, it lands as its own ADR with hierarchical-ELK trade-offs measured (Risk-C spike, p2-t12/t13, is the nearest measurement). Until then the cost of premature commitment is concrete (the L0 canvas breaks) and the cost of deferral is bounded (a future walker change).

## Decision

**`parent_id` is concept-boundary only. Module-symbol containment is expressed by the `produced_by` edge (and its eventual rename to `contains` per §3.7) — not by `parent_id`.** Three sub-decisions.

### 1. Walker: `code_symbol.parentId` is `null`

`packages/skill/src/build-graph.ts` sets `parentId: null` on every `code_symbol` insert. Module-contains-symbol is preserved by the existing `produced_by` edge from symbol to module (one edge per symbol; verified post-fix at 487 edges for 487 symbols on the L0 dogfood seed). The retrieval consumer in §3.7 reads edges, not parent_id, so retrieval is unaffected.

The schema does *not* change. `node.parent_id` remains `TEXT REFERENCES node(id)`; no `CHECK (kind = 'concept')` is added at the FK target, on the same posture ADR-0015 took for `task.body.status` — SQLite cannot encode "the referenced row's `kind` column equals X" without trigger gymnastics the project has declined. The discipline is at the producer (this ADR + the walker comment) and at the consumer (sub-decision 2). A future writer that ignores both still gets accepted by the substrate; the gate is the renderer.

### 2. Renderer: sub-flow parenting is gated to concept parents

`packages/webview/src/transport/graph-json-loader.ts` resolves the parent's `kind` from the same envelope (a `Map<id, kind>`) and only sets React Flow's `parentId` + `extent: 'parent'` when the parent's kind is `'concept'`. Belt-and-braces against future producers re-overloading `parent_id`. The behavior for the legitimate concept case (intent or constraint pointing at a concept) is unchanged; the behavior for code_symbol pointing at code_module silently degrades to a flat-render, which is the correct render at L0.

A test at `packages/webview/tests/graph-json-loader.test.ts:128–150` codifies the gate against a code_module / code_symbol envelope.

### 3. The `produced_by` → `contains` rename is **out of scope for this ADR**

The `produced_by` edge name is a phase-2 placeholder; tech-spec §3.7 line 152 names the edge kind `contain` (singular). A rename has consumer-side implications (drift detection, retrieval, future PPR seeding) that warrant their own ADR or, more likely, a phase-3 or phase-5 task that touches all consumers in one pass. This ADR does not commit the rename; it commits only that module-symbol containment lives on the edge and not on `parent_id`, regardless of what the edge ends up being called.

## Schema implications

None. No DDL changes. The walker, the loader, and one test change. ADR-0009's frontmatter schema is unaffected — it already only emits non-null `parent` for concept-parented nodes. ADR-0015's monolithic-schema posture is reaffirmed by the explicit decision *not* to add a check constraint or trigger.

## Consequences

### Direct

- The L0 canvas renders modules and symbols as flat siblings. ELK lays them out without hierarchy. The "doubled card" rendering bug is resolved.
- The 487 `produced_by` edges in the L0 seed remain the canonical statement of module-contains-symbol. Any consumer that wants to traverse module-to-symbol asks the edge, not the parent.
- Concept sub-flows continue to work. The two example-concept children in the L0 seed (`spec/concepts/example-spec-driven-loop.md` parents `spec/intents/example-drift-is-detectable.md` and `…/example-graph-is-source-of-truth.md`) still render with `extent: 'parent'`.

### Indirect

- **A future "expand module to see symbols" UX requires its own ADR.** That ADR will weigh: hierarchical-ELK cost (the Risk-C spike at p2-t12/t13 is the closest measurement), edge-routing semantics for edges that cross the parent boundary, the collapse / expand interaction model. None of those are in tech-spec. Deferring is correct; the door is not closed.
- **`parent_id` remains structurally permissive at the schema layer.** A future writer can still set `parent_id` to anything that exists in the `node` table. The renderer's gate is the only line of defense at L0; phase-3's MCP `graph.upsert_node` (tech-spec §5 line 382 already names `parent_id?` as an optional field) inherits the same posture. If the discipline becomes load-bearing — e.g., a third producer also overloads `parent_id` — the right escalation is a Zod refinement at the application layer, *not* a CHECK constraint, on the same posture as ADR-0015 §3.
- **The phase-3 verifier surface gets a small new check candidate.** A "parent_id targets a non-concept" warning in the spec-writer skill or a coverage-style verifier is cheap to write and would catch authoring errors before they hit the renderer. Out of scope for this ADR; named here so it does not get re-discovered later.

## Notes

- The fix landed in commit 3e66020 ("p2-t09 follow-up: stop overloading parent_id with module-symbol containment"). This ADR was drafted after the fix because the rule is already in tech-spec; the ADR is bookkeeping.
- This ADR was written alongside ADRs 0017–0025 and accepted as a batch on 2026-05-03.

## References

- `tech-spec.md:179` — `parent_id TEXT REFERENCES node(id)` with the column comment "concept boundary parent"
- `tech-spec.md:141` — sub-flows for concept boundaries (`extent: 'parent'`)
- `tech-spec.md:152` — structural code graph uses contain/import/invoke/inherit edges
- ADR-0009 (Spec frontmatter schema) — concept-only `parent` field on the authoring side
- ADR-0015 (Schema scope: monolithic) — declined trigger gymnastics on the same posture
- ADR-0018 (Concepts as the regeneration unit) — the broader concept-as-contract-surface commitment that makes the narrow reading of `parent_id` more load-bearing
- `packages/skill/src/build-graph.ts:208–228` — walker writes `parentId: null` on code_symbol
- `packages/webview/src/transport/graph-json-loader.ts:132–167` — renderer gates sub-flow parenting on parent kind
- `packages/webview/tests/graph-json-loader.test.ts:128–150` — test for the gate
