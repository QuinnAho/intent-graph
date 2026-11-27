---
lane: live-graph
branch: live-graph
worktree: .wt/live-graph
status: ready
go: Quinn, 2026-11-27
---
# Lane 1: live graph with status

## Quinn's ask

"Live graph with status": edit a `/spec` file and the graph updates in about 2 seconds, and nodes show verified, failed or pending from their linked tests. Quinn on direction: "I do think visual is the way to go for me personally". On reuse: "use the best things of open source stuff rather than rewrite from scratch, we can cherry pick".

## What exists (read these, not the whole tree)

- `docs/01 - Product/Code Map.md`: the packages and how the static graph is built and shown.
- `packages/skill/src/build-graph.ts`: `build()`, `writeToDatabase()`, `toGraphJson()`. One-shot, no watching.
- `packages/skill/src/parser/spec-md/`: the spec parser. Required frontmatter: id, title, parent, confidence.
- `packages/skill/src/watcher/chokidar.ts` and `save-handler.ts`: stubs of a few lines. chokidar is already a dependency.
- `packages/skill/src/verifiers/`: registry, scheduler and a coverage verifier.
- `packages/webview/src/transport/graph-json-loader.ts`: fetches `/graph.json` once and lays it out with ELK in a worker.
- `packages/webview/src/graph/nodes/shared/nodeChrome.tsx`: the shared node frame, where a status mark belongs.
- `tools/verify.mjs` and `tools/frames.mjs`: the gate and the frames script.
- `docs/02 - Decisions/0030-anchors-bind-a-node-to-code-and-checks.md`: the anchor format (`realized_by`, `verified_by`). Proposed, so use it on fixtures only.
- Today's frames show about 81 of 751 nodes at "fit", all of them code. No spec node is visible without hunting.

## Steps

1. **Reuse check, 30 minutes at most.** Try `colbymchenry/codegraph` (MIT, Node) on this repo in a scratch script: index time, symbols and edges against our own `build-graph` output, whether its watcher could replace ours, its native dependencies. Record adopt, borrow or skip with the numbers under "Reuse record" below. Also decide: chokidar for watching (already here), and vitest's JSON reporter for test results.
2. **A live server** in `packages/skill` with a `--root <dir>` and a `--port <n>` option. It builds the graph with the existing builder, serves it as JSON, watches the spec files and the source files (debounce about 2 s, skip a file whose content hash did not change), rebuilds, and pushes a change event to the page. Prefer Node builtins and server-sent events over a new dependency.
3. **The webview** loads from the live server when one is given (keep the static `graph.json` path working), applies an update without reloading the page, and keeps the viewport and selection.
4. **Anchors.** Parse `realized_by` and `verified_by` from frontmatter as ADR 0030 describes. Both optional. A bad anchor is a warning on that node, never a crash.
5. **Check status.** Run the tests named by `verified_by` (one vitest run with the JSON reporter, mapped back by file and test name). A node is `verified`, `failed` or `pending`. Re-run when a linked test or a `realized_by` file changes.
6. **Show it.** A status mark on spec nodes in the shared node frame, readable at a glance and not by colour alone. Add a way to open the graph focused on one node (a `focus` URL parameter) so frames can show a named node, and make the spec nodes (intent, constraint, concept, decision) visible at first load instead of only code.
7. **A fixture workspace** under `tests/fixtures/live-workspace/`: a few spec nodes with anchors, two small source files, one passing test and one test the end-to-end script can flip to failing.
8. **An end-to-end script** `tools/e2e-live.mjs` in the style of `tools/verify.mjs` (one PASS or FAIL line, exit 0 only on pass): copy the fixture to a temp folder, start the server on a free port, open the page headless, and prove acceptance checks 2 and 3.

## Files you may touch

`packages/skill/**`, `packages/webview/**`, `packages/shared/**`, `tests/**`, `tools/e2e-live.mjs` (new), root `package.json` and `pnpm-lock.yaml` for dependencies only, and the "Reuse record" and "Builder notes" sections of this note.

Not yours: `/spec/**`, the rest of `docs/**`, `.claude/**`, `CLAUDE.md`, `eslint.config.mjs`, `tools/verify.mjs`, `tools/frames.mjs`, and any existing test (add tests, never delete or weaken one).

## Acceptance checks

1. `node tools/verify.mjs all` passes.
2. With the server on the fixture, changing an intent's title in its markdown file changes that node's label on the page within 3 seconds, with no page reload and the viewport unchanged.
3. A node linked to a passing test shows verified. Linked to a failing test it shows failed. With no link it shows pending. Flipping the fixture test from pass to fail changes the mark within 15 seconds.
4. The server and its watcher stop cleanly and leave no process behind. The port is an option, and nothing assumes 5173.
5. `node tools/frames.mjs` still passes, and a frame focused on a fixture spec node shows its status mark.
6. Every new dependency is named in the report with its license and the reason.

More checks exist that you will not see. A verifier that did not build this will run them against the running app.

## Not in this lane

Editing on the canvas (lane 3). Drift judgement (lane 2). MCP, the VS Code extension, vector retrieval. Changing any file under `/spec`. Migrating React Flow to v13.

## Stop and report if

The reuse check runs past 30 minutes. The gate cannot be made green in two tries. A step needs a change outside "Files you may touch". After 90 minutes.

## Reuse record

(builder fills this in: candidate, license, what was measured, adopt, borrow or skip, why)

## Builder notes

(builder: anything the next lane must know, in a few lines)
