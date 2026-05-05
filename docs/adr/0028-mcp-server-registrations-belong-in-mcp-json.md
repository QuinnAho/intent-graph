# ADR 0028 — MCP server registrations belong in /.mcp.json, not .claude/settings.json

## Status

Proposed 2026-05-04. Partially supersedes [ADR-0027](./0027-playwright-mcp-first-ui-driving-server.md) §"What this decision rejects" point 2 (the clause that rejected splitting MCP config across `.claude/settings.json` and a separate `.mcp.json`). Amends [ADR-0006](./0006-agent-configuration-setup.md)'s mirror-discipline rule, which named `.claude/settings.json` as the Claude-side source of truth for MCP servers.

## Context

ADR-0027 registered Playwright MCP under `.claude/settings.json`'s `mcpServers` block and explicitly rejected splitting MCP configuration to a sidecar `.mcp.json`. The reasoning at the time was that a sidecar would desynchronise the two locations and undermine the parity validator at `scripts/check-agent-config.ts`.

That reasoning was based on a wrong premise. Claude Code's `settings.json` schema (https://json.schemastore.org/claude-code-settings.json) does not include a `mcpServers` key. Project-scoped MCP servers are read from `/.mcp.json` at the repo root, per Anthropic's documentation (https://code.claude.com/docs/en/mcp.md § "Project scope"). Entries placed in `.claude/settings.json` under `mcpServers` are silently ignored by Claude Code — no warning, no parse error, no log line.

The practical consequence is that all four MCP servers in this repo (`filesystem`, `git`, `github`, `playwright`) were dead from registration. The configuration block was syntactically valid JSON in the right file, mirrored correctly into `.codex/config.toml`, validated by the parity check, and reviewed in PRs — but Claude Code never loaded any of them. The user only noticed because Playwright was the first registered server that should have produced visible browser side-effects (windows opening, screenshots written). Filesystem, git, and github failed silently because nothing in the workflow uses them through the MCP path that wouldn't also work through native tools.

The `_intentgraph_notes.future_mcp_servers` line in `.claude/settings.json` (planning to register the IntentGraph MCP server in the same file in Phase 3) inherited the same wrong premise and would have repeated the bug at exactly the moment we most need the registration to work — when the IntentGraph skill subprocess starts producing trace events.

This is a config-shape decision that touches Tech-Spec §2 Pillar 1 (one MCP server, three clients — the location of *agent-harness* MCP registrations is what this ADR records; the IntentGraph MCP server itself is unchanged), §3 (component spec — the validator surface), and §6 Phase 3 (the deferred IntentGraph MCP registration that will land into the new location).

## Decision

Move all MCP server registrations from `.claude/settings.json` `mcpServers` to `/.mcp.json` at the repo root. Update the parity validator and the project memory files to match. Concrete shape:

- **`/.mcp.json` is the source of truth for project-scoped MCP servers.** Top-level `mcpServers` object; per-server `type: "stdio"`, `command`, `args`, optional `env`. No `description` field — the format does not support it and entries are silently ignored. No `$schema` — Anthropic has not published one. The four current entries (`filesystem`, `git`, `github`, `playwright`) ship in this ADR's follow-up commit, lifted verbatim from the prior `.claude/settings.json` block.
- **`.claude/settings.json` no longer carries an `mcpServers` block.** The validator (`scripts/check-agent-config.ts`) actively rejects the key, with an error message that names this ADR. The rejection is a hard fail in CI: `pnpm check:agent-config` exits non-zero if `mcpServers` reappears in `.claude/settings.json`.
- **Mirror discipline (ADR-0006) is amended.** The Claude-side source-of-truth for MCP server registrations is `/.mcp.json`; the Codex mirror is still `.codex/config.toml [mcp.<name>]`. Parity is enforced bidirectionally — each side flags servers missing from the other. The validator already used a TOML parser (per ADR-0010); the change is mechanical (read `/.mcp.json` instead of `.claude/settings.json` for the Claude-side server set).
- **Description-grade rationale lives in `.claude/settings.json` `_intentgraph_notes`.** Playwright's scoping rule (per ADR-0027), the GitHub PAT requirement, and the future-IntentGraph-MCP plan all stay as prose in `_intentgraph_notes` rather than getting forced into a `description` field that `.mcp.json` does not support. The notes file remains the human-readable companion to the registration; the registration itself stays minimal.
- **The IntentGraph MCP server, when it ships in Phase 3, registers in `/.mcp.json`.** No separate ADR needed for that registration; this one establishes the location.

## What this decision rejects

- **Keeping `mcpServers` in `.claude/settings.json` for "discoverability."** It does not work. The entries are silently ignored. Discoverability is a non-goal when the discoverable location is broken; the new location is one directory level up (the repo root) and is referenced from `_intentgraph_notes`, CLAUDE.md, and AGENTS.md.
- **Storing scoping rules inside `/.mcp.json`.** The format does not support a `description` field. Adding one would either be silently ignored (best case) or cause Claude Code to refuse to load the file (worst case, depending on schema-strictness behavior we have not tested). The scoping rules belong in prose docs (this ADR, ADR-0027) and `_intentgraph_notes`, where they were already authored.
- **Auto-creating `/.mcp.json` from `claude mcp add --scope project ...`.** Convenient but inconsistent — the project already has hand-written agent configuration files (`.claude/settings.json`, `.codex/config.toml`), and the `_intentgraph_notes` block is only meaningful when a human has authored the surrounding shape. Hand-writing `/.mcp.json` keeps the discipline uniform and makes the diff reviewable.
- **Reading the user-scope `~/.claude.json` as the source of truth.** Project-scoped is correct: the registrations are workspace-coupled (filesystem path, git repository path) and need to ship in version control so that every contributor and CI run sees the same surface. User-scope would put the registrations outside the repo and break parity with `.codex/config.toml`, which is already in the repo.
- **Editing ADR-0027 in place to remove the now-wrong split-rejection clause.** ADRs are immutable after acceptance. ADR-0027 is still in `Proposed` status as of this ADR's authorship, but its substance (the Playwright registration itself) is correct and the human is reviewing it; supersession is the right path for the one clause that was wrong, and ADR-0027's main decision survives intact.

## Deferred

- **A published JSON Schema for `/.mcp.json`.** When Anthropic publishes one, add the `$schema` reference for editor validation. Not deferred to a date; pick it up if and when the schema URL becomes stable.
- **The Phase 3 IntentGraph MCP registration.** This ADR establishes the location (`/.mcp.json`) and the parity expectation; the registration itself is a Phase-3 task, not a separate ADR. The validator will start failing if the `intentgraph` server appears in only one of `/.mcp.json` or `.codex/config.toml`, the same way it does for the four current servers.

## Consequences

**Wins.**

- All four MCP servers are now actually loaded by Claude Code. Filesystem, git, github, and playwright become real surfaces for the first time, six commits after they were "registered." Playwright MCP becoming live unblocks L0 acceptance Item 7 (which was the original motivation for ADR-0027); the other three start working as a side benefit.
- The validator now catches the failure mode that allowed this bug to live undetected for a sprint. The `mcpServers`-in-`.claude/settings.json` rejection is a hard CI fail with an error message that names this ADR. A regression cannot ship without an ADR-superseding commit.
- The agent-config surface gets one bit closer to the documented Anthropic shape. Future contributors reading Anthropic's MCP docs will find the configuration where the docs say it should be, rather than in a location the docs do not mention.

**Costs.**

- Description rationale is split. Structured fields (`command`, `args`, `env`) live in `/.mcp.json`; prose context (scoping rules, PAT requirements, deferred plans) lives in `.claude/settings.json` `_intentgraph_notes` and the relevant ADRs. Contributors editing MCP config must update both sides if the prose changes. The validator does not enforce the prose link — that is a follow-up if the split causes drift.
- The `.claude/settings.json` file now contains an `_intentgraph_notes.mcp_servers_location` line whose only job is to redirect a confused reader. That is structural cost from documenting the redirection, not from the redirection itself.
- One more file in the repo root. `/.mcp.json` joins `.claude/`, `.codex/`, `tech-spec.md`, etc. as a top-level config artifact. Acceptable — the repo root is already the natural home for top-level config, and `/.mcp.json` is the documented Anthropic convention.

**What this forecloses.**

- The "single-file MCP config in `settings.json`" pattern, which never worked anyway. Future MCP-shaped tools register in `/.mcp.json` + `.codex/config.toml`; the parity validator prevents drift. ADR-0027's split-rejection clause is no longer an architectural rule; the new rule is the location specified above.
- Any future "store MCP rationale in the registration file itself" approach. The format does not support it; this ADR commits to the prose-in-notes split as the steady state. If Anthropic publishes a schema that includes a description field, supersede with a new ADR rather than backporting prose into existing entries.

## Threshold and risk

The risk profile, recorded explicitly so a future reader has the honest version:

- **Operational risk: low.** The previous configuration was non-functional; moving to the documented location can only improve the surface. The four lifted entries are byte-identical to the prior `.claude/settings.json` block (modulo the `description` fields the new format does not accept).
- **Architectural risk: low.** This ADR amends one clause in ADR-0006 (mirror-discipline naming) and one clause in ADR-0027 (split-rejection). The parity validator continues to be the load-bearing enforcement mechanism; the change is which file it reads as the Claude-side source.
- **Cost risk: low.** The validator change is mechanical (~30 lines of TypeScript). The migration is one new file (`/.mcp.json`), one deletion (the `mcpServers` block in `.claude/settings.json`), one update to `_intentgraph_notes`, and parity-mirror updates to CLAUDE.md and AGENTS.md if they reference the old location.

## Alternatives considered

- **Leave the broken registration in `.claude/settings.json` and document that MCP servers don't work in this project.** Rejected: ADR-0027's whole motivation was unblocking L0 Item 7 via Playwright MCP. Documenting the failure mode without fixing it would mean L0 closure depends on a tool that does not actually load.
- **Move only Playwright to `/.mcp.json` and leave filesystem/git/github in `.claude/settings.json`.** Rejected: same wrong premise, smaller blast radius. The other three servers also do not load from `.claude/settings.json`; partial migration would leave three silent failures in place.
- **Inline the registrations into `.codex/config.toml` only and skip Claude-side configuration entirely.** Rejected: it breaks parity (no Claude-side registration means the Claude harness has no MCP surface at all) and abandons the four servers for Claude Code users. The parity validator exists exactly so neither side can drift to "no surface."
- **Wait for Anthropic to publish a `/.mcp.json` schema before migrating.** Rejected: the location is documented in Anthropic's MCP docs and matches the user-scope shape. Waiting on a schema to validate against is the wrong gate; the schema, if it ever ships, is additive.
- **Edit ADR-0027 in place to delete the split-rejection clause.** Rejected: ADRs are immutable after acceptance, and even though ADR-0027 is still in `Proposed`, the supersession path is the project's contract for this kind of correction. ADR-0027's main decision (Playwright registration with scoping rules) is correct and untouched; only the one clause that was wrong is superseded here.

## References

- Anthropic Claude Code MCP docs — https://code.claude.com/docs/en/mcp.md (project scope, `.mcp.json` shape, env-var expansion).
- Anthropic Claude Code settings docs — https://code.claude.com/docs/en/settings.md (settings.json schema; `mcpServers` is not a top-level key).
- Claude Code settings JSON Schema — https://json.schemastore.org/claude-code-settings.json.
- [ADR-0006](./0006-agent-configuration-setup.md) — *Agent configuration setup*. Mirror discipline; this ADR amends the MCP-source-of-truth rule from `.claude/settings.json` to `/.mcp.json`.
- [ADR-0027](./0027-playwright-mcp-first-ui-driving-server.md) — *Playwright MCP as the first UI-driving MCP server*. Partially superseded: §"What this decision rejects" point 2 (split rejection). The Playwright registration itself, the scoping rule, and the deferred Phase-3 promotion all stand.
- [ADR-0010](./0010-toml-parsing-in-validator.md) — *TOML parsing in the agent-config validator*. The validator change in this ADR builds on ADR-0010's TOML parser swap.
- `scripts/check-agent-config.ts` — updated to read `/.mcp.json` as the Claude-side source and to reject `mcpServers` in `.claude/settings.json`.
- `/.mcp.json` — the new source of truth, four entries lifted verbatim from the prior `.claude/settings.json` block.
- `.codex/config.toml` `[mcp.*]` — the Codex mirror; unchanged in shape, now mirrored against `/.mcp.json` instead of `.claude/settings.json`.
