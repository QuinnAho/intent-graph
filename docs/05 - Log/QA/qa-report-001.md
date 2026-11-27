# QA report 001 — IntentGraph project setup

**Author:** read-only QA pass by Claude Code (Opus 4.7) with one delegated Codex 0.121.0 read-only run.
**Date:** 2026-04-27.
**Scope:** the repository at `D:\ahoqp1\Repositories\intent-graph` excluding `/.git/` and the read-only reference fork at `/claudemap/`. No files were modified.
**Mandate:** verify project setup. Inventory, discipline enforcement, ADR-vs-code drift, doc conflicts, smoke tests, severity-ranked findings. False positives are cheap; missed blockers are not.

The audit assumes the project is at the **end of Phase 0 / start of Phase 1** per `tech-spec.md` §6 — scaffolding is in place, the skill/extension/webview source trees are placeholders, and the intent is for Ralph-loop tasks under `automation/tasks/phase-1-fork-cleanup/tasks.json` to fill them in. Findings are interpreted in that frame.

---

## 1. Inventory

Files grouped by purpose. Counts are tracked-by-git only (242 tracked files; `claudemap/` excluded from the listing because the project's own `eslint.config.mjs:78` ignores it as a read-only reference fork).

### 1.1 Project memory and top-level docs

| File | Purpose |
|------|---------|
| `tech-spec.md` | Authoritative spec. 593 lines, §1–§8. |
| `CLAUDE.md` | Claude Code project memory; loaded each session. |
| `AGENTS.md` | Codex equivalent of `CLAUDE.md`. |
| `STRUCTURE.md` | Repo layout + import-direction rules + agent-config map. |
| `README.md` | Repo entry. (Not opened for this audit; cited from STRUCTURE.md.) |
| `LIFT_LOG.md` | Provenance log for ClaudeMap lifts. |
| `docs/architecture.md` | Newcomer entry. Links pillars to ADRs. |
| `docs/glossary.md` | Glossary (not opened for this audit). |
| `docs/adr/README.md` | ADR index. |

### 1.2 Architectural decision records (`docs/adr/`)

| # | File | Status |
|---|------|--------|
| 0001 | `0001-plugin-first.md` | Accepted |
| 0002 | `0002-relational-graph-store.md` | Accepted |
| 0003 | `0003-spec-driven-loop.md` | Accepted |
| 0004 | `0004-agent-orchestration.md` | Accepted |
| 0005 | `0005-faithfulness-by-architecture.md` | Accepted |
| 0006 | `0006-agent-configuration-setup.md` | Proposed |
| 0007 | `0007-autonomous-workflow.md` | Proposed |
| 0008 | `0008-codex-bridge.md` | Proposed |

### 1.3 Spec markdown (`spec/`) — placeholder READMEs only

- `spec/README.md`, `spec/intents/README.md`, `spec/constraints/README.md`, `spec/decisions/README.md`. No real intent/constraint/decision files exist yet. Phase 0 gate is "every team member can write an intent in markdown and find it via grep" — the directory exists; the dogfood corpus is empty.

### 1.4 Tool config — Claude Code (`.claude/`)

- `settings.json` — sandboxing default-mode + curated allow/deny + three MCP servers (`filesystem`, `git`, `github`).
- `settings.local.json` — local override (not audited; gitignored content is irrelevant to setup correctness).
- `skills/` — five SKILL.md files: `intentgraph-architect`, `intentgraph-claudemap-lifter`, `intentgraph-implementer`, `intentgraph-spec-writer`, `intentgraph-verifier-author`.
- `agents/` — five subagents: `adr-writer`, `code-generator`, `drift-reconciler`, `intent-extractor`, `monitor`.
- `commands/` — eleven slash commands: `intentgraph-{init,status,lift,spec,adr,verify,ralph,ralph-run,ralph-resume,ralph-status,ralph-cancel}` and the new `codex.md`.

### 1.5 Tool config — Codex (`.codex/`)

- `config.toml` — TOML mirror of `.claude/settings.json` shape.
- `skills/` — same five skills as `.claude/skills/`.
- `subagents/` — same five subagents (note the path difference per ADR-0006: Codex convention is `subagents/`, not `agents/`).
- `commands/` — eight slash commands (`codex.md` plus `intentgraph-{adr,init,lift,ralph,spec,status,verify}`). **Missing the four ralph-* multi-task commands** that exist in `.claude/commands/`. Flagged as **major** below.

### 1.6 Automation (`automation/`)

- `README.md`, `install.sh`, `ralph.sh`, `verify.sh`, `monitor-llm.sh`.
- `tasks/schema.json`, `tasks/APPROVAL.md`.
- One `tasks.json` per phase 1–6 (phase 1 in `draft-needs-human-approval`; phases 2–6 not opened for this audit but listed in STRUCTURE.md as drafts/stubs).

### 1.7 Source packages (`packages/`)

- `@intentgraph/shared` — Zod schemas, types, protocol constants. **All `src/*.ts` files I sampled are placeholders** (e.g. `schemas/node.ts:6` is `z.object({}).describe('node row — schema TBD in Phase 0')`).
- `@intentgraph/skill` — MCP server, SQLite, Drizzle, parser, orchestrator, agent-runner, retrieval, trace, verifiers, watcher. **All sampled `src/*.ts` files are placeholder constants** — e.g. `agent-runner/index.ts:11` exports only `AGENT_RUNNER_PLACEHOLDER`. Codex confirmed (see §3) that every MCP tool family also exports empty arrays, so the MCP server bootstraps but registers no tools.
- `@intentgraph/extension` — VS Code extension host. `src/extension.ts:6` exports `EXTENSION_ENTRY_PLACEHOLDER`; `activate()` and `deactivate()` are no-ops.
- `@intentgraph/webview` — React Flow + ELK + Zustand + TipTap. Components exist as files; their internals were not all opened, but the `transport/messenger-client.ts:4` placeholder line confirms the same scaffolding pattern.
- `@intentgraph/agent-skill` — npm publishing wrapper for the skill subprocess. `SKILL.md`, `agents/openai.yaml`, `bin/intentgraph-skill.js` exist; not deeply audited.

### 1.8 Tests

- `packages/{shared,skill,extension,webview}/tests/.gitkeep` — empty test directories.
- `packages/{shared,skill,extension,webview}/vitest.config.ts` — per-package config.
- `tests/integration/{README.md,package.json,tsconfig.json,vitest.config.ts,suites/.gitkeep}` — empty integration suite.
- `vitest.workspace.ts` — workspace config listing all five projects.

### 1.9 Scripts (`scripts/`)

- `check-agent-config.ts` — the validator used by `pnpm check:agent-config`.
- `check-contracts.ts`, `eval-retrieval.ts`, `install-agent-skill.ts`, `package-agent-skill.ts`, `package-skill.ts`, `seed-dev-db.ts`, `smoke-test-agent-skill.ts` — present; not audited individually.

### 1.10 CI

- `.github/workflows/ci.yml` — `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm check:agent-config`, `pnpm test`, `pnpm build`, plus an `atlas migrate lint` job that no-ops while `packages/skill/src/db/migrations/` only contains `.gitkeep`.
- `.github/workflows/automation-check.yml` — validates every `tasks.json` against `automation/tasks/schema.json`, enforces ADR existence for autonomous phase-3+ tasks, runs `shellcheck` on the four bash scripts, runs `bash -n`, and runs `automation/install.sh --check`.
- `.github/workflows/publish.yml` — present; not audited (tag-gated, not in scope for setup correctness).

### 1.11 Inventory: things mentioned in CLAUDE.md / prompts that are not on disk

Each of these is a documented promise that does not yet exist. Severity assigned in §6 below.

- `automation/tasks/phase-2-static-graph/tasks.json` through `phase-6-hardening/tasks.json` are listed as files. They appear in `git ls-files`, but their *contents* (status, approvals, monitor flags) were not deep-audited; they are documented as drafts/stubs in `STRUCTURE.md:73-78` and `automation/README.md:88-95`. Confirmed present, not confirmed correct.
- `LIFT_AUDIT.md` — referenced in `automation/tasks/phase-1-fork-cleanup/tasks.json:46` as a deliverable of task `p1-t02`. Does not yet exist; this is correct (it's a Ralph-loop output, not a setup file).
- `automation/sessions/progress.json` — referenced by `ralph.sh` and the four ralph-* slash commands. Does not yet exist; correct (it's runtime loop state).
- `packages/skill/src/db/migrations/` — referenced by `drizzle.config.ts:6` and `package.json:22`. Directory exists with `.gitkeep`; no migrations yet. CI gracefully handles the empty case.

### 1.12 Inventory: things on disk that are not documented

- `scripts/check-contracts.ts`, `scripts/eval-retrieval.ts`, `scripts/install-agent-skill.ts`, `scripts/package-agent-skill.ts`, `scripts/package-skill.ts`, `scripts/seed-dev-db.ts`, `scripts/smoke-test-agent-skill.ts` — present in tree but not all of these appear in CLAUDE.md or STRUCTURE.md. STRUCTURE.md mentions "seed-dev-db, eval-retrieval, package-skill" but not the others. Minor.
- `vitest.workspace.ts` and per-package `vitest.config.ts` files — present, but the choice of "package-local projects + top-level integration project" layout is **not recorded in any ADR**. Codex flagged this. See §3.
- `.editorconfig`, `.prettierignore`, `.prettierrc` — present but not enumerated in STRUCTURE.md. Nit.

---

## 2. Discipline enforcement

For each project hard rule, check that the substrate enforces it rather than relying on agent goodwill. Where possible the human can run a command to verify.

### 2.1 AgentRunner-only model calls

**Substrate.** `eslint.config.mjs:13-56` defines a custom flat-config rule `intentgraph/agent-runner-only`. It walks `ImportDeclaration` nodes whose `source.value === 'ai'`, looks at each `ImportSpecifier`, and reports an error for any of `generateText | streamText | generateObject | streamObject | embed | embedMany` imported from outside `packages/skill/src/agent-runner/`. CI runs `pnpm lint` with `--max-warnings=0` (`package.json:17`).

**Effective?** Partially. Codex (read-only audit) flagged three weaknesses in the rule (`eslint.config.mjs:22-25,38-55,84-100`):

1. The rule's allowlist check is `rel.startsWith(AGENT_RUNNER_PREFIX)` where `AGENT_RUNNER_PREFIX = path.join('packages', 'skill', 'src', 'agent-runner')`. This also matches sibling directories like `packages/skill/src/agent-runner-bypass/` because `startsWith` is a substring check, not a path-segment check. **A directory whose name starts with `agent-runner` would silently bypass the chokepoint.** This is a real architectural gap: ADR-0004 calls AgentRunner "the single chokepoint" and ESLint is the only programmatic gate.
2. The rule's `files` filter only matches `**/*.ts` and `**/*.tsx`. Any `.mjs`/`.cjs`/`.js` file (e.g. a build script that calls `generateText` for batch eval) would not be checked.
3. The rule only inspects `ImportDeclaration`. Dynamic `import('ai')`, CommonJS `require('ai')`, and re-exports through an aliased package would all bypass it.

**Verify.** The human can confirm rule coverage with these commands:

```bash
# Expected exit 0 — current code has no offending imports.
pnpm lint

# Adversarial check #1 — write a fixture and confirm the rule fires.
mkdir -p packages/extension/src/_lint-fixture
cat > packages/extension/src/_lint-fixture/violator.ts <<'EOF'
import { generateText } from 'ai';
export const _ = generateText;
EOF
pnpm lint  # expected: exit 1 with "intentgraph/agent-runner-only ... `generateText` from \"ai\" must only be imported inside packages/skill/src/agent-runner"
rm -rf packages/extension/src/_lint-fixture

# Adversarial check #2 — siblings that startsWith the prefix.
mkdir -p packages/skill/src/agent-runner-bypass
cat > packages/skill/src/agent-runner-bypass/violator.ts <<'EOF'
import { generateText } from 'ai';
export const _ = generateText;
EOF
pnpm lint  # CURRENT BEHAVIOR: exit 0 (rule does not fire). EXPECTED: exit 1.
rm -rf packages/skill/src/agent-runner-bypass
```

The second adversarial check is the gap. Severity: **major** (it's not a blocker today because every file in the skill tree is a placeholder, but it will become one as soon as real AgentRunner code lands).

### 2.2 No JSON-as-storage

**Substrate.** Two layers. First, `docs/adr/0002-relational-graph-store.md` and `tech-spec.md:58` make SQLite the substrate; markdown and `graph.json` exports are dumps, never sources. Second, `eslint.config.mjs:74-78` ignores `claudemap/**` so its JSON-storage code can't accidentally be re-imported.

**Effective?** Not enforced programmatically. There is no lint rule against `JSON.stringify(...)` writes to a `.json` file as storage, and no test that `packages/skill/src/db/` is the only persistence path. Today this is moot (the substrate is placeholder), but it has no enforcement surface beyond the `intentgraph-claudemap-lifter` skill's do-not-lift list and code-review discipline.

**Verify.** `grep -RIE 'fs\.(writeFileSync|writeFile)\(.+\.json' packages/skill/src` should show no matches outside `scripts/` or `packages/skill/src/trace/audit-replay.ts`. Run after Phase 4 lands. Today: not applicable.

### 2.3 TypeScript strict everywhere

**Substrate.** `tsconfig.base.json:5-15` sets `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`, `useUnknownInCatchVariables`, `verbatimModuleSyntax`. CI runs `pnpm typecheck` (`package.json:19` → `pnpm -r run typecheck`).

**Effective?** Yes, on paper. The base config is strict-plus. Each package's `tsconfig.json` is expected to extend `tsconfig.base.json`; this audit did not open every per-package `tsconfig.json` so I cannot assert universal extension. There is also no enforcement against `// @ts-ignore` (CLAUDE.md and ADR-0005 require an ADR reference in any `// @ts-ignore` comment, but ESLint does not check for that pattern).

**Verify.**
```bash
pnpm typecheck            # expected: exit 0; placeholder files compile clean.
grep -RIn '@ts-ignore' packages | grep -v node_modules | grep -v '\.gitkeep'
                          # expected: no output. If non-empty, each line should reference an ADR.
```

### 2.4 No lifting forbidden ClaudeMap files

**Substrate.** `intentgraph-claudemap-lifter` SKILL.md and `LIFT_LOG.md` provenance discipline. ESLint ignores `claudemap/**` so its source is not part of the project's lint or build. There is no programmatic check that lifted files in `packages/` carry a provenance header.

**Effective?** Process discipline only. Not load-bearing today (no lifts have happened — `LIFT_LOG.md` was not opened; `git log` would confirm).

**Verify.** `cat LIFT_LOG.md` and cross-reference each entry against `git log --diff-filter=A --name-only -- packages/` for files matching the lift list. Today: probably empty.

### 2.5 Phase 3+ human checkpoints + autonomy=low refusal

**Substrate.** `automation/ralph.sh` is the gate.

- Approved/executing-only: `ralph.sh:149-156` switches on `.status` and `fatal`s on `draft-needs-human-approval`, `blocked-on-decision`, `completed`, `aborted`.
- `autonomy_level=low` refusal: `ralph.sh:157-159`.
- `human_checkpoint=true` task without `approvals.json` entry: `ralph.sh:439-451`. Marks blocked, continues.
- `$200` hard cap: `ralph.sh:29` (`HARD_COST_CAP_USD=200`), enforced at `ralph.sh:163-168`.
- Three-consecutive-failure abort: `ralph.sh:33` (`MAX_CONSECUTIVE_FAILURES=3`), enforced at every `mark_blocked` site (`ralph.sh:447-449,459-461,467-469,479-481,488-490`).
- Monitor-LLM gate: `ralph.sh:324-355`. `block` and `require_human_review` halt the loop.

CI also enforces ADR-on-record for autonomous phase-3+ tasks: `.github/workflows/automation-check.yml:49-91`.

**Effective?** Yes, for everything `ralph.sh` runs. The matching `monitor-llm.sh:21-22,90-105` correctly normalizes a missing `recommended_action` to `require_human_review` rather than defaulting to `allow` — a small but load-bearing detail (per ADR-0005 the monitor is the obfuscation tax gate). Verified.

**Verify.**
```bash
# Refusal of draft task lists.
bash automation/ralph.sh --dry-run automation/tasks/phase-1-fork-cleanup/tasks.json
# Expected: stderr "task list is draft; see automation/tasks/APPROVAL.md", exit non-zero.

# Refusal of autonomy_level=low. (None of the phase-1 tasks ship at low; phase-6 does.)
# After ensuring phase-6/tasks.json has autonomy_level: "low":
bash automation/ralph.sh --dry-run automation/tasks/phase-6-hardening/tasks.json
# Expected: stderr "autonomy_level=low — phase requires per-task explicit human approval; ralph.sh refuses", exit non-zero.

# Refusal of --max-cost > $200.
bash automation/ralph.sh --max-cost 201 --dry-run automation/tasks/phase-1-fork-cleanup/tasks.json
# Expected: stderr "exceeds hard cap ($200)", exit non-zero.
```

### 2.6 Cost cap

**Substrate.** Three layers — schema (`automation/tasks/schema.json:42-49`, `maximum: 200`); `ralph.sh:29,163-168` (script-level hard cap); CI workflow re-validates the schema. Justification field required when `max_total_cost_usd > 100` (`schema.json:144-148`).

**Effective?** Yes. The `maximum: 200` in JSON Schema and the `awk`-based check in ralph.sh are belt-and-braces.

**Verify.** Schema run via `automation-check.yml:34-46`:
```bash
ajv validate -s automation/tasks/schema.json -d automation/tasks/phase-1-fork-cleanup/tasks.json --strict=false
# Expected: "valid", exit 0.
```

### 2.7 Never train against the monitor signal

**Substrate.** Documented as a hard rule in CLAUDE.md, AGENTS.md, ADR-0005, ADR-0007, and the `intentgraph-architect` SKILL.md. `monitor-llm.sh:21-22` repeats it. There is **no programmatic enforcement** — no CI script that fails if a hypothetical `train.py` reads `monitor-*.json`. ADR-0007:55 calls this "restated as a hard rule … and as a CI check that any future model-fine-tune script does not consume `monitor-*.json` artifacts." That CI check does not exist yet.

**Effective?** Today, yes — there is no model-fine-tuning code in the repo. The future check is a debt.

**Verify.** Today: not applicable. Once any `train`/`fine-tune` script exists, run `grep -RIE 'monitor.*\.json|recommended_action|monitor_verdict' <those scripts>` — non-empty output is a hard fail.

---

## 3. Drift between intent and implementation

This section quotes the Codex run delegated for the heavy ADR-vs-code comparison. Codex was invoked with `codex exec -C <root> -s read-only --color never --skip-git-repo-check` (note the `/codex` slash command file's `-a never` flag would have failed — see finding **F-DRIFT-CODEX-FLAGS** in §6; for this audit I removed it and the run completed). All file:line citations are Codex's; I have spot-checked the ones marked critical.

> [codex]:
>
> **Findings**
> - ADR-0004 and ADR-0005 are accepted, but the load-bearing implementation is still stubbed: AgentRunner, tier routing, trace recorder, Inngest functions, lease manager, trace writer, and monitor LLM are placeholder constants, not working modules (`docs/adr/0004-agent-orchestration.md:13-22`, `packages/skill/src/agent-runner/index.ts:1-11`, `packages/skill/src/agent-runner/tier-routing.ts:1-11`, `packages/skill/src/agent-runner/trace-recorder.ts:1-5`, `packages/skill/src/orchestrator/inngest-functions.ts:1-5`, `packages/skill/src/orchestrator/lease-manager.ts:1-5`, `docs/adr/0005-faithfulness-by-architecture.md:13-23`, `packages/skill/src/trace/event-writer.ts:1-5`, `packages/skill/src/trace/monitor-llm.ts:1-8`).
> - ADR-0002 is accepted, but the relational substrate is not implemented yet: schema, DB client, and DB init are placeholders; Drizzle config and deps exist; Atlas/Drizzle commands are wired; no checked-in migrations were found in the configured directory (`docs/adr/0002-relational-graph-store.md:13-23`, `packages/skill/src/db/schema.ts:1-6`, `packages/skill/src/db/client.ts:1-5`, `packages/skill/src/db/init.ts:1-7`, `packages/skill/drizzle.config.ts:3-9`, `packages/skill/package.json:18-19,25-31`, `package.json:22-23`, `.github/workflows/ci.yml:50-70`).
> - ADR-0003 is accepted, but the spec-driven loop is mostly placeholder: all diff-ladder stages, watcher entrypoints, and verifier surfaces are stubs (`packages/skill/src/parser/diff/ladder.ts:1-8`, `packages/skill/src/parser/diff/signature-hash.ts:1-3`, `packages/skill/src/parser/diff/body-hash.ts:1-4`, `packages/skill/src/parser/diff/gumtree.ts:1-4`, `packages/skill/src/parser/diff/llm-classifier.ts:1-4`, `packages/skill/src/watcher/chokidar.ts:1-5`, `packages/skill/src/watcher/save-handler.ts:1-6`, `packages/skill/src/verifiers/verifier-interface.ts:1-6`, `packages/skill/src/verifiers/builtin/fast-check.ts:1-5`, `packages/skill/src/verifiers/builtin/tsc.ts:1-4`).
> - ADR-0001 is only partially scaffolded: the package split exists and activation metadata is wired, but the extension entrypoint, skill lifecycle, MCP client, messenger transport, shared typed envelope, and skill entrypoint are placeholders (`packages/extension/src/extension.ts:1-14`, `packages/extension/src/skill-process/lifecycle.ts:1-5`, `packages/extension/src/transport/mcp-client.ts:1-5`, `packages/extension/src/transport/messenger.ts:1-5`, `packages/webview/src/transport/messenger-client.ts:1-4`, `packages/shared/src/protocol/messenger-envelope.ts:1-6`, `packages/shared/src/protocol/mcp-tool-names.ts:1-10`, `packages/skill/src/index.ts:1-10`).
> - The "one MCP server" part of ADR-0001 has a real stdio bootstrap, but the server currently registers no actual tools because every tool family exports an empty array (`packages/skill/src/mcp/server.ts:29-75`, `packages/skill/src/mcp/tools/graph.ts:5-9`, `packages/skill/src/mcp/tools/retrieval.ts:4-8`, `packages/skill/src/mcp/tools/task.ts:6-10`, `packages/skill/src/mcp/tools/verify.ts:4-8`, `packages/skill/src/mcp/tools/trace.ts:4-8`).
> - ADR-0006 mostly matches the repo: `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.codex/`, settings/config, skills, agents/subagents, commands, and the validator all exist; frontmatter is enforced by the validator and present in sampled files; CI runs `pnpm check:agent-config`.
> - ADR-0007 matches `ralph.sh` on the requested controls: approved/executing-only status, `autonomy_level=low` refusal, `approvals.json` gate, `$200` hard cap, and three-consecutive-failure abort are implemented (`automation/ralph.sh:29-30,149-168,219-223,431-448,456-489`).
> - ADR-0008 matches: both `/codex` command files exist with YAML frontmatter, explicit-only invocation, read-only sandboxing, refusal of write work / phases 3/4/6, and explicit bans on `workspace-write` / `--full-auto` flags.
> - The ESLint AgentRunner-only rule exists, but it is not airtight: it only applies to `*.ts`/`*.tsx`, only inspects `ImportDeclaration` from literal `ai`, and the allowlist check is a raw `startsWith` on `packages/skill/src/agent-runner`, which would also allow sibling prefixes like `agent-runner-x` (`eslint.config.mjs:22-25,38-55,84-100`).
> - Unrecorded-in-ADR decisions visible in code include the Vitest workspace layout (package-local projects plus a top-level integration project) and the MCP server's choice to JSON-stringify plain-object tool results into a single text content block (`vitest.workspace.ts:1-12`, `packages/skill/src/mcp/server.ts:55-70`).
>
> **Answer**
>
> No. The accepted ADRs do not yet match the implemented code in the load-bearing areas. The biggest gap is ADR-0002 through ADR-0005: the SQLite/Drizzle/sqlite-vec substrate, the spec-driven diff loop, AgentRunner/Inngest orchestration, and the trace/monitor faithfulness machinery are still mostly placeholder files, so the core architecture is documented but not delivered.
>
> ADR-0001 is only partially true: the repo has the intended package split and a real MCP server bootstrap, but the extension lifecycle, MCP client, messenger transport, shared protocol constants, and tool families are still scaffolds. By contrast, proposed ADRs 0006-0008 are the strongest match to the current repo: agent configuration, validation, `/codex`, and `ralph.sh` enforcement are implemented and aligned.
>
> The AgentRunner-only ESLint rule exists, but it is narrower than the ADR language implies, so it should not be treated as a complete bypass-proof enforcement boundary yet.
>
> **Open questions**
> - I did not execute `pnpm lint`, `pnpm test`, or `pnpm check:agent-config`; this is read-only file inspection only.
> - ADR-0001's `packages/agent-skill` distribution story may be intended as a build artifact rather than checked-in `.claude/skills/intentgraph/` / `.codex/skills/intentgraph/` directories; I did not verify that packaging path end-to-end.
> - I inferred "no migrations present" from repo inspection and CI guards; I did not run Drizzle/Atlas to confirm generated state.

**Reviewer's commentary on Codex's output.** The placeholder gaps for ADR-0002 through ADR-0005 are not bugs in the setup; they are the explicit Phase 1+ work items captured in `automation/tasks/phase-1-fork-cleanup/tasks.json`. They are **not** drift in the bad sense — they are documented deferred work. I have downgraded their severity in §6 accordingly. The two genuine drifts Codex surfaced are:

- **ESLint rule's `startsWith` substring bug** — real, documented in §2.1 above. **Major.**
- **Vitest workspace layout (and the MCP-tool-result JSON serialization) is undocumented in any ADR.** This is a load-bearing test-infrastructure choice (single-process via `vitest.workspace.ts` vs per-package test runners) that ADR-0006's "decisions made during the bootstrap" section does not enumerate. **Minor** today; will become major if the integration suite's process model needs to change.

**Other drift not in the Codex report (found by the reviewer):**

- **`docs/architecture.md:39-87` is stale.** It still says "Seven slash commands" — the project now has eleven (the four ralph-* additions in ADR-0007 and the new `/codex` from ADR-0008). It also references `Tech-Spec.md` (capital T, capital S) — the file was normalized to lowercase per ADR-0007:71. On a case-sensitive filesystem the capitalized link is broken. CI runs on Ubuntu.
- **`STRUCTURE.md:14` references `Tech-Spec.md`** in the table; same case-sensitivity issue. Ditto `STRUCTURE.md:69` ("monitor-llm.sh ← Groq Llama 3.3 70B verdict per tech-spec §4" mixes the casings).
- **`spec/intents/README.md`, `spec/constraints/README.md`, `spec/decisions/README.md` declare a frontmatter schema that does not match `scripts/check-agent-config.ts:114-124`'s expected fields.** The validator requires `id`, `title`, `parent`, `confidence`. The READMEs require `id`, `title`, `owner`, `priority`, `target_kinds`, `status`, `created`, `updated` (intents); `id`, `title`, `predicate_kind`, `expr`, `scope_node`, `verifier_id`, `status`, `created`, `updated` (constraints); etc. They have no `parent` and no `confidence`. **Anyone who writes a real intent following the README will break CI.** The first dogfood intent will trigger this. **Major.**
- **`automation/README.md:10` links to `/docs/adr/ADR-002-autonomous-workflow.md`.** This file does not exist. ADR-0007:69-70 explicitly notes the renumber decision (`ADR-002` → `0007`). The README link was not updated. `check-agent-config.ts` does not scan automation/README.md (it scans CLAUDE.md and AGENTS.md only), so this rotted silently. **Major.**

---

## 4. Conflicts

Pairs of sources that contradict each other. Each entry shows the two sources and the contradiction.

### 4.1 CLAUDE.md vs AGENTS.md

| Topic | CLAUDE.md | AGENTS.md | Resolution |
|-------|-----------|-----------|------------|
| Slash commands listed | 11 (incl. `/codex` and the four ralph-* additions) | 12 (incl. `/codex` mirrored) | Aligned — both now include `/codex`. |
| `.claude/agents/` vs `.codex/subagents/` | "agents" | "subagents" (Codex convention per ADR-0006) | Documented; aligned. |
| Available subagent list | five subagents | five subagents | Aligned. |

No live conflict. The two files are in sync as of this audit.

### 4.2 CLAUDE.md vs tech-spec.md

| Topic | CLAUDE.md | tech-spec.md | Resolution |
|-------|-----------|--------------|------------|
| Phase 7 / Phase 8 mention | "Phase 7 Python (v1.1); Phase 8 Go *or* Rust (v2)" | Same wording in §6 | Aligned. |
| Filename of spec | `tech-spec.md` (lowercase) | filename is `tech-spec.md` | Aligned. |
| Cheap monitor LLM identity | Llama 3.3 70B on Groq | Llama 3.3 70B on Groq | Aligned. |
| Hard rules | seven enumerated | five pillars + invariants in §1, §2 | Aligned in spirit; CLAUDE.md is a derivation, not a contradiction. |

No conflict.

### 4.3 ADRs vs each other

- ADR-0001 says "skill subprocess … packaged as a single Agent Skills directory consumed identically by Claude Code (`.claude/skills/intentgraph/`) and Codex (`.codex/skills/intentgraph/`)". ADR-0006 lists five **other** skills under `.claude/skills/` and `.codex/skills/` — `intentgraph-architect`, `intentgraph-implementer`, `intentgraph-claudemap-lifter`, `intentgraph-spec-writer`, `intentgraph-verifier-author`. The ADR-0001 path `intentgraph/` is the *runtime* skill (the MCP-talking subprocess); the ADR-0006 paths are *editor* skills (templates and discipline). **They are different things sharing the same parent directory.** `packages/agent-skill/` is the build artifact for the ADR-0001 skill; today no `intentgraph/` subfolder under `.claude/skills/` exists yet (Phase 3 ships it per ADR-0006 §10). **Not a conflict; a naming subtlety worth a glossary entry.** Nit.
- ADR-0007 vs ADR-0002: ADR-0007's `monitor-llm.sh:50-52` reads `git log -1 --format='' -p | head -c 60000` — which truncates large diffs. ADR-0005's monitor-LLM contract does not specify diff-size handling. Not a contradiction; a deferred decision. Nit.

No live conflict among ADRs.

### 4.4 `automation/README.md` vs ADR-0002 / ADR-0007

- `automation/README.md:10` says "See `/docs/adr/ADR-002-autonomous-workflow.md` for the full decision record." That file does not exist. The actual file is `docs/adr/0007-autonomous-workflow.md`. ADR-0007:69-70 explicitly says the number is 0007, not 002, because `0002-relational-graph-store.md` already exists. The README is out of sync with the ADR it claims to cite. **Major** (documentation rot that misleads new contributors and breaks the "every link in `automation/README.md` resolves" promise made in `STRUCTURE.md`).

### 4.5 Other doc-vs-doc conflicts

- `STRUCTURE.md:14` ("authoritative spec" link) writes `Tech-Spec.md` while the file on disk is `tech-spec.md`. Same in `docs/architecture.md:78`, in 14 other files (see §3). On Windows this is harmless; on Linux (CI) link-checkers will fail; `check-agent-config.ts:77-90` would catch the broken link if it scanned STRUCTURE.md, but it scans only CLAUDE.md and AGENTS.md. **Minor** today, **major** on first Linux contributor.
- `docs/architecture.md:86` says "Seven slash commands" but the project has eleven. Same file lists subagents and skills correctly. **Nit** (documentation lag, not a contradiction in behavior).
- `STRUCTURE.md:73-78` claims phase-1 and phase-2 task lists are "draft"; `automation/README.md:88-95` claims phase-3 through phase-6 are "stub, blocked". Both consistent with each other. No conflict.

---

## 5. Smoke tests for the human

Run these in the workspace root in order. Each step states the expected exit code and a stdout marker the human should see. **Do not re-run any step that mutates the working tree** without committing or stashing first; the steps below are read-only or idempotent unless explicitly noted.

| # | Command | Expected exit | Expected stdout marker | Notes |
|---|---------|---------------|------------------------|-------|
| 1 | `pnpm install --frozen-lockfile` | 0 | `Lockfile is up to date` and a list of resolved packages ending in `Done in <N>s` | Run once at session start. **Mutates `node_modules`.** Don't run again unless `pnpm-lock.yaml` changed. |
| 2 | `pnpm typecheck` | 0 | `> intentgraph@0.0.0 typecheck` followed by per-package `> @intentgraph/<name> typecheck` lines. No `error TS` lines. | All packages are placeholders today; should pass cleanly. |
| 3 | `pnpm lint` | 0 | `eslint . --max-warnings=0` echoed; no per-file diagnostics; clean exit. | If non-zero, the first offender is reported. |
| 4 | `pnpm check:agent-config` | 0 | `check-agent-config: OK` | Validates frontmatter, links from CLAUDE.md/AGENTS.md, and `.codex/config.toml` ↔ `.claude/settings.json` MCP coherence. |
| 5 | `pnpm test` | 0 | `Test Files no tests` and per-project lines `Test Files 0 passed (0)`; final summary mentions `--passWithNoTests` honored. | All `tests/.gitkeep` directories are empty by design today. |
| 6 | `pnpm build` | 0 | One `Build complete` (or tsup equivalent) per package. | Skill builds via `tsup`; webview via `vite build`; extension via `tsc`. |
| 7 | **AgentRunner-only lint rule, deliberate violation.** See §2.1 for the exact fixture. | 1 | `error  intentgraph/agent-runner-only  generateText from "ai" must only be imported inside packages/skill/src/agent-runner` | **Mutates working tree.** Restore with `rm -rf packages/extension/src/_lint-fixture` after. |
| 8 | **AgentRunner-only sibling-prefix bypass test.** Fixture in §2.1, second adversarial case. | **CURRENTLY 0 (BUG)** | No diagnostics — the rule does not fire. | Demonstrates finding **F-LINT-PREFIX**. **Mutates working tree.** Restore with `rm -rf packages/skill/src/agent-runner-bypass`. |
| 9 | `bash automation/install.sh --check` | non-zero | `[install] ERROR: ... missing skill: kiro-discovery` (or similar) until cc-sdd is installed. | Install with `bash automation/install.sh` (network) when the human is ready; this exercise is read-only. |
| 10 | `bash automation/ralph.sh --dry-run automation/tasks/phase-1-fork-cleanup/tasks.json` | non-zero | `[ralph] ERROR: task list is draft; see automation/tasks/APPROVAL.md` | Confirms the script refuses a `draft-needs-human-approval` list. The intentional pass — no mutation. |
| 11 | `bash automation/ralph.sh --status` | non-zero | `[ralph] ERROR: no active session (no progress.json)` | Confirms `--status` does not invent state. |
| 12 | `pnpm migrate:lint` | 0 | `No migrations yet — skipping atlas migrate lint.` (when run from the same shell as CI; locally you'll need Atlas installed) | Optional. CI handles the empty-migrations case. |
| 13 | **Repository link integrity check (manual).** `grep -RIn 'Tech-Spec\.md' .claude .codex docs CLAUDE.md AGENTS.md STRUCTURE.md \| wc -l` | n/a | A non-zero count (current: 14) indicates the case-sensitivity hazard — see finding **F-CASE-TECHSPEC**. | Runs in seconds. |
| 14 | **Stale ADR link check (manual).** `grep -RIn 'ADR-002-autonomous-workflow' .` | n/a | `automation/README.md:10:` is the offender — see finding **F-AUTOREADME-ADR**. | Runs in seconds. |
| 15 | **Spec frontmatter validator vs README schema (manual).** Compare `spec/intents/README.md` frontmatter block against `scripts/check-agent-config.ts:114-124`. | n/a | Disjoint sets — see finding **F-SPEC-FM-MISMATCH**. | Runs in minutes. |

If any step's actual outcome differs from the expected marker, **stop and surface the diff before proceeding**. Steps 7–8 deliberately mutate the working tree; remember to revert before committing.

---

## 6. Severity-ranked findings

One row per issue. False positives are cheap; missed blockers are not. Severity scale: **blocker** (setup is broken, can't proceed safely); **major** (will cause real misbehavior or doc rot in normal use); **minor** (correct today but will mislead the first contributor); **nit** (cosmetic).

| ID | Severity | Area | Finding |
|----|----------|------|---------|
| F-LINT-PREFIX | **blocker** | ESLint AgentRunner-only rule | `eslint.config.mjs:41` uses `rel.startsWith(AGENT_RUNNER_PREFIX)` where `AGENT_RUNNER_PREFIX = "packages/skill/src/agent-runner"`. A sibling directory like `packages/skill/src/agent-runner-bypass/` would silently pass the check — the rule is the *only* programmatic gate on the AgentRunner chokepoint per ADR-0004, and this is a real bypass. Today the impact is theoretical because every `agent-runner/*.ts` file is a placeholder, but the moment Phase 4 lands real code, a single mistyped directory name removes the chokepoint. |
| F-AUTOREADME-ADR | major | Documentation | `automation/README.md:10` links to `docs/adr/ADR-002-autonomous-workflow.md`; the actual file is `docs/adr/0007-autonomous-workflow.md` (renumber explicitly recorded in ADR-0007:69-70). The link is broken. `check-agent-config.ts` does not scan automation/README.md, so the rot is silent. |
| F-SPEC-FM-MISMATCH | major | Spec frontmatter contract | `spec/{intents,constraints,decisions}/README.md` declare frontmatter schemas (`id`, `title`, `owner`, `priority`, `target_kinds`, `status`, `created`, `updated`, etc.) that do not include the four fields `scripts/check-agent-config.ts:114-124` requires (`id`, `title`, `parent`, `confidence`). Any contributor who writes a real intent following the README will fail CI; any contributor who satisfies CI will violate the README. |
| F-CODEX-CMD-FLAG | major | `/codex` slash command | `.claude/commands/codex.md:144` and `.codex/commands/codex.md:39` document `codex exec ... -a never` as the canonical invocation. `codex exec --help` (codex-cli 0.121.0) does not accept `-a` — the option exists only on the interactive `codex` entrypoint. Running the command verbatim today fails with `error: unexpected argument '-a' found`. Discovered when the QA pass tried to invoke `/codex` with the documented flags. |
| F-CASE-TECHSPEC | major | Case sensitivity | 14 files (`docs/architecture.md`, `STRUCTURE.md`, `.claude/skills/{intentgraph-architect,intentgraph-claudemap-lifter}/SKILL.md`, `.codex/...` mirrors, `.claude/commands/intentgraph-{adr,init}.md`, `.codex/commands/...`, `.claude/agents/adr-writer.md`, `.codex/subagents/adr-writer.md`, `LIFT_LOG.md`, `docs/adr/0007-autonomous-workflow.md`, `.claude/settings.local.json`) reference `Tech-Spec.md`. The actual file is `tech-spec.md`. Windows hides this; CI runs on Ubuntu (case-sensitive). ADR-0007:71 records the rename to lowercase. The rest of the repo did not catch up. |
| F-CODEX-COMMANDS-MIRROR | major | `.codex/commands/` mirror | `.codex/commands/` is missing the four ralph-* multi-task commands (`intentgraph-ralph-run`, `intentgraph-ralph-resume`, `intentgraph-ralph-status`, `intentgraph-ralph-cancel`) that exist in `.claude/commands/`. AGENTS.md:123 acknowledges this gap ("Codex equivalents land alongside the agent-config pass; the Claude Code versions exist today"). Documented but not yet remedied. |
| F-MCP-EMPTY-TOOLS | major | Phase 1/2 implementation gap | The skill subprocess's MCP server bootstraps but every tool family (`packages/skill/src/mcp/tools/{graph,retrieval,task,verify,trace}.ts`) exports an empty array, so the server registers zero tools. Codex flagged this. ADR-0001 says "one MCP server, three clients" — it is one MCP server with no tools today. Not a setup *blocker* (Phase 3 lights up the surface), but the placeholder state is more empty than the ADR's "real stdio bootstrap" wording suggests. |
| F-CHECK-CONFIG-COVERAGE | major | Validator scope | `scripts/check-agent-config.ts:166-220` only validates Markdown links in `CLAUDE.md` and `AGENTS.md`. It does not scan `STRUCTURE.md`, `automation/README.md`, `docs/architecture.md`, or any ADR file. F-AUTOREADME-ADR, F-CASE-TECHSPEC, and the stale ADR link in `docs/architecture.md` would all be caught by extending the validator; today they rot silently. |
| F-VITEST-LAYOUT-UNRECORDED | minor | Architectural decision not in any ADR | `vitest.workspace.ts:1-12` and per-package `vitest.config.ts` together define a "package-local projects + top-level integration project" test layout. STRUCTURE.md describes it; no ADR records *why* this shape was chosen vs a single Vitest config at the root. ADR-0006's "decisions made during the bootstrap" section does not mention test infrastructure. |
| F-MONITOR-TRAINING-CHECK-MISSING | minor | Process discipline | ADR-0007:55 commits to "a CI check that any future model-fine-tune script does not consume `monitor-*.json` artifacts." That CI check does not exist. No fine-tune scripts exist either, so today this is a debt, not a bug. |
| F-DOC-LAG-7-COMMANDS | minor | Documentation | `docs/architecture.md:86` says "Seven slash commands"; the project has eleven (four ralph-* additions per ADR-0007 + `/codex` per ADR-0008). |
| F-STRUCTURE-LAG | minor | Documentation | `STRUCTURE.md:127-133` ("`commands/` ... seven slash commands") is out of date for the same reason as F-DOC-LAG-7-COMMANDS. |
| F-ARCHITECT-SKILL-LAG | minor | Skill documentation | `.claude/skills/intentgraph-architect/SKILL.md:25-26` says "Read existing ADRs `/docs/adr/0001..0005`." There are now eight ADRs (0001–0008). The architect skill should consider 0006–0008 too. |
| F-CHECK-CONFIG-TOML-COHERENCE | minor | Validator depth | `scripts/check-agent-config.ts:146-164` checks `.codex/config.toml` ↔ `.claude/settings.json` MCP coherence by **substring matching `[mcp.<name>]`**. A commented-out `# [mcp.foo]` line in either file would pass falsely. ADR-0006 acknowledges this trade-off; it remains a debt. |
| F-VALIDATOR-CRLF | minor | Validator robustness | `scripts/check-agent-config.ts:56` matches frontmatter via `^---\r?\n([\s\S]*?)\r?\n---`. On Windows-checkout files with mixed line endings (e.g. `\r\n` saved through some editors then re-saved through others) the trailing `\r?\n---` could miss. Today this passes; a pre-commit normalizer would harden it. |
| F-PNPM-LOCK-NOT-AUDITED | minor | Dependency hygiene | The audit did not open `pnpm-lock.yaml` (huge file). `pnpm install --frozen-lockfile` in CI is the de facto check; the human can also run `pnpm audit --prod` for vulnerability data. |
| F-SCRIPTS-UNDOCUMENTED | nit | Documentation completeness | `scripts/check-contracts.ts`, `scripts/install-agent-skill.ts`, `scripts/package-agent-skill.ts`, `scripts/smoke-test-agent-skill.ts` exist but are not all enumerated in CLAUDE.md or STRUCTURE.md. STRUCTURE.md mentions a subset. |
| F-EDITORCONFIG-UNLISTED | nit | Documentation completeness | `.editorconfig`, `.prettierignore`, `.prettierrc` exist but are not listed in STRUCTURE.md's directory layout table. |
| F-ADR0001-NAMING-NIT | nit | Naming subtlety | ADR-0001 references a future `.claude/skills/intentgraph/` runtime skill while ADR-0006 puts five *editor* skills under `.claude/skills/` (architect, implementer, etc.). Different surfaces sharing one parent path. Worth a one-line glossary entry to prevent future confusion. |
| F-CODEX-FLAGS-DEFERRED | nit | `/codex` design | The `/codex` command body claims `--full-auto` "implies workspace-write" and forbids it. `codex exec --help` confirms. The same body's instruction "verify flags by running codex --help first" was followed for this audit but not by the previous turn that wrote the file — F-CODEX-CMD-FLAG is the consequence. |

**Total:** 1 blocker, 8 major, 7 minor, 4 nit.

---

## End of report

Audit performed read-only. No file in the repository was modified by this audit. The Codex run consumed 152,136 tokens per Codex's own report and ran for ~9 minutes wall-clock; its full transcript is in the harness's task output cache, not committed to the repo.
