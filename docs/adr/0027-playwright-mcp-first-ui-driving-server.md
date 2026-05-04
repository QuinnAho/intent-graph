# ADR 0027 — Playwright MCP as the first UI-driving MCP server

## Status

Proposed 2026-05-04.

## Context

IntentGraph is in Phase 2 closeout. The L0 acceptance checklist (`automation/staging/PHASE2_L0_CHECKLIST.md`) has Item 7 (60-second find-an-intent UX test) blocked on three live canvas bugs in the webview: the target intent does not render after panning, click-to-select is dead on node bodies, and zoom is dead. Static CSS and React Flow source inspection have narrowed the candidate fixes but cannot disambiguate without computed-style and event-listener evidence from a real browser running the packaged webview.

The agent surface registered three MCP servers at ADR-0006 time: `filesystem`, `git`, `github`. Each is a read-only or text-shaped surface over files and version control. None drives a UI. To unblock Item 7 we need Microsoft's [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp) registered into both `.claude/settings.json` and `.codex/config.toml` so that an agent in either harness can open the local Vite dev server, click the canvas, dump computed styles, and screenshot the result.

Adding Playwright is not just "one more MCP server." Filesystem, git, and github are scoped to the workspace and to the GitHub API; their blast radius is bounded by what's already in the repo and what the PAT can touch. Playwright spawns a real headed Chromium that an agent can drive against arbitrary URLs, fill forms, and exfiltrate DOM. That is the architectural inflection this ADR records: Playwright is the **first UI-driving MCP server** registered for IntentGraph, and the rules that govern it are different from the rules that govern read-only file surfaces.

The tooling-landscape memo lists Playwright MCP as day-one when "the canvas has bugs static inspection cannot disambiguate" — the named failure mode it addresses. That failure mode is now active.

Tech-Spec sections this touches: §2 Pillar 1 (one MCP server, three clients — Playwright is *agent-harness* MCP, not the IntentGraph MCP server itself; the distinction matters), §5 (MCP tool surface — Playwright is not part of the IntentGraph tool surface), §6 Phase 2 (L0 dogfood gate that Item 7 sits on).

## Decision

Register `@playwright/mcp` in both agent-harness configurations, scoped tightly to webview canvas diagnosis at the L0 / L1 dogfood layer.

Concrete shape:

- **`.claude/settings.json` `mcpServers.playwright`** with `command = "npx"`, `args = ["-y", "@playwright/mcp@latest", "--browser=chromium", "--viewport-size=1920,1080"]`, and a description that names the use case (webview canvas diagnosis), the prerequisite (`npx playwright install chromium`, ~150 MB once per machine), and the scoping rule.
- **`.codex/config.toml` `[mcp.playwright]`** with the same `command`, `args`, and description, per the ADR-0006 mirror discipline. The two configs must stay in sync; `pnpm tsx scripts/check-agent-config.ts` returns OK against the staged diff.
- **Scope rule, encoded in the description and restated in CLAUDE.md / AGENTS.md when those next change:** Playwright MCP is for the local Vite dev server (`http://localhost:5173`) and the packaged extension's webview during development. Agents may not navigate to external URLs without explicit per-invocation human approval, and may not use Playwright to authenticate, scrape credentialed pages, or drive any production system.
- **Prerequisite step on first use, per machine:** `npx playwright install chromium` to fetch the browser binary. This is documented in the description field; we are not adding it to a `postinstall` because most contributors will not exercise Playwright MCP and forcing the download for everyone is wrong.
- **No promotion to AgentRunner / trace store at this stage.** Playwright MCP runs exist outside the `trace_event` substrate, just like `/codex` runs do today. The same posture as ADR-0008: the agent-harness bridge is the first stop; the registered, traced, in-skill version is a deferred decision (see below).

## What this decision rejects

