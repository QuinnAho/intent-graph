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

- **Fiberplane Drift (MIT): borrow.** Took its idea: hash tree-sitter node kinds plus token text, so formatting and comments don't count. sha-256 from `node:crypto` instead of XxHash3, no dependency. Its `path#Symbol@sig` target syntax comes in through ADR-0030. Not adopted as a tool: a Zig binary, not on npm, and it keeps bindings in a lock file. Built from the summary in the brief and ADR-0030. I did not read Drift's source this lane.
- **OpenSpec ADDED/MODIFIED/REMOVED deltas: skip for now.** That format is for proposing spec edits, and this lane makes none. Look again when "accept drift, update intent" lands. Written from memory, not re-read.
- **Monitor verdict (`.claude/agents/monitor.md`): borrow the field names.** Kept `evidence` (a quote) and a one-line action, named `suggested_action` because the ask is free text, not the `allow/review/block` enum. Dropped the numeric `score` (ADR-0022) and used a category, `high|medium|low`, instead.
- **Repo parser, grammar registry, frontmatter parser: adopt as they are.**
- **`claude -p` as the judge transport: adopt.** No model SDK is imported anywhere.
- **New dependencies: none.** `tools/drift.mjs` loads the TypeScript through `tsx`, which was already a root dev dependency.

## Results

**Seeded cases** (`node tools/drift.mjs`, 9 cases in `tests/fixtures/drift-cases/`): caught 4 of 4 breaking, missed 0, wrongly flagged 0 of 5 harmless, 0 unclear, 0 errors. 7 judged pairs, $0.0025, 38s. The reformat and comment cases were settled by hash with no model call. With `--judge-all` the judge sees those too and still scores 9 of 9: $0.0034, 46.7s. Every quote the judge gave was found in the diff.

**Real run.** Only 13 commits on `main` (after the root commit) touch the proposed targets in `tests/fixtures/drift-real/anchors.json`, so "the last 20" is all 13 of them:
`node tools/drift.mjs --range 9e3b45e..main --anchors tests/fixtures/drift-real/anchors.json --last 20`
13 commits, 21 pairs (20 judged, 1 by hash), 0 drift, 7 unclear, 0 errors. **Total $0.0244, 118.5s** (about 5.5s and $0.0012 per judged pair). The judge ran on haiku (`claude-haiku-5-5`) with no tools and a $0.05 cap per call.
A second run on the plain last 20 commits (`--range main~20..main`): 20 commits, 11 pairs, 0 drift, $0.0057, 62s. The docs-only commits made no model call.

| commit | node | verdict | evidence (short) | agree? | why |
|---|---|---|---|---|---|
| da97506 | constraint-no-direct-model-imports | aligned | `rel === AGENT_RUNNER_PREFIX \|\| rel.startsWith(...)` | yes | tightens the lint rule the constraint names |
| 51a19f8 | constraint-event-log-projection | aligned | `checkParseIntRoundTrip(...)` | yes | trivial property, touches no projector |
| 01b2f28 | developers-stay-in-their-editor | aligned | `<GraphCanvas nodes={[]} ...>` | yes | webview shell, nothing leaves the editor |
| b38e2cd | concurrent-agents-stay-consistent | unclear | `fence_token: z.number()...` | yes | schema only, diff cut at 12k chars |
| b38e2cd | agent-runs-are-traceable | aligned | `retrieved_node_ids: z.string()...` | yes | schema adds the trace fields |
| b38e2cd | constraint-occ-prevents-stale-writes | unclear | `version: integer('version')...` | yes | the column exists, enforcement is not in this diff (cut) |
| 4a65b86 | graph-state-survives-crashes | unclear | `export function initDatabase(...)` | no | WAL and backup-before-migrate support the node. Nothing broke, so aligned. My anchor misses the replay code |
| 4a65b86 | concurrent-agents-stay-consistent | aligned | `VEC_EMBEDDING_DIM = 1024` | yes | moves vec DDL, no OCC change |
| 4a65b86 | constraint-occ-prevents-stale-writes | aligned | `VEC_EMBEDDING_DIM = 1024` | yes | same |
| 167cf9e | example-graph-is-source-of-truth | unclear | `// node + edge insert payloads ...` | yes | the spec parser reads markdown into the graph. A real tension with this node |
| 6079853 | code-changes-raise-drift | unclear | `// Skill-side incremental parse cache.` | yes | three new files, diff cut |
| c74bdc9 | example-graph-is-source-of-truth | aligned | comment quoting the json-as-export rule | yes | the quote was not found in the diff, verdict still right |
| c74bdc9 | json-is-export-only | unclear | `_version: 1,` | yes | diff cut before the end of toGraphJson |
| ce8ecd4 | example-drift-is-detectable | aligned | `// Every Intent has at least one realizes edge` | yes | the coverage verifier serves the node |
| 1a0e4de | developers-stay-in-their-editor | aligned | `void loadGraphFromJson();` | yes | in-editor webview |
| 1a0e4de | json-is-export-only | aligned | `EXPECTED_FORMAT = 'intentgraph-l0-export'` | yes | read-only loader, which the node allows |
| 17e5065 | json-is-export-only | aligned | `publicDir: resolve(... '.intentgraph')` | yes | serves the export to read, never writes it |
| 3e66020 | json-is-export-only | aligned | `nodeKindById = new Map(...)` | yes | display-only change |
| 7f8e87f | json-is-export-only | unclear | `skeleton_symbols: result.summary...` | no | adds a summary field to the export, harmless. Should be aligned |
| 7f8e87f | example-drift-is-detectable | aligned | `extractUnknownSkeletons(...)` | yes | adds skeleton symbols, breaks nothing |
| 7f8e87f | code-changes-raise-drift | aligned (hash) | none | yes | grammar-registry.ts got 7 comment lines only |

