# Repository structure

A pnpm monorepo. The goal: a new contributor finds the right file in under thirty seconds.

## Top-level folders

| Folder | Purpose |
|---|---|
| [`packages/`](./packages/) | All shippable code — five workspaces, one per process boundary. |
| [`docs/`](./docs/) | Architecture overview, ADRs, and the glossary. The entry point for newcomers after this file. |
| [`spec/`](./spec/) | The team's own dogfooded intents, constraints, and decisions, written from day one. |
| [`scripts/`](./scripts/) | Repo-wide TypeScript scripts (seeding the dev DB, running the retrieval eval harness, packaging the skill). |
| [`tests/integration/`](./tests/integration/) | Cross-package suites that spawn a real skill subprocess. Per-package unit tests live next to each package. |
| [`automation/`](./automation/) | Autonomous workflow: cc-sdd installer, bash-loop Ralph (`ralph.sh`), verification + monitor-LLM gates, per-phase task lists. See [`automation/README.md`](./automation/README.md) and [ADR 0007](./docs/adr/0007-autonomous-workflow.md). |
| [`.github/workflows/`](./.github/workflows/) | CI (`ci.yml`), the tag-gated publish workflow (`publish.yml`), and the automation-check workflow (`automation-check.yml`). |

## Packages

| Package | Process / target | Purpose |
|---|---|---|
| [`@intentgraph/shared`](./packages/shared) | library | Zod schemas, derived types, MCP protocol constants, ULID/fence-token IDs. The only package without runtime deps beyond `zod` + `ulid`. |
| [`@intentgraph/skill`](./packages/skill) | Node subprocess | The substrate — MCP server, SQLite + Drizzle, tree-sitter, orchestrator, AgentRunner chokepoint, verifiers, retrieval, trace, watcher. |
| [`@intentgraph/extension`](./packages/extension) | VS Code extension host | Controllers, transport, skill-process lifecycle, codelens / diagnostics / statusbar / diff provider. |
| [`@intentgraph/webview`](./packages/webview) | Browser (VS Code webview) | React Flow v12 + ELK-in-worker + Zustand + TipTap. |
| [`@intentgraph/agent-skill`](./packages/agent-skill) | npm package | Agent Skills manifest (`SKILL.md` + `agents/openai.yaml` + `bin/`) consumed identically by Claude Code and Codex. Wraps `@intentgraph/skill`. |

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

The custom ESLint rule `intentgraph/agent-runner-only` (in [`eslint.config.mjs`](./eslint.config.mjs)) blocks `import { generateText, streamText, generateObject, streamObject, embed, embedMany } from 'ai'` outside `packages/skill/src/agent-runner/`. Every model call must traverse `AgentRunner` so trace events get recorded. There is no other path.

## Test conventions

- Per-package unit tests live in `packages/<name>/tests/` (colocated style at the package level, not the file level).
- Cross-package tests live in `tests/integration/suites/`.
- Vitest workspace projects are listed in [`vitest.workspace.ts`](./vitest.workspace.ts); `pnpm test` runs them all.

## The autonomous workflow

```
automation/
├── README.md                  ← strategy, phase autonomy table, cost notes, manual first-run checklist
├── install.sh                 ← idempotent cc-sdd installer (--check verifies post-install)
├── ralph.sh                   ← bash-loop Ralph; fresh context per iteration
├── verify.sh                  ← gating verification commands
├── monitor-llm.sh             ← Groq Llama 3.3 70B verdict per tech-spec §4
├── qa.sh                      ← Pass-2-only QA audit (codex-vs-diff) per ADR-0013
├── codex-log.jsonl            ← /codex invocation audit trail per ADR-0008 (created on first run)
├── qa-reports/                ← /qa and qa.sh report files
├── tasks/
│   ├── schema.json            ← JSON Schema all task lists validate against
│   ├── APPROVAL.md            ← human approval flow for draft task lists
│   ├── phase-1-fork-cleanup/tasks.json       (draft)
│   ├── phase-2-static-graph/tasks.json       (draft)
│   ├── phase-3-mcp-bidirectional/tasks.json  (stub, blocked on ADR)
│   ├── phase-4-drift-detection/tasks.json    (stub, blocked on ADRs)
│   ├── phase-5-retrieval-eval/tasks.json     (stub, blocked on ADR)
│   └── phase-6-hardening/tasks.json          (stub, blocked, autonomy=low)
└── sessions/                  ← progress.json, per-task logs, agent prompts (gitignored loop state)
```

Slash commands in `.claude/commands/`: `/intentgraph-ralph-run <phase>`, `/intentgraph-ralph-resume`, `/intentgraph-ralph-status`, `/intentgraph-ralph-cancel`.

## Where to find things in under thirty seconds

