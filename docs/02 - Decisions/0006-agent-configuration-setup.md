# ADR 0006 — Agent configuration setup

## Status

Accepted 2026-04-27. Decisions #3 (in scope) and #4 partially superseded by ADR-0010.

## Context

IntentGraph is being built with Claude Code and Codex CLI as primary tools. Without explicit project-level discipline, agent-driven development drifts: model calls bypass `AgentRunner`, JSON-as-storage anti-patterns leak in from `claudemap/`, ADRs are skipped, specs lose frontmatter integrity. The project's hard rules need to be enforced *at the agent surface*, not just in code review.

This ADR records the initial agent configuration setup: project memory files (`CLAUDE.md`, `AGENTS.md`), the `.claude/` and `.codex/` directories with skills, subagents, slash commands, and settings, plus a CI-enforced validator. The setup was driven by a single bootstrap prompt covering all of the above; this ADR records the decisions made during that bootstrap that were not pre-specified in the prompt.

Tech-Spec sections this touches: §1 (architecture), §2 Pillar 1 (plugin-first, one MCP server / three clients), §2 Pillar 5 (faithfulness via architecture, monitor LLM), §3 (component spec), §6 (phase plan).

## Decision

Adopt the agent configuration described in `STRUCTURE.md` § Agent configuration and `docs/architecture.md` § Working with Agents on This Project. The concrete files committed under this ADR:

- `CLAUDE.md` and `AGENTS.md` at the repo root, ≤300 lines each.
- `.claude/settings.json` with sandboxing enabled, command allow/deny lists, and three MCP servers (`filesystem`, `git`, `github`).
- `.claude/skills/` with five skills: `intentgraph-architect`, `intentgraph-implementer`, `intentgraph-claudemap-lifter`, `intentgraph-spec-writer`, `intentgraph-verifier-author`.
- `.claude/agents/` with five subagents: `intent-extractor`, `drift-reconciler`, `code-generator`, `monitor`, `adr-writer`.
- `.claude/commands/` with seven slash commands: `intentgraph-init`, `intentgraph-status`, `intentgraph-lift`, `intentgraph-spec`, `intentgraph-adr`, `intentgraph-verify`, `intentgraph-ralph`.
- `.codex/` mirroring `.claude/` with `config.toml` (TOML, Codex convention) and subagents under `subagents/` (Codex convention) instead of `agents/`.
- `scripts/check-agent-config.ts` validator wired into `pnpm check:agent-config` and CI between typecheck and test.

### Decisions made during the bootstrap that were not pre-specified

1. **Subagent path under Codex** is `.codex/subagents/`, not `.codex/agents/`. The prompt said "where Claude Code uses `.claude/agents/` for subagents, Codex uses its own subagent convention, document this in AGENTS.md and produce the equivalent files." `subagents/` is the most common Codex convention in the wild as of late 2025; if the official convention shifts, supersede with a new ADR rather than editing this one.
2. **Codex settings format is TOML** (`.codex/config.toml`) rather than JSON. Codex CLI's documented config format is TOML; mirroring `.claude/settings.json` shape into TOML preserves the same allow/deny/MCP semantics.
3. **Validator is dependency-free TypeScript** runnable under `tsx`. Added `tsx@^4.19.2` as a workspace devDependency rather than introducing a YAML/TOML parser. Frontmatter is parsed with a small purpose-built scanner (the schema we validate is intentionally narrow — `name`, `description`, `id`, `title`, `parent`, `confidence`). When the spec frontmatter schema grows, replace the scanner with `js-yaml` or similar.
4. **Validator coherence check between `.claude/settings.json` and `.codex/config.toml`** is a substring check for `[mcp.<name>]` headers, not full TOML parsing. Trades correctness for zero dependencies; the false-positive surface is small (someone writes `# [mcp.foo]` as a comment) and acceptable until the config grows.
5. **`/intentgraph-ralph` includes a `--max-iterations` default of 20.** The prompt left this open. 20 is small enough to bound runaway loops, large enough to clear a typical task list in one invocation; raise via flag if needed.
6. **STRUCTURE.md was *appended to*, not rewritten.** The prompt said "update STRUCTURE.md (created in the previous scaffolding step)" — the file already existed with detailed package and import-direction documentation. Preserving that and appending the new "Agent configuration" section keeps the existing context intact.
7. **Allow/deny lists in `.claude/settings.json` use Claude Code's permission DSL** (`Bash(...)`, `Read(...)`, `Edit(...)`, `Write(...)`) with glob suffixes (`Bash(pnpm typecheck:*)`). The denylist explicitly blocks `.env*` reads/writes and `node_modules/**` writes, plus a curated set of destructive shell commands. Codex's allow/deny lists in `.codex/config.toml` use Codex's plain-string convention.
8. **Skill `allowed-tools` frontmatter is conservative.** The architect skill declares `Read, Glob, Grep` only — no Edit. The implementer declares Edit + Write + a narrow Bash allowlist. The monitor declares `Read` only. This is intentional: the surface is the discipline.
9. **MCP server registrations include `github`** even in early phases. The prompt said "optional in earlier phases"; including the registration with an env-gated token means the surface is ready when Phase 6 needs it without an extra wiring round-trip. The token defaults to unset (`${GITHUB_PERSONAL_ACCESS_TOKEN}`).
10. **No `intentgraph` MCP server registered yet.** Phase 3 ships the IntentGraph skill subprocess; until then, the registration would fail to start. Documented in both `.claude/settings.json` (as a `_intentgraph_notes` block) and `.codex/config.toml` (as a comment).