- **Browser automation as a generic agent capability with no scoping.** A `@playwright/mcp` registration with no description-level scope rule would let an agent click into Gmail, exfiltrate a session cookie, or drive a production dashboard during what looked like a routine debug task. The risk surface (cross-origin, credentials, DOM scraping) is too broad for a Phase 2 diagnostic tool. The scoping rule is encoded both in the description text the agent sees and in this ADR.
- **Splitting MCP server config across `.claude/settings.json` and a separate `.mcp.json`.** The original setup (commit 17abe03 in the agent-config bootstrap) keeps MCP servers in `.claude/settings.json`. An earlier draft of this change considered moving Playwright to a sidecar `.mcp.json`; doing so would desynchronise the two locations and undermine the parity validator. The correct answer is to keep all MCP server registrations in one place per agent harness, mirrored across `.claude/` and `.codex/`.
- **Lifting Playwright's surface into the AgentRunner trace store at this stage.** Same posture as ADR-0008 for Codex: `trace_event` rows are written by AgentRunner for model calls; tooling that runs *outside* the skill subprocess is not yet plumbed in. Playwright's value at L0 / L1 is debugging, not training data. The promotion is a deferred decision (next section).
- **Auto-invoking Playwright from a skill description.** No `playwright-debug` skill is being added. Playwright is invoked only when the human or another command explicitly drives the agent through a Playwright-shaped task, the same explicit-only posture ADR-0008 takes for Codex. The skill controllability problem (paddo.dev, cited in ADR-0008) applies identically to UI-driving capabilities — arguably more so, given the larger blast radius.

## Deferred decision

When IntentGraph's own MCP server ships in Phase 3 (per ADR-0003 and `tech-spec.md` §5), revisit whether Playwright should be a registered capability *inside* the IntentGraph skill subprocess — one whose calls traverse AgentRunner, write `trace_event` rows, and become subject to the monitor LLM gate. The MCP path would let UI-driven verifications participate in the faithfulness substrate; today they don't. That revisit is a new ADR; this one stays scoped to the pre-Phase-3 agent-harness configuration.

## Consequences

**Wins.**

- Item 7 of the L0 acceptance checklist is unblocked. An agent can reproduce the three canvas bugs, dump the computed styles and event listeners, and propose a patch grounded in browser-state evidence rather than CSS pattern-matching.
- Both Claude Code and Codex sessions get the same UI-driving capability, preserving the ADR-0006 mirror discipline. A contributor using either harness sees the same Playwright surface with the same scoping rule.
- Playwright MCP is the natural substrate for future webview verifications (e.g. the `intentgraph.dogfood.find-intent-in-60s` obligation suggested by Item 7's acceptance criterion). Registering it now means we don't need a second wiring round-trip when those verifications land.

**Costs.**

- One more MCP server in the parity-mirrored config surface; the agent-config validator already enforces parity, so this is structural cost only.
- The first invocation on any machine pays a ~150 MB Chromium download. Documented in the description; not a one-line `pnpm install` cost.
- Playwright runs are outside the trace store. Until the deferred Phase-3 decision lands, faithfulness-tracking does not extend to UI-driven debugging. This is the same gap ADR-0008 documents for `/codex`; we accept it for the same reason.
- The scoping rule is description-level, not enforced in code. An agent that ignored the scope and navigated to an external URL would not be hard-blocked at the MCP layer; we rely on the agent reading the description and the per-invocation human present in dogfood sessions. If the scope leaks in practice, tighten with a wrapper or proxy in a follow-up ADR.

**What this forecloses.**

- A future "register every useful MCP server we discover" pattern. Playwright is in because Item 7 is blocked; the next UI-driving MCP server (e.g. a generic browser-tools server) needs its own ADR and its own scoping rule. The bar is the same as for any architectural call: if it constrains future work, it's load-bearing.

## References

- Tech-Spec §2 Pillar 1 (one MCP server, three clients — distinguishing IntentGraph's own MCP server from agent-harness MCP servers), §5 (MCP tool surface), §6 Phase 2 (L0 dogfood gate).
- ADR 0006 — Agent configuration setup (mirror discipline between `.claude/` and `.codex/`).
- ADR 0007 — Autonomous workflow (human checkpoints in Phases 3, 4, 6; relevant when revisiting the deferred decision).
- ADR 0008 — Codex bridge (the "deferred decision" pattern this ADR mirrors, and the controllability argument for explicit-only invocation).
- `automation/staging/PHASE2_L0_CHECKLIST.md` Item 7 — the active blocker that motivated the registration.
- Microsoft `@playwright/mcp` — https://github.com/microsoft/playwright-mcp.
- `scripts/check-agent-config.ts` — parity validator that enforces the `.claude/` ↔ `.codex/` mirror.
