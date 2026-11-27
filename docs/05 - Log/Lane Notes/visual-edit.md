---
lane: visual-edit
branch: visual-edit
worktree: .wt/visual-edit
status: ready, waits for lane 1 to merge
go: owner, 2026-11-27
---
# Lane 3: visual editing, first cut

## The ask

"Visual editing, first cut": create and edit an intent on the canvas, saved as clean markdown. The owner judges it from frames before anything merges. On direction: visual first. On reuse: use the best open source parts and cherry-pick, never rewrite from scratch.

This lane does not merge on a green gate. It ends with frames for the owner.

## What exists (read these, not the whole tree)

- `docs/01 - Product/Code Map.md`.
- The live server from lane 1: `packages/skill/src/live/` (server, cli, compose, change-gate, tuning). Start it with `pnpm exec tsx packages/skill/src/live/cli.ts --root <dir> --port <n>`. It serves the built webview and pushes changes over server-sent events. It only reads today.
- `packages/skill/src/parser/spec-md/`: `parseSpecTree()`, `frontmatter.ts` (required: id, title, parent, confidence) and `anchors.ts`.
- `packages/skill/src/db/utils/atomicWrite.ts`: an atomic file write that already exists.
- Webview: `transport/live-source.ts` and `graph-merge.ts` (updates without a reload), `graph/nodes/shared/nodeChrome.tsx` (node frame and status mark), `graph/layout/nested.ts`, `store/` (Zustand slices), `editors/` (two stubs of a few lines).
- TipTap is already a dependency of the webview (`@tiptap/react`, `starter-kit`). `js-yaml` is already a dependency of the skill.
- `tools/e2e-live.mjs`: the pattern for an end-to-end script on a temp copy of the fixture `tests/fixtures/live-workspace/`.
- `docs/02 - Decisions/0009-spec-frontmatter-schema.md` and `0024-provenance-preservation-on-edits.md`: read the Decision sections for which fields a new node needs and what `confidence` means for a human edit.

## Steps

1. **Reuse check, 20 minutes at most.** Decide and record: how to change one frontmatter field and keep every other byte (a round-trip YAML library such as `yaml`, against editing the lines by hand), what edits the body (a plain textarea, against TipTap which is already installed), and which React Flow parts give the panel and the add button (`Panel`, `NodeToolbar`).
2. **A spec writer** in `packages/skill/src/parser/spec-md/`: change the title or body of an existing node file, and create a new intent file. It keeps every other byte of an existing file (comments, key order, multi-line values, line endings), bumps `updated`, refuses anything the spec parser would reject, and writes atomically. Unit tests first.
3. **Write endpoints on the live server**, off unless it is started with `--write`: save an edit to a node, and create an intent under a parent. They write only inside the workspace's `spec/` folder, listen on 127.0.0.1 only, and accept a request only with a token the server gave the page it served. A save carries the content hash the panel loaded, so an edit made on disk in the meantime is reported as a conflict, not overwritten.
4. **A side panel in the webview**: selecting a spec node opens it with the kind, the title, the body, the check status and its reasons, the anchors (read only) and any warnings. Title and body are editable. Save and Cancel buttons, Ctrl+S saves, Esc cancels, and unsaved text is marked. In read-only mode the fields are disabled and the panel says why.
5. **Create an intent from the canvas**: an add control on a concept opens a short form (title), and saving creates the file under `spec/intents/` with a slug from the title and the fields ADR 0009 requires, `status: draft`, and today's `created` and `updated`. The new node appears inside its concept.
6. **Errors on screen**: an empty title, a title whose slug already exists, a conflict, or a refused write each show a plain message. Nothing is written.
7. **An end-to-end script** `tools/e2e-edit.mjs` in the style of `tools/e2e-live.mjs`, on a temp copy of the fixture: prove acceptance checks 2 to 6 and save the frames listed below.

## Frames to take (for the owner)

JPEG, 1280 wide, quality 82: the panel open on a node, the title being edited with the unsaved mark, the graph after the save, the create form, the graph with the new intent, and one error message.

## Files you may touch

`packages/webview/**`, `packages/skill/src/live/**`, `packages/skill/src/parser/spec-md/**`, `packages/skill/tests/**`, `packages/shared/**`, `tests/**`, `tools/e2e-edit.mjs` (new), root `package.json`, package `package.json` files and `pnpm-lock.yaml` for dependencies only, and the "Reuse record" and "Builder notes" sections of this note.

Not yours: `/spec/**`, the rest of `docs/**`, `.claude/**`, `CLAUDE.md`, `eslint.config.mjs`, `tools/verify.mjs`, `tools/frames.mjs`, `tools/e2e-live.mjs`, `packages/skill/src/drift/**`, and any existing test (add tests, never delete or weaken one).

## Acceptance checks

1. `node tools/verify.mjs all` passes, and `node tools/e2e-live.mjs` still passes.
2. Selecting a spec node opens the panel with its title and body. Changing the title and saving updates the file and the node's label within 3 seconds.
3. After that save, the file differs from the original only in the title, a heading that mirrors the title, and the `updated` date. Every other byte is the same.
4. Creating an intent from the canvas makes a file under `spec/intents/` that `parseSpecTree()` accepts, and the node appears inside its parent within 3 seconds.
5. An empty title and a duplicate slug are refused with a message on screen, and nothing is written.
6. Without `--write` the server refuses writes and the panel is read-only.
7. `node tools/e2e-edit.mjs` prints a PASS line and the six frames exist.
8. Every new dependency is named in the report with its license and the reason.

More checks exist that you will not see. A verifier that did not build this will run them against the running app.

## Not in this lane

Drawing or deleting edges, deleting nodes, editing anchors or other frontmatter fields, mentions, undo history, more than one user, the VS Code extension, any change to a file under `/spec` in this repo.

## Stop and report if

The gate cannot be made green in two tries. A step needs a change outside "Files you may touch". After 100 minutes.

## Reuse record

(builder fills this in)

## Builder notes

(builder: anything the next lane must know, in a few lines)
