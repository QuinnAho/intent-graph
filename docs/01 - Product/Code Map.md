# Code Map

What the code does today, read from the source on 2026-11-27. Design intent lives in [Tech Spec](<Tech Spec.md>) and [Architecture](<Architecture.md>).

## Packages

- `packages/shared`: Zod schemas (`src/schemas/` node, edge, task, lease, trace, obligation, walker, mcp-tool-io), derived types (`src/types/`), ULID and fence-token ids (`src/ids/`), MCP tool names and messenger envelopes (`src/protocol/`).
- `packages/skill`: the subprocess. Static graph build (`src/build-graph.ts`), parsers (`src/parser/`), SQLite + Drizzle store (`src/db/`), graph ops and PPR (`src/graph/`), MCP bootstrap (`src/mcp/server.ts`), AgentRunner chokepoint (`src/agent-runner/`), verifiers (`src/verifiers/`, builtins `coverage`, `fast-check`, `tsc`), plus orchestrator, retrieval, trace and watcher folders.
- `packages/webview`: React app. Shell (`src/app/App.tsx`), canvas (`src/graph/GraphCanvas.tsx`), one renderer per node kind (`src/graph/nodes/`), edges (`src/graph/edges/`), ELK layout (`src/graph/layout/`), zoom tiers (`src/graph/zoom/useZoomLevel.ts`), Zustand store slices (`src/store/`).
- `packages/extension`: VS Code host folders exist (controllers, codelens, statusbar, transport, skill-process), but `src/extension.ts` is still an empty `activate()` placeholder.
- `packages/agent-skill`: `SKILL.md` plus a `bin/` shim that imports `@intentgraph/skill`. Packaged by `scripts/package-agent-skill.ts`.

## How the static graph is built

1. `scripts/seed-dev-db.ts` calls `build()` in `packages/skill/src/build-graph.ts`.
2. `build()` parses `/spec/{intents,constraints,decisions,concepts}/*.md` with `parseSpecTree()` (`src/parser/spec-md/index.ts`). Frontmatter `parent` becomes a `realizes` edge.
3. It walks the source tree with `collectProjectSnapshot()` (`src/parser/fileWalker.ts`, `build()` skips `claudemap/` by default) and parses each file with tree-sitter (`src/parser/tree-sitter.ts`). Each file gives one `code_module` node, its top-level declarations give `code_symbol` nodes, joined by `produced_by` edges.
4. No spec-to-code edges are inferred yet. The header comment of `build-graph.ts` says Phase 4 drift detection adds them.
5. The script writes `toGraphJson()` output to `.intentgraph/graph.json` and seeds `.intentgraph/dev.db` with `writeToDatabase()`.

## How it is shown

- `packages/webview/vite.config.ts` sets `publicDir` to the repo's `.intentgraph/`, so the dev server serves the seed as `/graph.json`.
- `App.tsx` calls `loadGraphFromJson()` (`src/transport/graph-json-loader.ts`), which fetches `/graph.json`, checks `_format` and `_version`, runs `runLayout()` (ELK on the main thread, `src/graph/layout/index.ts`) and fills the store.
- The VS Code extension and the MCP server are not wired yet: every tool list in `packages/skill/src/mcp/tools/` is empty and `packages/skill/src/index.ts` only exports a placeholder.

## Command to see it

```bash
pnpm tsx scripts/seed-dev-db.ts
pnpm --filter @intentgraph/webview dev
```

Then open the URL Vite prints (`http://localhost:5173` by default).
