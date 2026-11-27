# ADR 0030 — Anchors: how a spec node binds to code and to checks

## Status

Proposed. Written by the orchestrator on 2026-11-27 so two lanes could build against one format. Waiting for the owner's yes. Until then it is used only on fixture specs under `tests/`, never on the real files under `/spec`.

Follows up ADR 0009, which left `verified_by` for a later decision.

## Context

The static graph links a spec node to its parent and a code symbol to its file. Nothing links a spec node to the code that realises it or to the tests that prove it (`packages/skill/src/build-graph.ts` says so at its head). Both things ADR 0029 asks for need that link:

- Status on the graph needs to know which tests prove a node.
- The drift check needs to know which code a node is about.

Fiberplane's Drift (MIT, March 2026) already binds markdown to code. Its target syntax is `path#Symbol`, with a provenance mark after `@`, and it fingerprints the target with a normalised tree-sitter hash so reformatting is not flagged. It is a Zig binary with no npm package, and it detects that bound code changed without judging whether the meaning still holds.

## Decision

Borrow Drift's target syntax and keep the binding in the node's own frontmatter.

```yaml
realized_by:
  - packages/skill/src/parser/spec-md/index.ts#parseSpecTree@9f2c1a7b
  - packages/skill/src/build-graph.ts
verified_by:
  - packages/skill/tests/spec-md.test.ts
  - packages/skill/tests/spec-md.test.ts#rejects a missing id
```

1. **Target** is a repo-relative path with forward slashes. `#Name` is optional: an exported symbol for code, a test name for a test file. No `#` means the whole file.
2. **`@sig`** is optional, eight or more hex characters: the normalised syntax hash of the target at the moment a human last confirmed the node still held. It lives in the spec file, so `git log` of that file is the history of confirmations.
3. **Only a human confirmation writes or changes `@sig`.** An agent may propose it.
4. **Both fields are optional.** A node with neither is shown as unbound and pending. Nothing fails to parse.
5. **Two statuses per node**, shown on the graph:
   - checks: `verified` (every linked test passes), `failed` (any fails), `pending` (no `verified_by`)
   - binding: `aligned` (every signature matches), `changed` (a target's hash moved, nobody has judged it), `drift` (a model that did not write the change judged that the intent no longer holds), `unbound` (no `realized_by`), `unconfirmed` (bound, never confirmed)
6. **The hash is ours.** It comes from the tree-sitter pipeline already in `packages/skill/src/parser`, normalised so whitespace and comments do not change it.

## Consequences

- The spec files stay the single source. SQLite keeps a projection of the anchors for queries.
- Drift's `path#Symbol` form means its CLI could read our targets later, and a reader who knows Drift knows ours.
- A rename or move of a bound symbol shows as `changed` with a missing target. Following renames is a later problem (the Tech Spec's symbol identity section).
- A node's history of confirmations is visible in plain `git diff`, at the cost of one changed line per confirmation.

## Alternatives considered

- **Drift as a dependency.** Rejected for now: a Zig binary with no npm install, and it keeps bindings in a lock file outside the node.
- **A separate lock file for signatures.** Rejected: two places for one fact.
- **Inferring links from code with a model.** Rejected as the source of truth: research in November 2026 found models recover what a change does better than why. A model may propose anchors. A human confirms them.
