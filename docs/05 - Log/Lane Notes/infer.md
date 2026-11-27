---
lane: infer
branch: infer
worktree: .wt/infer
status: ready
go: owner, 2026-11-27
---
# Lane 9: inferred intent, the script

## The ask

The owner, paraphrased: we should be able to see the intent and the intent inferred from the code, and a person should be able to change it easily. The owner said yes to a small experiment (see [[2026-11-27 Layers - Approaches]]): a cheap model reads code that no intent claims and proposes what it is for. This lane is the first half: the script and its report. The next lane puts the proposals on the graph. The owner reads this lane's proposals for this repo before anything is built on top, so their quality is the point.

## What exists (read these, not the whole tree)

- The isolated model call: `callClaude` in `packages/skill/src/drift/claude-cli.ts:64`. It runs a cheap model through the `claude` command line with no tools, a budget cap, a JSON schema and no user settings. Reuse it. Do not copy it.
- The pattern to follow for a prompt, a schema and a parsed reply: `packages/skill/src/drift/judge.ts`. For a command with one PASS or FAIL line and a report under `.runs/`: `tools/drift.mjs` and `packages/skill/src/drift/cli.ts`.
- Reading code: `collectProjectSnapshot` (`packages/skill/src/parser/fileWalker.ts:196`) walks the source tree. `symbolSignatures` and `signatureOf` (`packages/skill/src/parser/diff/signature-hash.ts:202` and `:217`) give a file's top-level symbols and a hash that ignores comments and formatting.
- Which code is already claimed: `readSpecAnchors` (`packages/skill/src/parser/spec-md/anchors.ts:90`) returns every node's `realized_by` anchors. The anchor form is `path#Symbol` (ADR 0030).
- The declared spec nodes: `parseSpecTree` (`packages/skill/src/parser/spec-md/index.ts`).
- The words for confidence: `docs/02 - Decisions/0022-categorical-encoding-for-confidence-and-severity.md`.
- This repo has 41 folders of source files. The example workspace is `tests/fixtures/live-workspace/`.

## Scope

1. `node tools/infer.mjs` reads a workspace (`--root`, this repo by default), finds the source folders whose files no declared node claims, and for each asks the model what that code is for. `--paths a,b` limits it to some folders. `--dry-run` lists the folders, which are claimed, and how many calls a run would make, without calling the model.
2. What the model is sent for a folder: the file names, each file's leading comment and its top-level symbol signatures, and the titles of the declared concepts and intents. Repo-relative paths only. At most 12,000 characters, cut cleanly with a note that it was cut.
3. What comes back for a folder: one to three proposals. Each has a title written the way this repo's intents are (one sentence that states an outcome, at most 90 characters), a body of at most 400 characters that says how the code does it, the evidence as two to eight anchors, the declared concept it belongs under or none, the declared intent it seems to restate or none, and a confidence word.
4. Every anchor is checked against the real code. An anchor that does not resolve is dropped. A proposal left with no anchor is dropped and counted.
5. The report is `.runs/infer/<timestamp>/report.json`, and `.runs/infer/latest.json` names it, the same way the drift check does it. Each proposal has an id that stays the same as long as the folder and the code it was read from stay the same.
6. A cache keyed by the folder's signature hash: a second run with no code change calls the model zero times. A change in comments or formatting alone does not count as a change.
7. A spending cap, `--budget`, 0.25 by default. When it is reached the run stops, says so, and writes what it has, marked incomplete.
8. A folder whose call fails or whose reply does not fit the schema becomes one error row. The run goes on.
9. Nothing is ever written under `spec/`. Only under `.runs/infer/`.
10. Run it on this whole repo once. Put every proposal in "Results" as a table: folder, title, belongs under, restates, and your own verdict (right, vague or wrong) after reading the code. Then improve the prompt until at least three in four are right, and say what you changed.

## Files the builder may touch

- `packages/skill/src/infer/**` (new)
- `packages/shared/src/schemas/infer.ts` (new) and the one export line it needs in `packages/shared/src/schemas/index.ts`
- `tools/infer.mjs` (new)
- new test files under `packages/skill/tests/`, new fixtures under `tests/fixtures/infer-cases/`
- this note: "Reuse record", "Builder notes" and "Results" only

If the work needs a file outside this list, change it and name the file and the reason in the report. If `callClaude` has to move to be shared, that counts.

## Acceptance checks

1. `node tools/verify.mjs all` passes and the test count does not go down (391 today). The unit tests use a stand-in for the model, so they cost nothing.
2. `node tools/infer.mjs --dry-run` makes no model call and lists 41 folders for this repo.
3. `node tools/infer.mjs --paths packages/skill/src/live,packages/skill/src/drift` ends with a PASS line that gives the number of proposals, the calls made and the cost. Every anchor in the report resolves.
4. The same command again makes zero calls and gives the same proposals with the same ids.
5. `--budget 0.0001` stops after one call, says the cap was reached, and the report is marked incomplete.
6. On a temp copy of the example workspace, the two files that declared intents already claim get no proposal, and an added file that nobody claims gets one. The `spec/` folder is byte for byte unchanged.
7. The full run on this repo: the table in "Results", at least three in four judged right, the total cost and the seconds.

## Not in this lane

- Anything on the graph page or in the live server. That is the next lane.
- Writing a proposal into a spec file, accepting or dismissing one.
- A new kind of spec node. A proposal is an inferred intent, nothing new.

## Stop clause

Stop and report after 45 minutes, if the gate cannot be made green in two tries, or when the model cost of your own runs passes 1 dollar. Report what was measured.

## Reuse record

(the builder fills this in)

## Builder notes

## Results
