# ADR 0019 — Obligation attachment semantics: schema permissive, discipline at concept contract surface

## Status

Accepted 2026-05-03.

## Context

The `obligation` table in tech-spec §4.3 declares its anchor column as `intent_node_id TEXT NOT NULL REFERENCES node(id)` (tech-spec.md:225). The reference is to `node(id)` — *any* node — not to a node filtered by `kind`. There is no `CHECK` constraint, no trigger, and no application-layer narrowing that restricts the referent to `kind='intent'`. The Drizzle definition mirrors the spec literally at `packages/skill/src/db/schema.ts:120–146` (`intentNodeId: text('intent_node_id').notNull().references(() => node.id)`), and the Zod row schema at `packages/shared/src/schemas/obligation.ts:41–53` declares `intent_node_id: z.string()` with no node-kind narrowing. Today the schema accepts an obligation attached to a `code_module`, a `concept`, a `decision`, or any other node kind, and nothing in the codebase rejects it. The column name `intent_node_id` is aspirational: it suggests intents only; the substrate enforces nothing of the kind. The obligation `kind` enum (tech-spec.md:226–227, mirrored at `packages/shared/src/schemas/obligation.ts:8–14`) is `property | typecheck | formal | example | metamorphic` — five verifier-resolvable claim shapes, none of which carry node-kind constraints either.

ADR-0018 (concepts as the regeneration unit and primary scaling axis), accepted earlier this session, committed in prose that **the concept is the contract surface** and that big projects scale by concept count rather than depth of intent nesting. That commitment implies, but does not state, that obligations should cluster at concept boundaries — because if the concept is what other concepts depend on through `syncs_with` edges (tech-spec.md:208–210), then the verifiable claims that other concepts can rely on are the obligations attached to that concept's contract surface. ADR-0018 explicitly deferred the schema-side resolution of obligation attachment to a follow-up ADR (its consequences section names "a foundation for ADR-0019 on obligation attachment"). It introduced no substrate change; it committed only to interpretation. The schema-permissiveness gap is therefore inherited unresolved: ADR-0018's prose says obligations cluster at concept contract surfaces, and the schema accepts attachment to anything.

