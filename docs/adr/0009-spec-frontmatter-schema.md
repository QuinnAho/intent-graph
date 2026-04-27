# ADR 0009 — Spec frontmatter schema

## Status

Proposed.

## Context

The `/spec/` tree is the dogfood corpus of the project: intent, constraint, and decision Markdown files with YAML frontmatter, parsed by the spec-driven loop (ADR-0003) and gated in CI by `scripts/check-agent-config.ts` (added under ADR-0006). Two surfaces describe the frontmatter today, and they disagree.

**`tech-spec.md` §6, Phase 0** — the canonical statement — says:

> `/spec/intents/*.md`, `/spec/constraints/*.md`, `/spec/decisions/*.md` with YAML frontmatter (`id, title, parent, verified_by`).

**`scripts/check-agent-config.ts:114-124`** — the validator that CI actually runs — enforces a slightly different but adjacent four-field set:

```ts
for (const key of ['id', 'title', 'parent', 'confidence']) {
  if (!(key in fm)) fail(file, `frontmatter missing required field: ${key}`);
}
const allowed = new Set(['extracted', 'inferred', 'semantic', 'asserted']);
if (fm.confidence && !allowed.has(fm.confidence)) {
  fail(file, `confidence must be one of ${[...allowed].join('|')}; got ${fm.confidence}`);
}
```

**The per-kind READMEs under `/spec/`** declare richer, kind-specific schemas:

- `spec/intents/README.md` — `id, title, owner, priority, target_kinds, status, created, updated`, optional `supersedes`, `related`.
- `spec/constraints/README.md` — `id, title, predicate_kind, expr, scope_node, verifier_id, status, created, updated`.
- `spec/decisions/README.md` — `id, title, status, deciders, created, updated`, optional `context_node`, `supersedes`.

None of the per-kind schemas include `parent` or `confidence`. The validator's set is closer to the tech-spec's `id, title, parent, verified_by` (it descends from that statement, with `verified_by` replaced by `confidence`), but the per-kind READMEs have drifted away from both.

The dogfood corpus is empty today — no real intent, constraint, or decision file exists. QA report 001 (`docs/qa/qa-report-001.md`) flagged this as **F-SPEC-FM-MISMATCH (major)**: a contributor following the per-kind READMEs will fail CI for missing `parent` and `confidence`; a contributor satisfying the validator will violate the README for missing `owner`, `target_kinds`, `predicate_kind`, etc. The first dogfood spec file will trigger the conflict. The intent of this ADR is to resolve the contract before that file is written.

This decision binds the spec graph that ADR-0003's spec-driven loop reads. It also constrains what `scripts/check-agent-config.ts` (added under ADR-0006) is allowed to enforce. Both ADRs are listed in *References* below.

## Decision

Adopt option (c): the validator enforces a small, kind-agnostic minimum, and the per-kind READMEs document the additional fields each kind is expected to carry as recommended-but-not-required.

Concretely:

- **Required minimum (validator-enforced).** Every file under `/spec/intents/`, `/spec/constraints/`, `/spec/decisions/` must carry frontmatter with these four fields: `id`, `title`, `parent`, `confidence`. `confidence` must be one of `extracted | inferred | semantic | asserted`. This matches the current validator at `scripts/check-agent-config.ts:114-124` and stays close to the canonical statement in `tech-spec.md` §6 (Phase 0). No schema changes to the validator are required by this ADR.
- **Recommended per-kind fields (README-documented).** The per-kind READMEs continue to document the richer kind-specific schemas, but those fields are advisory rather than CI-blocking:
  - intents — `owner`, `priority`, `target_kinds`, `status`, `created`, `updated`, optional `supersedes`, `related`.
  - constraints — `predicate_kind`, `expr`, `scope_node`, `verifier_id`, `status`, `created`, `updated`.
  - decisions — `status`, `deciders`, `created`, `updated`, optional `context_node`, `supersedes`.