- A schema → `packages/shared/src/schemas/`
- A graph or DB query → `packages/skill/src/graph` or `packages/skill/src/db`
- A model call → `packages/skill/src/agent-runner` (the only place `ai`'s call surface may be imported)
- A VS Code command, codelens, or status bar item → `packages/extension/src/{controllers,codelens,statusbar}`
- A node renderer or graph interaction → `packages/webview/src/graph`
- An MCP tool definition → `packages/skill/src/mcp/tools`
- An ADR → `docs/adr/`
- A glossary term → `docs/glossary.md`
- A Claude Code skill, subagent, or slash command → `.claude/{skills,agents,commands}/`
- A Codex skill, subagent, or slash command → `.codex/{skills,subagents,commands}/`
- The agent-config validator → `scripts/check-agent-config.ts` (run via `pnpm check:agent-config`)

## Agent configuration

This section documents the `CLAUDE.md`, `AGENTS.md`, `.claude/`, and `.codex/` layout that wraps the repo so both Claude Code and Codex CLI work on this project with the same discipline. The discipline itself — workflow split, hard rules, dogfooding ladder — lives in [`docs/architecture.md` § Working with Agents on This Project](./docs/architecture.md#working-with-agents-on-this-project).

### Files at the repo root

| File | Role |
|------|------|
| [`CLAUDE.md`](./CLAUDE.md) | Project memory loaded into every Claude Code session. Summarizes the five pillars, hard rules, dogfooding ladder, the verify command, available skills/subagents/commands, and what to do when uncertain. ≤300 lines. |
| [`AGENTS.md`](./AGENTS.md) | Codex equivalent. Same content shape, with an explicit Codex-vs-Claude-Code workflow split. |

### `.claude/` directory

```
.claude/
  settings.json                   # sandbox + allow/deny + MCP server registrations
  skills/
    intentgraph-architect/        # SKILL.md — read-only ADR drafter
    intentgraph-implementer/      # SKILL.md — well-scoped implementation worker
    intentgraph-claudemap-lifter/ # SKILL.md — do-not-lift list + provenance
    intentgraph-spec-writer/      # SKILL.md — frontmatter discipline for /spec/
    intentgraph-verifier-author/  # SKILL.md — TestGen-LLM filter cascade
  agents/
    intent-extractor.md           # propose intent nodes; read-only
    drift-reconciler.md           # propose graph mutations in shadow workspace
    code-generator.md             # forward sync; intent → code patch in shadow
    monitor.md                    # cheap monitor LLM; trace-event in, JSON out
    adr-writer.md                 # drafts ADRs in /docs/adr/
  commands/
    intentgraph-init.md           # bootstrap a session
    intentgraph-status.md         # phase, gate, blockers, in-flight
    intentgraph-lift.md           # invoke lifter against a claudemap/ file
    intentgraph-spec.md           # open or create an intent file
    intentgraph-adr.md            # spawn adr-writer for a new ADR
    intentgraph-verify.md         # typecheck + lint + test gate
    intentgraph-ralph.md          # Ralph-loop / cc-sdd task-list executor
    intentgraph-ralph-run.md      # multi-task Ralph session start
    intentgraph-ralph-resume.md   # resume an interrupted Ralph session
    intentgraph-ralph-status.md   # active session progress report
    intentgraph-ralph-cancel.md   # halt the active session and write a final report
    codex.md                      # /codex bridge to Codex CLI; explicit-only, sandbox read-only
    qa.md                         # /qa per-commit audit (self-report + Codex audit) per ADR-0013
```

### `.codex/` directory

`.codex/` mirrors `.claude/` so Codex CLI sees the same discipline. Differences:

- `.codex/config.toml` instead of `.claude/settings.json` (Codex CLI uses TOML for its config).
- `.codex/subagents/` instead of `.claude/agents/` (Codex's subagent convention). Frontmatter is identical.
- `.codex/skills/` and `.codex/commands/` use the same SKILL.md and command frontmatter formats — Agent Skills became an open standard in Dec 2025.

The five skills and thirteen slash commands appear in both directories with identical content. Authoritative count lives under `.claude/commands/` — count from there if this paragraph drifts.

### Skill, subagent, and command roles

| Surface | Role in the development workflow |
|---------|-----------------------------------|
| **Skill** `intentgraph-architect` | Gate for load-bearing decisions. Read-only. Returns ADR drafts, never code. |
| **Skill** `intentgraph-implementer` | Worker for well-scoped tasks. Refuses architectural calls, escalates to architect. |
| **Skill** `intentgraph-claudemap-lifter` | Enforces the do-not-lift list, provenance headers, `LIFT_LOG.md` updates. |
| **Skill** `intentgraph-spec-writer` | Frontmatter discipline for `/spec/*.md`; outcome-focused intent statements. |
| **Skill** `intentgraph-verifier-author` | Applies the TestGen-LLM filter cascade; refuses to mark obligations complete until they actually run. |
| **Subagent** `intent-extractor` | Read-only proposer of intent nodes from existing code. Phase 4+. |
| **Subagent** `drift-reconciler` | Proposes graph mutations for drift events. Edits only in shadow workspace. |
| **Subagent** `code-generator` | Forward sync; intent edit → code patch proposal. Edits only in shadow workspace. |
| **Subagent** `monitor` | Cheap monitor LLM (Llama 3.3 70B on Groq). Single trace event in, single JSON verdict out. Read-only. |
| **Subagent** `adr-writer` | Drafts ADRs in `/docs/adr/` for human review. Edit access scoped to that directory. |
| **Command** `/intentgraph-init` | Bootstrap a session: read CLAUDE.md, list dogfooding gates, surface open ADRs. |
| **Command** `/intentgraph-status` | Report current phase, next gate, blockers, in-flight work. |
| **Command** `/intentgraph-lift <file>` | Invoke the lifter skill against a `claudemap/` reference file. |
| **Command** `/intentgraph-spec <intent-id>` | Open or create an intent file with prefilled frontmatter. |
| **Command** `/intentgraph-adr <title>` | Spawn the adr-writer subagent to draft a new ADR. |
| **Command** `/intentgraph-verify` | Run typecheck + lint + test in sequence. Refuses to continue on failure. |
| **Command** `/intentgraph-ralph <task-list>` | Ralph-loop: execute a task list via the implementer in fresh-context iterations, commit after each success. |

### MCP servers

Registered in both `/.mcp.json` (Claude Code, project scope) and `.codex/config.toml [mcp.*]` (Codex). Per ADR-0028, `mcpServers` is **not** a valid key in `.claude/settings.json` and is silently ignored — registrations live one directory level up.

| Server | Why |
|--------|-----|
| `filesystem` | Local filesystem access scoped to the workspace. Anthropic reference. |
| `git` | Parsed git log, structured diff. Used by lifter and reconciler. |
| `github` | Issue tracking and PR ops; load-bearing in Phase 6. |
| `playwright` | UI-driving MCP for webview canvas diagnosis (per ADR-0027). Scoped to the local Vite dev server. Requires `npx playwright install chromium` once per machine. |

When IntentGraph's own MCP server ships in Phase 3 (per Tech-Spec §6), register it here as `intentgraph` pointing at the local skill subprocess (`packages/skill/dist/index.js`) over stdio.

### Validation

[`scripts/check-agent-config.ts`](./scripts/check-agent-config.ts) validates that every reference in `CLAUDE.md` / `AGENTS.md` resolves, every skill / subagent / command file has the expected frontmatter, `.claude/settings.json` is valid JSON with no allow/deny contradictions and no stray `mcpServers` block (rejected with a pointer to ADR-0028), `.codex/config.toml [mcp.*]` registers the same MCP servers as `/.mcp.json` (parity enforced bidirectionally), and every `/spec/` markdown file has the required frontmatter fields.

Run locally with `pnpm check:agent-config`. CI runs it after typecheck, before test (see [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)).

## Repo-wide scripts (`scripts/`)

| Script | Role |
|--------|------|
| [`check-agent-config.ts`](./scripts/check-agent-config.ts) | Agent-config validator (run via `pnpm check:agent-config`). |
| [`check-contracts.ts`](./scripts/check-contracts.ts) | Structural check that the shared schemas barrel and the Drizzle schema layout are present. Lifted+retargeted from claudemap; see [`LIFT_LOG.md`](./LIFT_LOG.md). |
| [`eval-retrieval.ts`](./scripts/eval-retrieval.ts) | Retrieval eval harness for the L3 dogfooding gate. Stub today; lights up in Phase 5. |
| [`install-agent-skill.ts`](./scripts/install-agent-skill.ts) | Copy the packaged `@intentgraph/agent-skill` artifact into a target repo's `.claude/skills/intentgraph/` or `.codex/skills/intentgraph/`. |
| [`package-agent-skill.ts`](./scripts/package-agent-skill.ts) | Build the `@intentgraph/agent-skill` distribution artifacts under `artifacts/agent-skill/`. |
| [`package-skill.ts`](./scripts/package-skill.ts) | Older skill-only packager; predecessor to `package-agent-skill.ts`. |
| [`seed-dev-db.ts`](./scripts/seed-dev-db.ts) | Seed a development SQLite database for L0/L1 dogfooding. |
| [`smoke-test-agent-skill.ts`](./scripts/smoke-test-agent-skill.ts) | Assert the agent-skill artifact shape for Claude / Codex flavors. |

## Dev-hygiene dotfiles at the repo root

| File | Role |
|------|------|
| [`.editorconfig`](./.editorconfig) | Cross-editor whitespace + line-ending defaults. |
| [`.prettierrc`](./.prettierrc) | Prettier formatting config. |
| [`.prettierignore`](./.prettierignore) | Paths Prettier skips. |
| [`.gitignore`](./.gitignore) | Standard ignore set; `node_modules`, `dist`, `.turbo`, lockfile-adjacent caches, env files. |