Phase-2 task `p2-t07` (Coverage Verifier, the first concrete `Verifier` against ADR-0016's interface) and the obligation-population tasks downstream of it begin filling the `obligation` table with real data starting now. The resolution affects either the schema (option (a): tighten the substrate so obligations cannot reference non-intent or off-contract-surface nodes) or the verifier behavior plus author guidance (option (b): keep the schema permissive and write the design discipline). Each option is a one-way door for `p2-t07` and its successors: option (a) lands as a migration plus an additional Zod refinement before phase-2 obligation work proceeds; option (b) lands as prose-level discipline that the `intentgraph-spec-writer` skill and the verifier UI consume in phases 4–5. Letting `p2-t07` accumulate rows under unresolved semantics would force a retrofit later, against rows whose attachment authorial intent is no longer recoverable. This ADR closes the question before the table accumulates real data.

## Decision

**Option (b) wins: the schema stays permissive; the discipline is written here.** The choice is recorded across three sub-decisions.

### 1. Schema stays permissive

`obligation.intent_node_id` continues to reference any `node(id)` without a node-kind constraint. The SQLite DDL at tech-spec.md:223–238 is read literally; the Drizzle definition at `packages/skill/src/db/schema.ts:120–146` is unchanged; the Zod row schema at `packages/shared/src/schemas/obligation.ts:41–53` is unchanged. The column name `intent_node_id` is preserved despite being aspirational, because renaming it would be a schema migration with no behavior change and the discipline written below puts intent-attachment back in scope as the recommended pattern. The aspiration the column name carries is now made truthful by the discipline rather than by the constraint.

The load-bearing reason to leave the schema alone: option (a)'s database-level enforcement requires either a SQLite trigger that reads `node.kind` on insert and update of obligation rows, or app-layer validation with no DB-level guarantee. ADR-0015 (schema scope) declined comparable trigger gymnastics for the `task.body.status` enum on the same posture — `CHECK` cannot constrain across rows without trigger machinery the project does not want to take on. App-layer-only validation gives no stronger guarantee than option (b)'s discipline, because both are violated by a buggy or adversarial writer; option (b) at least admits this honestly rather than pretending the Zod refinement is enforcement. Option (a) also requires a positive answer to "what is the contract surface of a concept" before the schema can encode it, and ADR-0018 — while committing that the concept *is* the contract surface — did not commit which intents within a concept are part of that surface versus internal-only. Encoding "obligation must attach to an intent on a concept's contract surface" needs another design pass we do not have substrate for.

### 2. Discipline: obligations attach at concept contract surfaces

Operationally, an obligation should attach to an intent or constraint node whose role is to be part of a concept's external contract — that is, the surface of intents and constraints that other concepts could plausibly depend on without depending on the rest of the parent concept's contents (per ADR-0018 commitment 3's vocabulary). Internal-only intents — intents that exist solely to organize structure within a concept and have no `syncs_with`-bearing role for other concepts — should not carry obligations. If they do, the obligation is treated as **informational**, not load-bearing for the concept's verification status. Constraints (per tech-spec §4.1's node-kind list) remain valid attachment targets when they narrow an intent on the contract surface, because the verifier kinds in tech-spec.md:226–227 include shapes (`formal`, `metamorphic`) whose natural attachment is to a constraint that narrows a contract-surface intent.

This is discipline, not enforcement. The schema accepts a violation; the discipline names it as a violation; the tooling (sub-decision 3 below) flags it heuristically until phase 4–5 substrate makes "concept contract surface" mechanically definable. The same caveat ADR-0018 commitment 3 carried — that vocabulary, contract-surface, and regeneration-cadence triggers are heuristics until telemetry from a running regenerator exists — applies here transitively.

### 3. Verifier and skill behavior: distinguish load-bearing from informational

The verifier scheduler from ADR-0016 does **not** change. It runs whatever obligations exist; it does not consult the discipline. The behavior described here is downstream of the scheduler:

- The `intentgraph-spec-writer` skill grows a heuristic check that warns when an obligation is being authored against an intent that does not appear to be part of any concept's contract surface — same heuristic-until-telemetry caveat as ADR-0018.
- The verifier's UI surface (CodeLens annotations on intent files, the drift inbox in the WebView) distinguishes "concept contract obligation failed" (load-bearing — the concept's external contract is broken, downstream concepts that `syncs_with` it should be alerted) from "internal-intent obligation failed" (informational — the concept's external contract is unaffected; the failure is interesting for the author but does not gate the concept's verification status).

Both pieces are out of scope for this ADR. They are tracked as phase 4–5 follow-ups and named here so the implementation roadmap is on the record.

## Schema implications

**No migration is required.** The Drizzle definition at `packages/skill/src/db/schema.ts:120–146` stays as-is. The Zod row schema at `packages/shared/src/schemas/obligation.ts:41–53` stays as-is. The SQLite DDL at tech-spec.md:223–238 stays as-is. The phase-2 obligation table that `p2-t07` will populate is the same table the spec describes today.

For the record, the counterfactual: had option (a) won, the schema implications would have been (i) a `CHECK` against a SQLite trigger reading `node.kind` on the referenced row, or an equivalent app-layer pre-insert check inside the storage port, (ii) a Zod refinement on `ObligationRowSchema` that takes a node lookup function and rejects rows whose `intent_node_id` resolves to a non-intent (or non-contract-surface) node, and (iii) a Drizzle migration adding the trigger or check. None of those land. Documenting this counterfactual makes the trade visible: option (b) saves a migration and a class of trigger maintenance at the cost of a discipline-only guarantee.

## Implementation implications

- `packages/skill/src/db/schema.ts:120–146` — no change.
- `packages/shared/src/schemas/obligation.ts:41–53` — no change to the row schema. A separate **author-time** schema or a runtime check that consults concept membership may grow alongside the `intentgraph-spec-writer` skill rule (sub-decision 3), but that is downstream of this ADR and lands as its own phase 4–5 task.
- `intentgraph-spec-writer` skill heuristic — out of scope for this ADR; tracked as a phase 4–5 follow-up.
- Verifier UI surface distinction between load-bearing and informational obligation outcomes — out of scope; phase 4 work.

**No code changes are required by this ADR.** It is prose-level discipline plus a deferred-until-phase-4 implementation roadmap. The same posture as ADR-0018: interpretation of substrate that already exists, not a substrate change.

## Consequences

What this enables:

- **Phase-2 obligation work proceeds without blocking on a schema migration.** `p2-t07` and its successors fill the table against the current DDL; no retrofit is needed once the discipline is in place.
- **The architectural model from ADR-0018 has a coherent obligation-attachment story.** ADR-0018 said the concept is the contract surface; ADR-0019 says obligations cluster at that surface and names internal-intent obligations as informational. Together they answer "what does it mean for a concept's verification status to be intact" without compounding schema migrations.
- **The verifier interface from ADR-0016 is unchanged.** The scheduler reads `o.kind` and runs the verifier; it does not consult node-kind. The interface stays narrow, which is what makes it stable for the next four verifiers (typecheck, formal, example, metamorphic).
- **Consistency with ADR-0018's interpretation-not-substrate posture.** Both ADRs commit to architectural model on top of existing substrate; together they keep the phase-2 monolithic schema (ADR-0015) intact.

What this costs:

- **The schema does not enforce the discipline.** An author can still attach an obligation to a `code_module` or to an internal-only intent and the database will accept it. The heuristic in the spec-writer skill (phase 4–5) is the only safety net; until then the discipline depends on author awareness of this ADR.
- **The column name `intent_node_id` continues to be aspirational.** It suggests intents only; the substrate accepts any node. A future ADR may revisit with a rename if the discipline holds well enough that the column meaningfully implies "intent node only." Until then, contributors reading the schema cold may be surprised by the gap between name and constraint, and the column name itself is a load-bearing piece of contributor-facing documentation that this ADR backs.
- **"Concept contract surface" is not yet mechanically definable.** The discipline names it; the substrate does not yet expose which intents within a concept are external versus internal. Mechanical enforcement requires the same telemetry ADR-0018 commitment 3 deferred (vocabulary extraction, contract-surface clustering, regeneration-cadence signals from the regenerator). Until that lands, both the spec-writer skill heuristic and the verifier UI's load-bearing-versus-informational distinction operate on heuristics that may produce false positives.
- **Two related classes of obligation failure are now in scope for phase 4 UI.** The CodeLens and drift inbox have to render two states (load-bearing failure, informational failure) instead of one. The visual distinction is downstream of this ADR but is now on the implicit roadmap, the same way ADR-0018's "deep intent nesting is a smell" lint is on the roadmap from there.

## Alternatives considered

- **Option (a): tighten the schema.** Add a SQLite trigger or an app-layer check that `intent_node_id` must reference a node with `kind='intent'`, plus an additional check that the referenced intent is part of some concept's contract surface. Rejected because (i) the second check requires committing to a schema definition of "contract surface" the project does not yet have substrate to express, (ii) trigger gymnastics were declined for related reasons in ADR-0015 (schema scope), and (iii) the app-layer-only version of (a) gives no stronger guarantee than option (b)'s discipline — both are violated by a buggy writer. Option (a) also forecloses revision: once a trigger encodes a particular reading of "contract surface," changing that reading is a migration. Discipline is cheaper to revise.
- **Rename the column to `attached_node_id`.** Tempting because `intent_node_id` is aspirational and misleading on its face. Rejected because it requires a schema migration with no behavior change, and the discipline written here puts intent-attachment back in scope as the recommended pattern — making the aspiration truthful through authoring norms rather than through a DDL rename. A future ADR may revisit if telemetry shows the discipline is not holding.
- **Forbid obligations on constraints, allow only on intents.** Rejected because tech-spec.md:223–238 was authored to attach obligations to intents (the column name) but the verifier kind enum at tech-spec.md:226–227 includes kinds (`formal`, `metamorphic`) that are more naturally attached to a constraint that narrows an intent on the contract surface. Restricting attachment to intents only would re-litigate that decision in this ADR; that is not this ADR's job. The discipline above accepts intents and constraints both, on the contract-surface condition.
- **Defer the decision until phase 4.** Rejected because `p2-t07` and downstream phase-2 tasks fill the obligation table starting now. A discipline that arrives after the table accumulates rows authored under unresolved semantics has to retrofit those rows, against authorial intent that is no longer recoverable. ADR-0017 made the analogous call for the task state machine: the QA blocker forced resolution at phase-2 because the schema was being committed; the same logic applies here for obligation attachment.

## References

- tech-spec.md:221–238 (`obligation` table definition — columns, constraints, index)
- tech-spec.md:225 (`intent_node_id TEXT NOT NULL REFERENCES node(id)` — no node-kind constraint)
- tech-spec.md:226–227 (obligation `kind` enum: `property | typecheck | formal | example | metamorphic`)
- `packages/skill/src/db/schema.ts:120–146` (Drizzle equivalent — `references(() => node.id)` matches the spec literally)
- `packages/shared/src/schemas/obligation.ts:8–14` (Zod `ObligationKindSchema`, mirroring tech-spec.md:226–227)
- `packages/shared/src/schemas/obligation.ts:41–53` (Zod `ObligationRowSchema` — `intent_node_id: z.string()`, no node-kind narrowing)
- ADR-0015 (schema scope: monolithic Drizzle schema in phase 2; declined trigger gymnastics for `task.body.status` enforcement on related grounds)
- ADR-0016 (verifier interface: scheduler reads `o.kind`, posts back via `event_log`; obligation flow is unchanged by this ADR)
- ADR-0018 (concepts as the regeneration unit and primary scaling axis; the prose commitment that the concept is the contract surface, whose schema-side this ADR resolves)