I agree with 19 of 21. Both disagreements are over-cautious `unclear`s, not false drifts. `main` has no known breaking commit, so this run measures false flags only, not catching. The seeded cases cover catching.

**Independent verifier** (wrote its own cases): 8 of 8 right on hidden seeded cases, 9 of 9 verdicts the same across three runs, and a comment that lied about a breaking change did not fool the judge. It found four bugs, all fixed in the retry (see Builder notes).

**After the retry** (judge now in `--safe-mode`): seeded cases still caught 4 of 4, missed 0, wrongly flagged 0 of 5, 7 judged pairs, $0.0031, 49s. The numbers above this line were measured before the fix, while the judge could still see the user's global CLAUDE.md.
Real run again, same command: 13 commits, 21 pairs (20 judged, 1 by hash), **1 drift**, 7 unclear, 0 errors, 0 missing targets, **$0.0236, 153.3s**. It FAILs on that drift, and I agree with it. In b38e2cd, intent-concurrent-agents-stay-consistent promises "the per-row OCC version on every node and edge", and the drift is the `edge` table, which has no `version` column (only `node` has one, still true on `main` today). Evidence: `weight: real('weight').notNull().default(1.0),`. So this is a real gap that the earlier, leaky run missed. Other changes: 4a65b86 crashes went unclear to aligned (now I agree). 51a19f8 and 01b2f28 went aligned to unclear (I disagree, the diffs are plainly unrelated). 7f8e87f json-is-export-only stayed unclear (I disagree). I agree with 18 of 21, and all three disagreements are over-cautious `unclear`s.

## Builder notes

- Code: `packages/skill/src/drift/` (pure: anchors, unified-diff, link, judge. glue: git, claude-cli, run, cases, cli). The hash is in `parser/diff/signature-hash.ts`. Numbers are in `drift/tuning.ts`. The schema is `packages/shared/src/schemas/drift.ts`.
- PASS/FAIL: a range FAILs on any drift, judge or parse error, budget stop or missing target. `unclear` alone does not fail it. The cases FAIL on any miss, false flag or error. Report: `.runs/drift/<ts>/report.json`.
- Report rows: `confidence` is ADR-0022 (`extracted` for hash and missing-target rows, `inferred` for judge rows, `semantic` when nobody decided). `certainty` is `high|medium|low`, the judge's own word or `high` for a hash. `evidence` is never empty: a diff quote from the judge, or a plain sentence for the other rows.
- Retry fixes: (1) the tree-sitter binding reads through a 32 KiB buffer and threw `Invalid argument` on bigger files. `signature-hash.ts` now passes `bufferSize` sized to the input, and files over `maxParseBytes` (2 MB) or that fail to parse become `unclear` error rows, so one file never stops the run. The same 32 KiB bug is still in `parser/tree-sitter.ts` `parseFile()`, which is outside this lane. (2) Targets missing at the end of the range (missing file or symbol) get a `missing` row with no model call. (3) `--setting-sources project` did not stop `~/.claude/CLAUDE.md` loading. The judge now runs with `--safe-mode`, which skips every CLAUDE.md, auto memory, skills, plugins, hooks, MCP servers and custom agents, while login still works. `--bare` was rejected because it reads no OAuth login ("Not logged in" on this PC). (4) Every row now carries a confidence, a certainty and an evidence line.
- On Windows the `claude` npm shim is a `.cmd`, so `claude-cli.ts` finds `claude.exe` itself. `DRIFT_CLAUDE_BIN` overrides that.
- Windows file copies keep their mtime, so a same-size edit looked unchanged to git. The case runner drops the index before staging the after side.
- Hash blind spots, by design: anonymous `;` and `,` are dropped, so `[a,,b]` hashes like `[a,b]`. Quote style is normalised.
- The judge sees at most 12k chars of diff. Big scaffold commits get cut and come back `unclear`. Raise the cap or send per-symbol hunks.
- The anchors in `tests/fixtures/drift-real/anchors.json` are my guesses and need Quinn's confirm. None carries `@sig`.
