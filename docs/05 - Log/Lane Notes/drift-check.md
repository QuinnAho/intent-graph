---
lane: drift-check
branch: drift-check
worktree: .wt/drift-check
status: ready
go: Quinn, 2026-11-27
---
# Lane 2: drift check prototype

## Quinn's ask

"Drift check prototype": a script takes a commit, finds the linked spec nodes, and has a separate cheap model judge whether the intent still holds. Run it on our own last 20 commits and report hits and misses. On reuse: "use the best things of open source stuff rather than rewrite from scratch, we can cherry pick".

## Why this lane exists

It is one of the two things nobody ships (ADR 0029). Fiberplane's Drift tells you bound code changed. It cannot say whether the meaning still holds. This prototype answers one question with numbers: can a cheap model, given a spec node and the diff of the code bound to it, tell a change that breaks the intent from one that does not?

## What exists (read these, not the whole tree)

- `docs/01 - Product/Code Map.md`.
- `docs/02 - Decisions/0030-anchors-bind-a-node-to-code-and-checks.md`: the anchor format. `realized_by` says which code a node is about. Proposed, so use it on fixtures only.
- `docs/02 - Decisions/0025-scope-change-and-stale-requirement-detection.md`: the May design for stale requirements. Long. Read its Decision section only.
- `docs/02 - Decisions/0022-categorical-encoding-for-confidence-and-severity.md`: confidence is a category, not a number.
- `packages/skill/src/parser/tree-sitter.ts` and `parser/diff/`: the parser, and stubs for a signature hash and a body hash.
- `packages/skill/src/parser/spec-md/`: the spec parser.
- `.claude/agents/monitor.md`: the verdict JSON shape designed in May. Reuse its field names where they fit.
- The real spec nodes under `/spec` have no anchors yet.

## Steps

1. **Reuse check, 20 minutes at most.** Look at how Fiberplane Drift normalises a symbol before hashing (node kinds plus token text, so formatting does not count) and at OpenSpec's ADDED/MODIFIED/REMOVED delta format. Record adopt, borrow or skip under "Reuse record".
2. **Signature.** A normalised syntax hash for a file or a named symbol, built on the existing tree-sitter parser. Whitespace and comments must not change it. Unit tests first.
3. **Linking.** Given a commit or a range, list the changed files and symbols, and find the spec nodes whose `realized_by` targets them. A changed file with no node is reported as "no linked intent", never dropped silently.
4. **The judge.** For each (node, change) pair, send the node's text and the relevant diff hunks to a separate cheap model and get back JSON: node id, verdict (`aligned`, `drift` or `unclear`), a confidence category, a quote from the diff as evidence, and a one-line suggested action. Call it as a subprocess of the `claude` CLI in print mode on the haiku model, with no tools and a budget cap per call. Read `claude --help` for the exact flags. The judge never edits a file and never sees who wrote the change.
5. **A command** `tools/drift.mjs` in the style of `tools/verify.mjs`: `node tools/drift.mjs --range <a>..<b> --root <dir>`, one PASS or FAIL line, a JSON report under `.runs/drift/<timestamp>/`, and the cost and seconds per judged pair. A docs-only commit makes no model call. A huge diff is cut safely and marked.
6. **Seeded cases** under `tests/fixtures/drift-cases/`: at least three changes that break an intent and three that do not (a rename, a reformat, a comment, a refactor that keeps behaviour). Each case is a tiny workspace with a spec node, anchors, a before and an after.
7. **Run it for real.** Propose anchors for the real spec nodes in a file under `tests/fixtures/` (do not edit `/spec`), then run the check over the last 20 commits on `main` that touched those targets. Put the table in "Results": commit, node, verdict, evidence, and whether you agree, with a reason.

## Files you may touch

`packages/skill/src/drift/**` (new), `packages/skill/src/parser/diff/**`, `packages/shared/src/schemas/**` for a new drift schema file, `packages/skill/tests/**`, `tests/**`, `tools/drift.mjs` (new), root `package.json` and `pnpm-lock.yaml` for dependencies only, and the "Reuse record", "Results" and "Builder notes" sections of this note.

Not yours: `/spec/**`, `packages/webview/**`, the rest of `docs/**`, `.claude/**`, `CLAUDE.md`, `eslint.config.mjs`, `tools/verify.mjs`, `tools/frames.mjs`, and any existing test (add tests, never delete or weaken one).

## Acceptance checks

1. `node tools/verify.mjs all` passes.
2. `node tools/drift.mjs` on the seeded cases writes a report with one entry per judged pair, and prints how many breaking changes it caught and how many harmless ones it wrongly flagged.
3. The signature of a symbol does not change when only whitespace or comments change, and does change when its logic changes. Unit tests prove both.
4. The judge runs on the haiku model with no tools and a budget cap. The total cost of the 20-commit run is in "Results".
5. No file under `/spec` is modified by the tool or by you.
6. Every new dependency is named in the report with its license and the reason.

More checks exist that you will not see. A verifier that did not build this will write its own seeded cases and run them.

## Not in this lane

Showing drift on the graph. Automatic spec edits of any kind. The file watcher (lane 1). GumTree, mergiraf or any AST diff beyond a hash. Training or tuning anything on the judge's output.

## Stop and report if

The judge cannot be called from a script within 30 minutes of trying. The gate cannot be made green in two tries. A step needs a change outside "Files you may touch". After 90 minutes.

## Reuse record

(builder fills this in)

## Results

(builder fills this in: the seeded-case counts, the 20-commit table, the cost)

## Builder notes

(builder: anything the next lane must know, in a few lines)
