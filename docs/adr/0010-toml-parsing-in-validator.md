# ADR 0010 — TOML parsing in the agent-config validator

## Status

Proposed.

## Context

`scripts/check-agent-config.ts` is the CI-enforced validator for project-level agent configuration (added under ADR-0006). One of its responsibilities is checking *coherence* between `.claude/settings.json` and `.codex/config.toml`: every MCP server registered in the Claude settings must also be declared in the Codex TOML config.

ADR-0006 decision #4 implemented that coherence check with a substring match — `codexText.includes('[mcp.<name>]')` — and explicitly called the trade "fragile". ADR-0006 decision #3 framed the validator as "dependency-free at the script level" beyond the `tsx` runner, with the explicit understanding that a real TOML/YAML parser would be added when the schema grew.

QA report 001 (`docs/qa/qa-report-001.md`) finding **F-CHECK-CONFIG-TOML-COHERENCE (minor)** documented the two real failure modes of the substring approach:

1. A commented-out `# [mcp.foo]` line passes the check falsely.
2. The inline-table form (a `[mcp]` table followed by `foo = { ... }` entries) does not match the `[mcp.foo]` header pattern at all.

Both are valid TOML. As the dogfood corpus and the MCP server list grow under the validator's gaze, the false-positive surface stops being acceptable.

This ADR records the upgrade. The validator now imports `@iarna/toml`, parses `.codex/config.toml` properly, reads the `mcp` table, and checks that every MCP server name registered in `.claude/settings.json` is present as a key in that table. `@iarna/toml` has zero transitive dependencies, which preserves the spirit of ADR-0006 decision #3 (small, scrutable dependency surface) without preserving its letter.

Tech-Spec sections this touches: §3 (component spec) only indirectly — this is a CI-tooling decision, not an architectural one. The architectural backstop is ADR-0006.

## Decision

Adopt `@iarna/toml@^2.2.5` as a workspace dev dependency for the agent-config validator's TOML coherence check. This **partially supersedes** ADR-0006:

- **ADR-0006 decision #4** (substring TOML coherence check) is replaced. The validator now parses `.codex/config.toml` with `@iarna/toml` and checks each MCP server name against the keys of the parsed `mcp` table.
- **ADR-0006 decision #3** is amended in scope. The validator was originally framed as "dependency-free at the script level" beyond `tsx`. That stance is amended to "dependency-light, with `@iarna/toml` for TOML parsing." The `tsx` runner stays. The purpose-built YAML frontmatter scanner stays.

ADR-0006 itself remains historically intact — ADRs are immutable after authorship per the project convention. This ADR records the supersession on the two clauses called out above; the other eight decisions in ADR-0006 (subagent paths, Codex TOML format, ralph defaults, STRUCTURE.md append, allow/deny DSL, conservative `allowed-tools` frontmatter, GitHub MCP registration, deferred `intentgraph` MCP server) are still in force.

### What this ADR rejects / does not change

- **YAML frontmatter scanner stays.** This ADR does *not* migrate the spec frontmatter scanner to `js-yaml`. ADR-0006 decision #3 still applies for YAML; only TOML parsing is upgraded. When the spec frontmatter schema grows past the four required fields and the recommended fields (per ADR-0009) stabilize, `js-yaml` adoption is the natural follow-up ADR.
- **No TOML writer surface.** The validator only reads `.codex/config.toml`. Generating or rewriting TOML is out of scope.

## Consequences

**Wins.**

- Both failure modes of the substring check are closed: commented `# [mcp.foo]` headers no longer pass falsely, and the inline-table form is now accepted correctly.
- The check is now structural rather than textual, so future changes to the TOML config's whitespace, comment style, or table layout will not silently break or silently pass.
- The dependency surface stays small. `@iarna/toml` has zero transitive dependencies, so the `pnpm install --frozen-lockfile` cost is one package, not a tree.

**Costs.**

- One more dev dependency to keep in sync. The cost is bounded — `@iarna/toml` is mature and low-churn — but it is non-zero.
- A second small precedent for adding parsers to the validator. The natural follow-up (YAML via `js-yaml`) is now a smaller psychological step. That is a win for ADR-0009's eventual tightening but a cost in that the "dependency-free" framing of ADR-0006 #3 is no longer literally true.

**What this forecloses.**

- It forecloses the option of staying purely substring-based at the validator level. If the validator ever needs to *write* TOML or YAML, that is a separate ADR.

## Alternatives considered

- **Hand-rolled mini TOML parser.** Tempting in the spirit of ADR-0006 #3, but the failure modes documented above (comment lines, inline tables, eventual nested tables) require enough TOML grammar coverage that a mini-parser would be larger and more bug-prone than the dependency it replaces.
- **`smol-toml` or `toml-eslint-parser`.** Both are competent. `@iarna/toml` was chosen for its zero-transitive-dep footprint and its `parse` API that returns plain objects suitable for `name in mcpTable` checks without further work.
- **Defer until the next config drift bites.** Rejected: F-CHECK-CONFIG-TOML-COHERENCE is already a documented finding, the fix is small, and the validator is the only programmatic gate on `.claude` ↔ `.codex` coherence.

## References

- ADR-0006 — `0006-agent-configuration-setup.md` — the ADR partially superseded by this one. Decisions #3 (amended) and #4 (replaced).
- QA report 001 — `docs/qa/qa-report-001.md` — finding **F-CHECK-CONFIG-TOML-COHERENCE (minor)** is the issue this ADR closes.
- `scripts/check-agent-config.ts` — the file changed; the new logic lives at the `mcp` coherence block (`TOML.parse` + key-presence check).
- `package.json` — workspace dev dependencies; `@iarna/toml@^2.2.5` was added there.
- ADR-0009 — `0009-spec-frontmatter-schema.md` — the natural next-step ADR if/when the YAML frontmatter scanner is upgraded to `js-yaml` on similar grounds.
