# Repository structure

A pnpm monorepo. The goal: a new contributor finds the right file in under thirty seconds.

## Top-level folders

| Folder | Purpose |
|---|---|
| [`packages/`](../../packages/) | All shippable code — five workspaces, one per process boundary. |
| [`docs/`](../) | The project vault: product docs, decisions (ADRs), research, workflow, log and tasks, in numbered folders. |
| [`spec/`](../../spec/) | The team's own dogfooded intents, constraints, and decisions, written from day one. |
| [`scripts/`](../../scripts/) | Repo-wide TypeScript scripts (seeding the dev DB, running the retrieval eval harness, packaging the skill). |
| [`tests/integration/`](../../tests/integration/) | Cross-package suites that spawn a real skill subprocess. Per-package unit tests live next to each package. |
| [`tools/hooks/`](../../tools/hooks/) | Claude Code PreToolUse hooks wired in `.claude/settings.json` (ESLint config guard, AgentRunner chokepoint guard). |
| [`.github/workflows/`](../../.github/workflows/) | CI (`ci.yml`) and the tag-gated publish workflow (`publish.yml`). |

## Packages

| Package | Process / target | Purpose |
|---|---|---|
| [`@intentgraph/shared`](../../packages/shared) | library | Zod schemas, derived types, MCP protocol constants, ULID/fence-token IDs. The only package without runtime deps beyond `zod` + `ulid`. |
| [`@intentgraph/skill`](../../packages/skill) | Node subprocess | The substrate — MCP server, SQLite + Drizzle, tree-sitter, orchestrator, AgentRunner chokepoint, verifiers, retrieval, trace, watcher. |
| [`@intentgraph/extension`](../../packages/extension) | VS Code extension host | Controllers, transport, skill-process lifecycle, codelens / diagnostics / statusbar / diff provider. |
| [`@intentgraph/webview`](../../packages/webview) | Browser (VS Code webview) | React Flow v12 + ELK-in-worker + Zustand + TipTap. |
| [`@intentgraph/agent-skill`](../../packages/agent-skill) | npm package | Agent Skills manifest (`SKILL.md` + `bin/`) consumed by Claude Code. Wraps `@intentgraph/skill`. |

## Import-direction rules

Enforced socially during review and (where possible) by build configuration:

```
@intentgraph/shared
        ▲
        │  (one-way: each leaf depends on shared)
        │
   ┌────┼─────────────┬────────────────┐
   │    │             │                │
extension          webview           skill ◀── agent-skill (publishes skill)
   │                  │                │
   └─── MCP / messenger envelopes ─────┘
              (no direct imports)
```

