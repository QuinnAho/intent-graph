# Code Map

What the code does today, read from the source on 2026-11-27 and updated after the six lanes of that day. Design intent lives in [Tech Spec](<Tech Spec.md>) and [Architecture](<Architecture.md>).

## Packages

- `packages/shared`: Zod schemas (`src/schemas/` node, edge, drift, task, lease, trace, obligation, walker, mcp-tool-io), derived types, ids and protocol names.
- `packages/skill`: the static graph build (`src/build-graph.ts`), parsers (`src/parser/`), the live server (`src/live/`), the drift check (`src/drift/`), the SQLite and Drizzle store (`src/db/`), and the parked folders (agent-runner, orchestrator, retrieval, mcp, verifiers).
- `packages/webview`: the React page. Shell and side panel (`src/app/`), canvas (`src/graph/GraphCanvas.tsx`), one renderer per node kind (`src/graph/nodes/`, the shared look in `nodes/shared/nodeChrome.tsx`), wires (`src/graph/edges/`), ELK layout (`src/graph/layout/`), server calls (`src/transport/`), Zustand slices (`src/store/`).
- `packages/extension` and `packages/agent-skill`: placeholders from the May plan, parked.

## How the graph is built

1. `build()` in `packages/skill/src/build-graph.ts` parses `/spec/{intents,constraints,decisions,concepts}/*.md` with `parseSpecTree()` (`src/parser/spec-md/index.ts`) and walks the source tree with tree-sitter (`src/parser/tree-sitter.ts`). Each file is a `code_module` and each top-level declaration a `code_symbol`.
2. Anchors in frontmatter (`realized_by` and `verified_by`, ADR 0030) are read by `src/parser/spec-md/anchors.ts`. Only fixtures have them so far, so this repo has no edge between a spec node and code.

## The live graph

- Server: `packages/skill/src/live/`. `cli.ts` starts it. `server.ts` serves the built page, `/graph.json` and change events. `compose.ts` builds the graph with a test status per node (`check-status.ts`, `test-runner.ts`). `drift-reader.ts` and `drift-marks.ts` add the newest drift verdict. `edit-api.ts` holds the write endpoints, which need `--write`, a token and 127.0.0.1.
- Spec writer: `packages/skill/src/parser/spec-md/writer.ts`. It changes the title and body of a spec file, keeps every other byte, and creates new intents.
- Page: `transport/live-source.ts` and `graph-merge.ts` apply updates with no reload. `app/EditPanel.tsx` edits and creates. `graph/edges/wire-plan.ts` decides which wires are drawn and which become a count on a pin, `wire-path.ts` draws them, and `layout/nested.ts` lays the boxes out left to right.
- Drift check: `packages/skill/src/drift/` and `tools/drift.mjs`. It writes `.runs/drift/latest.json`. The server only reads that file and never calls a model.

## Tools

- `tools/verify.mjs all`: the gate (typecheck, lint, tests, build).
- `tools/e2e-live.mjs`, `e2e-edit.mjs`, `e2e-wires.mjs` and `e2e-drift-marks.mjs`: one end-to-end script per lane. Each prints one PASS or FAIL line. `--serve` on the first two keeps the example running.
- `tools/frames.mjs` takes frames of the graph. `tools/play.mjs` is what `open-graph.cmd` and `open-graph-edit.cmd` run.

## Not wired

ELK runs on the main thread. The VS Code extension, the MCP server and everything listed as parked in ADR 0029 are placeholders.