- **Implementation surface for F-SPEC-FM-MISMATCH.** Update each per-kind README so its frontmatter example shows the four required fields explicitly, with the kind-specific fields listed below as "recommended". No validator change is required; the validator remains the authoritative gate for the required minimum.
- **Out of scope.** Reconciling `verified_by` (tech-spec.md §6) vs `confidence` (validator) is *not* part of this ADR. The validator's `confidence` field stays canonical for now; if the spec-driven loop in Phase 2/3 needs `verified_by` as a separate field, that is a follow-up ADR.
- **Future tightening.** When the dogfood corpus grows past ~10 files per kind and the recommended fields stabilize in practice, a follow-up ADR can promote a subset of the recommended fields to required and extend the validator (the path called out in ADR-0006 decision #3: "when the spec frontmatter schema grows, replace the scanner with `js-yaml` or similar"). That promotion is deliberately deferred so we don't bake schema choices ahead of usage.

## Consequences

**Wins.**

- Resolves F-SPEC-FM-MISMATCH without a validator rewrite or a README rewrite-from-scratch — the smallest patch that lets the first dogfood file land cleanly.
- Preserves both surfaces. The validator stays simple and dependency-free (no kind routing, no `js-yaml`); the per-kind READMEs continue to document the discipline a well-formed file aspires to.
- Aligns with `tech-spec.md` §6 (the canonical four-field statement) and with ADR-0006 decision #3 (the validator is intentionally narrow until the schema grows).
- Lets contributors and the `intentgraph-spec-writer` skill bootstrap a file that passes CI with four lines of frontmatter, then layer the recommended fields as the file matures.

**Costs.**

- Two-tier discipline (required vs recommended) is weaker than per-kind enforcement. A contributor can ship a constraint without `predicate_kind` or `verifier_id` and CI will not catch it. The downstream consequence is that the spec-driven loop must tolerate (or warn on) missing recommended fields rather than relying on them. For Phase 2 (static graph build) this is acceptable; for Phase 3 (when verifier wiring needs `verifier_id`) the follow-up ADR will likely promote that field to required.
- The validator's `confidence` field is not yet documented in the per-kind READMEs. The implementation pass that closes F-SPEC-FM-MISMATCH must add it.
- The tech-spec.md §6 wording (`verified_by`) and the validator (`confidence`) still diverge. This ADR records the divergence as deliberate-for-now and defers the reconciliation.

**What this forecloses.**

- It forecloses option (a) for now: per-kind enforcement in the validator is tabled until the corpus matures. A future ADR can revisit if the schema stabilizes and the cost of missing fields becomes concrete.
- It does not foreclose option (b): if the per-kind READMEs continue to drift in practice, a future ADR can simplify them down to the validator's set. This ADR keeps the optionality open.

## Alternatives considered

- **(a) The READMEs are canonical; extend the validator.** Route by directory in `scripts/check-agent-config.ts`, parse YAML properly (replace the dependency-free scanner with `js-yaml`), enforce the full per-kind schemas. Estimated ~60 lines of code plus tests, plus a new dependency. Rejected for now because (i) the dogfood corpus is empty, so there is no evidence that the richer schemas are the right ones — promoting them to CI-blocking would freeze a guess, and (ii) ADR-0006 decision #3 explicitly defers parser-upgrade work until the schema grows. This option is the natural follow-up if the recommended fields prove load-bearing in Phase 2 or 3.
- **(b) The validator is canonical; rewrite the READMEs.** Strip the per-kind READMEs down to `id, title, parent, confidence` plus optional fields. Lower discipline overall, and most directly aligned with `tech-spec.md` §6. Rejected because the per-kind fields (`predicate_kind`, `verifier_id`, `target_kinds`) carry real semantic weight from the spec graph (ADR-0003) — losing them from the documentation would make the dogfood corpus harder to write well, even if it would pass CI. Discarding the richer schema also throws away thinking that has already been done about what each kind needs.
- **(c) Split the difference. [Adopted.]** Validator enforces a small, kind-agnostic minimum; READMEs document recommended-but-not-required per-kind fields. Preserves both surfaces, ships the smallest patch, and leaves a clear upgrade path to (a) once the corpus matures.

## References

- `tech-spec.md` §6, Phase 0 — canonical statement of the YAML frontmatter (`id, title, parent, verified_by`).
- ADR-0003 — `0003-spec-driven-loop.md` — the spec-driven loop is what reads this frontmatter.
- ADR-0006 — `0006-agent-configuration-setup.md` — established `scripts/check-agent-config.ts` and the dependency-free scanner that this ADR keeps in place; decision #3 is the explicit deferral this ADR honors.
- QA report 001 — `docs/qa/qa-report-001.md` — finding **F-SPEC-FM-MISMATCH** (major) is the conflict this ADR resolves.
- `spec/intents/README.md`, `spec/constraints/README.md`, `spec/decisions/README.md` — the per-kind READMEs whose frontmatter examples will be updated by the implementation pass once this ADR is accepted.
- `scripts/check-agent-config.ts:114-124` — the validator block that stays canonical for the required minimum.