## Consequences

**Wins.**
- Both Claude Code and Codex sessions start with the project's hard rules in context. The AgentRunner-only rule, the no-JSON-as-storage rule, the do-not-lift list, and the ADR requirement are all loaded before the first user message.
- The five skills route work to the right discipline. The architect skill is read-only by design, which makes the gate uncircumventable from inside the skill.
- The validator runs in CI and catches drift between configuration files and reality (broken links, missing frontmatter, allow/deny contradictions).
- The `.codex/` mirror means a contributor using Codex sees the same surface as a contributor using Claude Code.

**Costs.**
- Five skills × two tools × one SKILL.md each = ten files to keep in sync. The validator catches structural drift but not semantic drift; if we change a skill's behavior in `.claude/skills/` we must update `.codex/skills/` by hand.
- The validator's TOML coherence check is fragile (substring match). A real TOML parser is on the upgrade list.
- `tsx` adds a transitive dependency surface to the workspace devDeps. Trade we accepted to keep the validator dependency-free at the script level.

**What this forecloses.**
- A future "single-source skill spec that compiles to both `.claude/` and `.codex/`" approach would simplify maintenance but is out of scope here. If the file count grows, that's the natural ADR-007.

## Alternatives considered

- **Single agent config file with both tools reading the same shape.** Rejected: Claude Code expects JSON, Codex expects TOML, and skill/subagent conventions differ. Forcing one format would ship broken config to one of the tools.
- **Skill content authored once and symlinked into `.claude/skills/` and `.codex/skills/`.** Tempting but breaks on Windows (no symlink support without admin). Plain-copy mirroring + the validator is more portable.
- **Heavyweight YAML/TOML parsers in the validator.** Rejected for now to keep the validator dependency-free at the script level. `tsx` is the only addition.
- **Skip subagents entirely and rely only on skills.** Rejected: subagents (`intent-extractor`, `drift-reconciler`, `code-generator`, `monitor`, `adr-writer`) carry distinct responsibilities that are best executed in a fresh context, especially the monitor (Tech-Spec §2 Pillar 5 requires the monitor to be uncorrelated with the production agent).

## References

- Bootstrap prompt that drove this configuration (recorded in commit message of the ADR-introducing commit).
- Tech-Spec §1 (architecture), §2 Pillar 1, §2 Pillar 5, §3, §6.
- ADR 0001 — Plugin-first, not standalone IDE.
- ADR 0004 — Agent orchestration is first-class.
- ADR 0005 — Faithfulness via architecture, not training.
- Anthropic Agent Skills overview (Dec 2025 open standard).
- Baker et al. 2503.11926 — the obfuscation tax warning that drives the monitor subagent's read-only design.
- Cognition, "Don't build multi-agents" — informs the architect/implementer split.
