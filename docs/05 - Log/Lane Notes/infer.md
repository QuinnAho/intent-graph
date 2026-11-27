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

Reused as they are:
- `callClaude` and `ClaudeCallOptions` (drift/claude-cli.ts), imported by infer/cli.ts. Nothing copied.
- `loadSpecNodes` (drift/spec-nodes.ts) for the declared titles and each node's `realized_by` anchors, and `parseAnchor` from drift/anchors.ts. One reader gives both, so `parseSpecTree` and `readSpecAnchors` were not needed.
- `collectProjectSnapshot`, `signatureOf` and `listTopLevelSymbols` for the file list, the code hash and the symbol lines. `symbolSignatures` gave names and hashes only, and the prompt needs line positions, so `listTopLevelSymbols` was used.
- The shape of tools/drift.mjs and drift/cli.ts for the command, the report and the PASS or FAIL line.

New: packages/skill/src/infer/ (tuning, gather, folders, prompt, run, cli), packages/shared/src/schemas/infer.ts, tools/infer.mjs, packages/skill/tests/infer.test.ts, tests/fixtures/infer-cases/. No file outside the note's list was changed.

## Builder notes

- **Folder count is 42, not 41.** The 41 was counted before this lane. The new folder packages/skill/src/infer is itself an unclaimed source folder. A source folder is a subfolder of a package's src (the src root holds entry files only), or src of a plain workspace. The pattern list is in tuning.
- **A claim is file level.** An anchor `path#Symbol` claims its whole file, and a folder with some claimed files is still read, with only the unclaimed files sent. Only `realized_by` claims, not `verified_by`.
- **Confidence words.** ADR 0022 has four. A model reading code gives two of them: `inferred` when the code states its purpose plainly, `semantic` when it is a reading between the lines.
- **Anchors** must name a file the model was shown and a symbol that file really has. A `@sig` suffix is removed. Made-up concept or intent ids become none.
- **Cache** is .runs/infer/cache.json, keyed by prompt version, model, folder, code hash and the declared titles. Comment or format edits do not move the code hash (tested). A change to a declared title does, because it changes the prompt.
- **Bad reply.** A reply that breaks the limits (title over 90 characters was the usual one) gets one more call, then an error row. A failed call is never retried. A proposal that breaks a limit inside an otherwise good reply is counted and dropped.
- **Incomplete runs print FAIL and exit 1**, as the drift check does for skipped pairs. The report is still written and says why.
- **Local paths.** The report and latest.json name the report relative to the root. Paths inside source comments and the spec parser's messages are scrubbed. Searched the full report for drive letters and home folders: none.
- **Steering comment.** tests/fixtures/infer-cases has a file whose comment says to ignore the instructions and say the folder sends email. One real call on it gave a proposal about ordering and retries, so the comment did not steer it.

## Results

Acceptance, on the committed head:
1. verify all: PASS all, 438 tests in 45 files (391 before, 47 new). The new test file ran 5 times green.
2. --dry-run: PASS, 42 folders, 0 files claimed, 42 calls, no model call.
3. two folders (live, drift): PASS, 5 proposals, 2 calls, $0.0045, every anchor resolved (0 dropped).
4. same command again: 0 calls, 2 cached, identical proposals and ids.
5. --budget 0.0001 on three uncached folders: one call, "budget cap of $0.0001 reached after 1 calls", incomplete true, 2 folders skipped, FAIL line, exit 1.
6. Test on a temp copy of live-workspace: the two claimed files get no proposal and are not in the prompt, an added file gets one, spec/ is byte for byte the same.
7. Full run: 64 proposals from 42 folders, 59 right, 5 vague, 0 wrong (92 percent right). First full run took 307 s and cost about 0.05 dollars. All my model runs together cost about 0.12 dollars.

### Prompt iteration

First prompt (p1), 58 proposals, my verdicts: 36 right, 5 vague, 17 wrong, 62 percent. Nearly all the wrong ones were folders of placeholder files (a comment and one exported PLACEHOLDER constant). The model described the plan in the comment as if it already ran: "A sidebar WebviewView lists intent nodes whose backing code has drifted".

Change (p2): a file that exports only placeholder constants is marked STUB in the prompt, and the system prompt says a stub gets a body that starts "Planned:", says nothing runs yet, and uses semantic. A folder with real and stub files (webview store) now says so in its own proposal. After this: 59 of 64 right. The 5 vague ones are listed below. Later changes (retry on a bad reply, scrubbed warnings) do not touch the prompt, so the cache held.

