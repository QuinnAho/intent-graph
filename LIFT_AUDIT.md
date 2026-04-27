# LIFT_AUDIT — claudemap/ vs tech-spec.md

Scope: `claudemap/contracts/`, `claudemap/skill/SKILL.md` (frontmatter), `claudemap/agents/`. Reference: `tech-spec.md` §7 ("Identified gaps, risks, and unresolved questions") item **A**, plus the do-not-lift list in `CLAUDE.md`.

This audit complements [`LIFT_LOG.md`](./LIFT_LOG.md), which is the running record of what *has* been lifted (22 entries on 2026-04-26) and what was deliberately not lifted (with reasons). The audit below re-validates the "Deliberately not lifted" rows against the actual ClaudeMap source for §7-A and surfaces anything that contradicts the IntentGraph architecture; the lift gate before any future merge runs through the [`intentgraph-claudemap-lifter`](./.claude/skills/intentgraph-claudemap-lifter/SKILL.md) skill, which consults both files.

§7-A explicitly listed four Day-1 facts to verify against ClaudeMap source. Findings below resolve each, then flag everything that contradicts the IntentGraph architecture.

## Day-1 facts (§7-A)

| Question | Finding | Verdict |
|---|---|---|
| Is the contracts schema JSON Schema, Zod, or hand-rolled? | Hand-rolled JS validators using a `validateShape` helper over plain string-typed shapes (`claudemap/skill/lib/contracts/schemas/graph.js`, `…/shared.js`). No Zod, no JSON Schema, no `.d.ts` source of truth. Schema docs live in `contracts/schema.md` as prose. | **Contradicts** tech-spec — IntentGraph requires Zod schemas in `packages/shared` (see `CLAUDE.md` directory layout, §3 of tech-spec). Do not lift. |
| `SKILL.md` frontmatter: `allowed-tools`, `disable-model-invocation`? | Frontmatter contains only `name` and `description` (`claudemap/skill/SKILL.md:1-4`). Neither `allowed-tools` nor `disable-model-invocation` is present. | Neutral. Research brief's assumption is wrong but not load-bearing. IntentGraph's skill is an MCP subprocess, not a Claude Code skill manifest, so the field set does not transfer regardless. |
| `agents/` inventory? | One agent: `claudemap-architect.md` (sonnet, tools: Read/Glob/Grep/Bash, effort: high, maxTurns: 10). Single-purpose: emit graph JSON for ClaudeMap rendering. | **Do not lift.** IntentGraph has its own subagent set (`intent-extractor`, `drift-reconciler`, `code-generator`, `monitor`, `adr-writer`) with different contracts and a different model-routing posture (T0/T1/T2 per ADR-0004). The architect's "produce a navigable graph from a snapshot" purpose has no analogue in IntentGraph — the graph here is authored from `/spec/*.md` + tree-sitter, not LLM-enriched. |
| Does ClaudeMap have an MCP server? | **Yes.** `claudemap/app/src/mcp/server.js:1-24` is a stdio MCP server (`McpServer` + `StdioServerTransport`) that registers tools from `claudemap/app/src/mcp/handlers.js`. The `claudemap/skill/lib/mcp-client.js` is the matching client helper. Research brief F.A's claim was wrong. | **Refutes** the research brief, but does not change the do-not-lift conclusion. `claudemap/app/src/mcp/handlers.js` is on the do-not-lift list; the bootstrap from `server.js` was already lifted (`LIFT_LOG.md:25`) into `packages/skill/src/mcp/server.ts` with handlers stripped. IntentGraph's MCP server is not "ground-up" but is a re-architected implementation around the lifted bootstrap. Update onboarding text that still implies "no MCP at all in ClaudeMap" — the truth is "has one, handlers don't transfer." |

## Direct contradictions with `CLAUDE.md` "Hard rules"

1. **JSON-as-storage everywhere.** `contracts/schema.md` defines three persisted JSON payloads: graph, cache (`claudemap-cache.json`), runtime state (`claudemap-runtime-state.json`). `CLAUDE.md` hard rule: *"No JSON-as-storage. SQLite is the substrate. … `graph.json` exports are dumps you can round-trip from, never sources."* The entire ClaudeMap persistence model is the failure mode tech-spec §3/ADR-0002 is built to avoid. **Lift no persistence code.**
2. **Contracts on the do-not-lift list.** `CLAUDE.md` enumerates: *"Do not lift these from ClaudeMap. Contracts, handlers, cache layer, enrichment pipeline, JSON storage."* `claudemap/contracts/` and `claudemap/skill/lib/contracts/` are explicitly named here. The schema doc is useful as *reference* (what shapes ClaudeMap moved through) but no file under either directory should be ported. Confirmed match against the do-not-lift list.
3. **Hand-rolled validators vs TypeScript-strict + Zod.** `validateShape` accepts string type tokens at runtime and tolerates extra fields silently. IntentGraph requires `tsconfig.base.json` strict + Zod-at-boundaries. Lifting any contract code would force a Zod rewrite anyway, removing the only reason to lift it.
4. **Architect agent's model call shape.** `claudemap-architect.md:1-9` declares `model: sonnet` and uses `Bash` tool. IntentGraph's hard rule: *"AgentRunner-only model calls."* Any agent IntentGraph adopts must route through `packages/skill/src/agent-runner/` so a `trace_event` row is recorded (ADR-0005 faithfulness). Lifting the architect agent verbatim would create an out-of-band model-call site that the ESLint chokepoint rule cannot see (it only catches `import` from `ai`, not Claude Code subagent declarations) — but the *spirit* of the rule still applies. **Do not lift the agent file.**
5. **No second graph model.** `claudemap-architect.md` is built around the architect emitting the graph. IntentGraph's graph is a deterministic projection of `/spec/*.md` + `event_log` (ADR-0002, ADR-0003). An LLM-emitted graph would be a second graph model — forbidden by `CLAUDE.md`.

## Things safe to consult (not lift) as reference

- `claudemap/contracts/schema.md` — useful as a reference for the *shape vocabulary* (system/file/function nodes, `imports` edges, `health` overlay) when designing IntentGraph's own Zod schemas in `packages/shared`. Translate the vocabulary; do not import the file.
- `claudemap/agents/claudemap-architect.md` — useful as a reference for *what a graph-shaping agent's prompt looks like* if/when IntentGraph builds the `intent-extractor` subagent. Translate the prose; do not import the agent.
- `claudemap/skill/SKILL.md` — useful as a reference for *runtime-orchestration narrative style*; no fields transfer.

## Allowed lifts (already on the green list, restated for completeness)

Per `CLAUDE.md`: React Flow shell, ELK-in-worker layout pipeline, Zustand store patterns. None of those live under the audited paths.

## Recommended action items

1. None of the audited files require modification. This is a read-only audit.
2. Update onboarding/research-brief text that still claims "ClaudeMap has no MCP server" — it does (`claudemap/app/src/mcp/server.js`), and the bootstrap was already lifted (`LIFT_LOG.md:25`). The defensible claim is narrower: "ClaudeMap's MCP *handlers* are not transferable" (already on the do-not-lift list).
3. When the `intentgraph-claudemap-lifter` skill processes any future request to lift from `claudemap/contracts/`, `claudemap/skill/lib/contracts/`, or `claudemap/agents/`, refuse on the basis of this audit.

## Verdict

ClaudeMap's contracts, persistence, and agent layer are architecturally incompatible with IntentGraph's substrate. The do-not-lift list in `CLAUDE.md` already covers them; this audit confirms that decision against the actual files and resolves §7-A.