- `extension` may import `shared`. It must NOT import `webview`, `skill`, or `agent-skill` source.
- `webview` may import `shared`. It must NOT import `extension`, `skill`, or `agent-skill` source. The webview cannot use Node-only APIs.
- `skill` may import `shared`. It must NOT import `extension`, `webview`, or `agent-skill` source.
- `agent-skill` is the only package allowed to depend on `skill` directly (it's the publishing wrapper).
- `extension` ↔ `webview` communicate via `vscode-messenger` using envelopes from `shared/protocol`.
- `extension` ↔ `skill` and CLI ↔ `skill` communicate via MCP using tool names from `shared/protocol`.

## The AgentRunner chokepoint

The custom ESLint rule `intentgraph/agent-runner-only` (in [`eslint.config.mjs`](../../eslint.config.mjs)) blocks `import { generateText, streamText, generateObject, streamObject, embed, embedMany } from 'ai'` outside `packages/skill/src/agent-runner/`. Every model call must traverse `AgentRunner` so trace events get recorded. There is no other path.

## Test conventions

- Per-package unit tests live in `packages/<name>/tests/` (colocated style at the package level, not the file level).
- Cross-package tests live in `tests/integration/suites/`.
- Vitest workspace projects are listed in [`vitest.workspace.ts`](../../vitest.workspace.ts); `pnpm test` runs them all.

## Docs vault

`docs/` is an Obsidian vault in numbered folders: `01 - Product` (tech spec, architecture, glossary, this file, the code map), `02 - Decisions` (ADRs), `03 - Research` (research notes and spikes), `04 - Workflow` (the claudemap lift log and audit), `05 - Log` (QA reports, phase signoffs, frames) and `06 - Tasks` (the backlog and the archived May 2026 task lists). The old autonomous loop (`ralph.sh` and friends) was removed in the November 2026 overhaul. The tag `pre-overhaul-2026-11-27` keeps it.

## Where to find things in under thirty seconds

- A schema → `packages/shared/src/schemas/`
- A graph or DB query → `packages/skill/src/graph` or `packages/skill/src/db`
- A model call → `packages/skill/src/agent-runner` (the only place `ai`'s call surface may be imported)
- A VS Code command, codelens, or status bar item → `packages/extension/src/{controllers,codelens,statusbar}`
- A node renderer or graph interaction → `packages/webview/src/graph`
- An MCP tool definition → `packages/skill/src/mcp/tools`
- An ADR → `docs/02 - Decisions/`
- A glossary term → `docs/01 - Product/Glossary.md`
- A Claude Code skill, subagent, or slash command → `.claude/{skills,agents,commands}/`
- The agent-config validator → `scripts/check-agent-config.ts` (run via `pnpm check:agent-config`)

## Agent configuration

This section documents the `CLAUDE.md` and `.claude/` layout that wraps the repo so Claude Code works on this project with the same discipline every session. The discipline itself — workflow split, hard rules, dogfooding ladder — lives in [`docs/01 - Product/Architecture.md` § Working with Agents on This Project](./Architecture.md#working-with-agents-on-this-project).

### Files at the repo root

| File | Role |
|------|------|
| [`CLAUDE.md`](../../CLAUDE.md) | Project memory loaded into every Claude Code session. Summarizes the five pillars, hard rules, dogfooding ladder, the verify command, available skills/subagents/commands, and what to do when uncertain. ≤300 lines. |

### `.claude/` directory

```
.claude/
  settings.json                   # allow/deny + PreToolUse hooks (MCP servers live in /.mcp.json)
  skills/
    intentgraph-architect/        # SKILL.md — read-only ADR drafter
    intentgraph-implementer/      # SKILL.md — well-scoped implementation worker
    intentgraph-spec-writer/      # SKILL.md — frontmatter discipline for /spec/
    intentgraph-verifier-author/  # SKILL.md — TestGen-LLM filter cascade
  agents/
    intent-extractor.md           # propose intent nodes; read-only
    drift-reconciler.md           # propose graph mutations in shadow workspace
    code-generator.md             # forward sync; intent → code patch in shadow
    monitor.md                    # cheap monitor LLM; trace-event in, JSON out
    adr-writer.md                 # drafts ADRs in /docs/02 - Decisions/
  commands/
    intentgraph-spec.md           # open or create an intent file
    intentgraph-adr.md            # spawn adr-writer for a new ADR
    intentgraph-verify.md         # typecheck + lint + test gate
```

The four skills and three slash commands are the authoritative set under `.claude/` — count from there if this section drifts.

### Skill, subagent, and command roles

| Surface | Role in the development workflow |
|---------|-----------------------------------|
| **Skill** `intentgraph-architect` | Gate for load-bearing decisions. Read-only. Returns ADR drafts, never code. |
| **Skill** `intentgraph-implementer` | Worker for well-scoped tasks. Refuses architectural calls, escalates to architect. |
| **Skill** `intentgraph-spec-writer` | Frontmatter discipline for `/spec/*.md`; outcome-focused intent statements. |
| **Skill** `intentgraph-verifier-author` | Applies the TestGen-LLM filter cascade; refuses to mark obligations complete until they actually run. |
| **Subagent** `intent-extractor` | Read-only proposer of intent nodes from existing code. Phase 4+. |
| **Subagent** `drift-reconciler` | Proposes graph mutations for drift events. Edits only in shadow workspace. |
| **Subagent** `code-generator` | Forward sync; intent edit → code patch proposal. Edits only in shadow workspace. |
| **Subagent** `monitor` | Cheap monitor LLM (Llama 3.3 70B on Groq). Single trace event in, single JSON verdict out. Read-only. |
| **Subagent** `adr-writer` | Drafts ADRs in `/docs/02 - Decisions/` for human review. Edit access scoped to that directory. |
| **Command** `/intentgraph-spec <intent-id>` | Open or create an intent file with prefilled frontmatter. |
| **Command** `/intentgraph-adr <title>` | Spawn the adr-writer subagent to draft a new ADR. |
| **Command** `/intentgraph-verify` | Run typecheck + lint + test in sequence. Refuses to continue on failure. |

### MCP servers

Registered in `/.mcp.json` (Claude Code, project scope). Per ADR-0028, `mcpServers` is **not** a valid key in `.claude/settings.json` and is silently ignored — registrations live one directory level up.

| Server | Why |
|--------|-----|
| `filesystem` | Local filesystem access scoped to the workspace. Anthropic reference. |
| `git` | Parsed git log, structured diff. Used by lifter and reconciler. |
| `github` | Issue tracking and PR ops; load-bearing in Phase 6. |
| `playwright` | UI-driving MCP for webview canvas diagnosis (per ADR-0027). Scoped to the local Vite dev server. Requires `npx playwright install chromium` once per machine. |

When IntentGraph's own MCP server ships in Phase 3 (per Tech-Spec §6), register it here as `intentgraph` pointing at the local skill subprocess (`packages/skill/dist/index.js`) over stdio.

### Validation

[`scripts/check-agent-config.ts`](../../scripts/check-agent-config.ts) validates that every relative link in `README.md`, `docs/01 - Product/`, `docs/02 - Decisions/` and the lift log resolves, every skill / subagent / command file has the expected frontmatter, `.claude/settings.json` is valid JSON with no allow/deny contradictions and no stray `mcpServers` block (rejected with a pointer to ADR-0028), `/.mcp.json` parses with an `mcpServers` object, and every `/spec/` markdown file has the required frontmatter fields.

Run locally with `pnpm check:agent-config`. CI runs it after typecheck, before test (see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)).

## Repo-wide scripts (`scripts/`)

| Script | Role |
|--------|------|
| [`check-agent-config.ts`](../../scripts/check-agent-config.ts) | Agent-config validator (run via `pnpm check:agent-config`). |
| [`check-contracts.ts`](../../scripts/check-contracts.ts) | Structural check that the shared schemas barrel and the Drizzle schema layout are present. Lifted+retargeted from claudemap; see [`docs/04 - Workflow/Lift Log.md`](<../04 - Workflow/Lift Log.md>). |
| [`eval-retrieval.ts`](../../scripts/eval-retrieval.ts) | Retrieval eval harness for the L3 dogfooding gate. Stub today; lights up in Phase 5. |
| [`install-agent-skill.ts`](../../scripts/install-agent-skill.ts) | Copy the packaged `@intentgraph/agent-skill` artifact into a target repo's `.claude/skills/intentgraph/`. |
| [`package-agent-skill.ts`](../../scripts/package-agent-skill.ts) | Build the `@intentgraph/agent-skill` distribution artifacts under `artifacts/agent-skill/`. |
| [`package-skill.ts`](../../scripts/package-skill.ts) | Older skill-only packager; predecessor to `package-agent-skill.ts`. |
| [`seed-dev-db.ts`](../../scripts/seed-dev-db.ts) | Seed a development SQLite database for L0/L1 dogfooding. |
| [`smoke-test-agent-skill.ts`](../../scripts/smoke-test-agent-skill.ts) | Assert the agent-skill artifact shape. |

## Dev-hygiene dotfiles at the repo root

| File | Role |
|------|------|
| [`.editorconfig`](../../.editorconfig) | Cross-editor whitespace + line-ending defaults. |
| [`.prettierrc`](../../.prettierrc) | Prettier formatting config. |
| [`.prettierignore`](../../.prettierignore) | Paths Prettier skips. |
| [`.gitignore`](../../.gitignore) | Standard ignore set; `node_modules`, `dist`, `.turbo`, lockfile-adjacent caches, env files. |