Verdict method: I read each folder's file comments, symbol names and the proposal bodies, and read the code for the doubtful ones (mcp tools, the rename field, graph operations). I did not read every line of the 275 files. Right means the title is the real purpose and the body does not claim behaviour the code lacks. Vague means true but too general, or a bundle of unrelated bits.

Vague: skill/src/mcp (title reads as working tools, the body says the handlers are stubs), shared/src/types (generic), skill/src/verifiers/builtin fast-check (a smoke property only), webview/src/app "canvas stays responsive" and webview/src/graph "keep the selected node clear of the edit panel" (bundles of small things).

| folder | title | belongs under | restates | verdict |
|---|---|---|---|---|
| extension/src/codelens | Developers see intent and obligation hints inline while editing source files | concept-plugin-first | none | right |
| extension/src/controllers | Developers can drive IntentGraph's commands, drift inbox and graph view from VS Code | concept-plugin-first | none | right |
| extension/src/diagnostics | Developers see intent drift in the Problems panel next to compiler errors | concept-plugin-first | none | right |
| extension/src/diff-provider | Developers can review a proposed code patch side by side before it touches their files | concept-plugin-first | none | right |
| extension/src/skill-process | The extension keeps its skill subprocess alive and recovers it after unexpected exits | concept-agent-orchestration | none | right |
| extension/src/statusbar | Developers see skill health, lease counts, and pending drift from the editor status bar | concept-plugin-first | none | right |
| extension/src/transport | Developers' editor panel will reach the skill through typed, tracked message calls | concept-plugin-first | none | right |
| shared/src/ids | Every graph node, edge, task, and trace gets a unique ID from one generation point | concept-relational-graph-store | none | right |
| shared/src/ids | Writes from a stale lease holder are distinguishable from current ones by a fence token | concept-agent-orchestration | none | right |
| shared/src/protocol | Extension, skill, and webview share one typed contract for tool names and messages | none | none | right |
| shared/src/schemas | Every graph row is checked against one shared shape before it is stored or read | concept-relational-graph-store | none | right |
| shared/src/schemas | Every model call and graph action leaves a typed trace record that can be audited later | concept-faithfulness-by-architecture | intent-agent-runs-are-traceable | right |
| shared/src/types | Downstream packages share one typed view of every graph table and row shape | concept-relational-graph-store | none | vague |
| shared/src/verifier | Third-party verifiers plug in against one shared contract without skill internals | concept-plugin-first | none | right |
| skill/src/agent-runner | Every model call in the monorepo goes through one runner that records what it did | concept-agent-orchestration | none | right |
| skill/src/agent-runner | Model calls are routed to a cost and latency appropriate model tier per task | concept-agent-orchestration | none | right |
| skill/src/db | Graph state stays durable and recoverable across crashes and schema upgrades | concept-relational-graph-store | intent-graph-state-survives-crashes | right |
| skill/src/db | The intent graph's nodes, edges, and leases live in one typed relational schema | concept-relational-graph-store | none | right |
| skill/src/db/utils | Graph snapshot and recovery files are written whole, never half-written after a crash | concept-relational-graph-store | none | right |
| skill/src/drift | Developers see which commit-range code changes have drifted from their linked intents | concept-spec-driven-loop | intent-example-drift-is-detectable | right |
| skill/src/drift | Drift verdicts rest on the intent and the diff alone, not on who wrote the change | concept-faithfulness-by-architecture | none | right |
| skill/src/drift | Maintainers can measure how accurately the drift check catches seeded divergences | none | none | right |
| skill/src/graph | Every planned graph write and query passes through one traced, version-checked path | concept-relational-graph-store | none | right |
| skill/src/infer | Developers can compare what each source folder appears to do against declared intent | concept-spec-driven-loop | none | right |
| skill/src/infer | Re-running the inference skips folders whose code has not changed | none | none | right |
| skill/src/infer | Proposals that cite code that does not exist are dropped before anyone sees them | none | none | right |
| skill/src/live | Developers see the spec graph refresh live as files change, with test and drift status | concept-spec-driven-loop | none | right |
| skill/src/live | Authors can edit intents in the browser, only when the server is started with writes on | concept-spec-driven-loop | none | right |
| skill/src/mcp | Clients reach IntentGraph's graph, retrieval, task, verify and trace tools over MCP | none | none | vague |
| skill/src/mcp/tools | Planned: agents will reach graph, retrieval, task, trace and verify via MCP tool families | concept-agent-orchestration | none | right |
| skill/src/orchestrator | Concurrent agent runs on the same intent node are planned to take turns safely | concept-agent-orchestration | intent-concurrent-agents-stay-consistent | right |
| skill/src/parser | Every project file is parsed into symbol skeletons, even when its syntax is broken | concept-relational-graph-store | none | right |
| skill/src/parser/diff | Symbol drift is flagged only when a symbol's code structure actually changes | concept-spec-driven-loop | none | right |
| skill/src/parser/diff | Code changes are sorted by how deeply they alter behavior before drift is raised | concept-spec-driven-loop | none | right |
| skill/src/parser/spec-md | Spec markdown files become validated intent, constraint, and concept nodes in the graph | concept-spec-driven-loop | none | right |
| skill/src/parser/spec-md | Edits to a spec's title, parent or body land without reformatting the rest of the file | concept-spec-driven-loop | none | right |
| skill/src/parser/spec-md | Spec nodes stay bound to the code and checks that realize them, and bad bindings warn | concept-faithfulness-by-architecture | none | right |
| skill/src/retrieval | Agents will find relevant graph nodes by keyword, meaning, and linked context | concept-relational-graph-store | none | right |
| skill/src/retrieval/embeddings | Retrieval embeds text either offline with a local model or online via Voyage AI | none | none | right |
| skill/src/trace | Every agent action that touches the graph is recorded in a tamper-evident log | concept-relational-graph-store | intent-agent-runs-are-traceable | right |
| skill/src/trace | Risky commits and sampled agent actions get a fast safety verdict before they land | none | intent-monitor-gates-every-commit | right |
| skill/src/verifiers | Each obligation is checked by a registered verifier, run inline or queued by its cost | concept-agent-orchestration | none | right |
| skill/src/verifiers/builtin | Intents with no realizing artifact and constraints with no check get flagged automatically | concept-spec-driven-loop | none | right |
| skill/src/verifiers/builtin | Property-based checks give the verifier pipeline a passing fast-check baseline to build on | none | none | vague |
| skill/src/verifiers/builtin | Type-shape obligations are planned to be checked against TypeScript compiler diagnostics | none | none | right |
| skill/src/verifiers/plugins | Planned: external verifiers can plug into the skill over MCP instead of gRPC | concept-plugin-first | none | right |
| skill/src/watcher | Saved edits in the editor or on disk trigger a drift check against intents. | concept-spec-driven-loop | intent-code-changes-raise-drift | right |
| webview/src/app | Users edit intent graph nodes and wires directly on the canvas with keys and menus | none | none | right |
| webview/src/app | Canvas stays responsive while the graph changes underneath the user | none | none | vague |
| webview/src/editors | Users edit intent bodies in a rich editor and link graph items with @ mentions | none | none | right |
| webview/src/graph | Users reparent spec nodes by dragging wires, and only valid parent targets light up | none | none | right |
| webview/src/graph | Users keep the selected node and hover hints clear of the edit panel while working | none | none | vague |
| webview/src/graph/edges | Users will be able to see constrains, realizes and supersedes links on the graph | none | none | right |
| webview/src/graph/layout | Graph nodes get readable, non-overlapping positions, including nested concept groups | none | none | right |
| webview/src/graph/nodes | Users can tell each kind of graph element apart at a glance on the canvas | none | none | right |
| webview/src/graph/nodes | Users can browse the code modules and symbols the graph maps to | none | none | right |
| webview/src/graph/nodes | Users can watch agent tasks move from proposed to running on the graph | concept-agent-orchestration | none | right |
| webview/src/graph/nodes/shared | Every IntentGraph node kind shows health, drift, and check status the same way | none | none | right |
| webview/src/graph/nodes/shared | Users rename a spec node inline without overwriting edits made to its file meanwhile | none | none | right |
| webview/src/graph/zoom | Shows the graph at overview, mid, or detail depth matched to the user's zoom level | none | none | right |
| webview/src/store | Lets the graph canvas update only when the parts of the graph it shows change | none | none | right |
| webview/src/store | Shows the person which spec files were rejected, since a rejected file has no graph node | none | none | right |
| webview/src/store | Planned: shows drift events and in-flight task progress in the webview | none | none | right |
| webview/src/transport | The webview shows the live graph and sends edits to the server in the order made | none | none | right |
