---
type: research
updated: 2026-11-27
by: a research agent (sonnet), brief and synthesis by the orchestrator
---
# AI abstraction layer: state of play, 2026-11-27

Tags: [O] = the agent opened the page. [S] = search snippet only.

## Answer

Spec-as-source (a high-level language with an AI compiler underneath) has not worked out. Its two flagship attempts retreated in 2026. CodeSpeak dropped its compiler for agent plugins [O]. Tessl dropped its Framework for skills [S]. The evidence points to structured text as the source of truth, with the graph as a rendered view and a drift check.

## Comparison

| Approach | Source of truth | Human edits | Reproducibility | Verification | Maturity | Biggest risk |
|---|---|---|---|---|---|---|
| 1. IntentGraph as planned in May (graph over code) | Code, with graph nodes linked | Graph and code | None needed, since code stays the source | Drift events on save | Not built | Two stores to sync, and you build the sync |
| CodeSpeak, 2026-07-13 [O] | Atomic requirements extracted from agent chats (was .cs.md files) | Requirements | Not stated. Original CLI retired "at least for now" | "Confirm" step per requirement. Test generation is "later" | Waitlist. Intent Studio web tool only | Pivoted away from spec-as-source. Users did not hand-write specs |
| Tessl [S] | Spec registry, plus Framework (spec-as-source) | Specs | One spec maps to one file (Fowler [O], Oct 2025) | Not found | Framework still closed beta as of 2026-06. Pivoted to skills 2026-01-29, per a competitor's page | Never reached GA |
| Codeplain `***plain` [S] | `.plain` spec | Spec only | Regenerates from scratch. Uses cheap models (New Stack, snippet) | Conformance tests per requirement (docs, snippet) | Company about 1 year old | Docs and blog could not be opened. Hand-edit story unknown |
| Kiro [S] | EARS requirements, design and tasks | Specs and code | Not claimed | Optional property-based tests, "not formal verification". Requirements Analysis added 2026-05-12 | GA 2025-11-17 | Overkill for small tasks (Fowler [O]). Specs drift |
| GitHub Spec Kit [O releases] | Markdown specs in a branch per feature | Specs and code | Not claimed | Checklists and workflows | v1.4.5 on Nov 25. Very active | Spec-first only (Fowler [O]) |
| OpenSpec [S] | Delta specs (ADDED/MODIFIED) archived into specs | Specs and code | Not claimed | Spec validation only | v1.0 2026-01-26. Weekly downloads reported (about 382k) | Weak when specs are loose (eacp.dev, snippet) |
| 3. Hybrid (structured text plus graph view) | Typed markdown or YAML specs | Spec files, rendered as a graph | Not required. Code is regenerated per change, not from scratch | Spec-to-code check on commit | Proposed | A drift check that only runs at commit |

## Research since June 2026

- **Spec-driven in practice** [O abstract only]. arXiv 2608.25202, v1 2026-08-25, v5 2026-11-16. 21 interviews (8 tool makers) and 266 repos from a 470,795-file corpus. Agents are more reliable, but planning and review cost more. Specs are mostly used for new features. "Implementation detail may help agents while making specs prone to decay." Spec-to-code checks run at completion, not continuously.
- **No defect reduction** [S]. An ESEM 2026 study of 88,052 PRs found none from spec artifacts alone. The primary paper was not found.
- **Gated workflow audit** [O abstract]. arXiv 2611.05094, 2026-11-03. Claude Code, 9 features, 7 projects, all the authors' own. 288 of 581 tasks completed. The orchestrator was the weak point because it judges its own checks. This supports a separate cheap monitor over an orchestrator that grades itself.
- **Drift-enforced architecture** [title only]. arXiv 2606.27045, Grabowski. The PDF would not parse.
- **MDE still matters** [O abstract]. arXiv 2609.35281, 2026-09-28. Rule-based generation from UML, refactored by LLM agents. Preliminary, and not about sync.
- **Round-trip sync** [O abstract]. arXiv 2608.05612, 2026-08-06, JDomInO. Deterministic forward generation, reverse extraction from Java. The reverse path is not validated end to end. It cites a mapping study saying lightweight text formats survive LLM workflows better than XMI/Ecore [S].
- **Regeneration unit.** No 2026 paper found. The only evidence is Tessl's one-spec-per-file design, which never reached GA, and Codeplain's per-requirement generation [S].
- **LLM nondeterminism** [S]. Different code from the same prompt is well documented. Fowler saw it with per-file specs, and more specific specs improved repeatability [O].

## Critiques

- **MDD parallel** (Fowler/Böckeler, 2025-10-15 [O]). Spec-anchored and spec-as-source may inherit MDD's inflexibility and LLM nondeterminism. All tools are spec-first.
- **Specs go stale like wikis** (DZone [S]). The answer offered is to keep specs current without relying on humans.
- **Why MDE round-trip failed** (the agent's synthesis, no new source). Generated code was lossy, and hand edits had no map back to the model. LLMs change the cost of writing the mapping. They do not remove the need for a verifiable check.
- **Best replies.** CodeSpeak's own post concedes that users did not write the specs, so extract intent from prompts [O]. Böckeler's data point that more specific specs repeat better [O].

## What changed since May 2026

- 2026-07-13: CodeSpeak retires its CLI and moves to Claude/Codex plugins. Atomic requirements replace .cs.md files. Bidirectional links and test generation are "later" [O].
- 2026-07-28: MCP spec 2026-07-28 is final [O]. Stateless core, no initialize handshake, no Mcp-Session-Id. Tasks become an extension. Roots, Sampling and Logging are deprecated. The post says nothing about stdio or skills.
- 2026-08-25 to 11-16: the SDD practice study is published [O abstract].
- Oct 2026: VS Code 1.144 ships Agent Host Protocol v1.0 [S]. 2026-11-04: VS Code 1.145 lets a nested session use a different harness (Claude, Copilot or Codex side by side) [O]. The page lists no new chat or agent extension API.
- Oct 2026: Claude Agent SDK TS around 0.3.296 to 0.3.314, with subagents, skills, plugins and structured outputs [S]. Version dates conflict between sources.
- 2026-11-17 to 25: Claude Code 2.1.327 to 2.1.332 [O, official changelog, only these 9 days read]. Skills served from MCP servers (beta), a PreSkillShellCommand hook, plugin optionalDependencies, `claude plugin init`, background agents that open a draft PR from a worktree, and VS Code `/plan`.
- 2026-11-03 to 25: Spec Kit goes 1.3.0 to 1.4.5 with workflows, presets and extensions [O].
- Kiro: spec engine upgrades on 2026-05-12, and a July 2026 expansion [S].
- Cursor, Windsurf, Antigravity: plan modes, background agents and commentable artifacts exist [S, from comparison articles]. No "codemap" or living-intent feature found in any of them.

## What we no longer need to build

- Orchestration and worktree plumbing. Claude Code and the VS Code harness picker already do worktrees, background agents with draft PRs, plan mode, hooks and plugin packaging.
- A generic spec workflow (propose, tasks, apply). Spec Kit and OpenSpec are maintained, and both ship as skills or commands for many agents.
- Our own MCP session handling. Verify against the 2026-07-28 spec before writing the server.
- An approval or plan UI. Plan mode and Antigravity-style artifacts exist.

Still not built by anyone found: a graph view of intent with a drift check from code back to intent.

## The agent's recommendation (for one developer)

1. Spec files are the source. Keep typed markdown with YAML frontmatter under /spec. Nodes are files, edges are frontmatter links. Keep the atomic, typed shape CodeSpeak landed on: one requirement or constraint per node, not a long document.
2. Render the graph from the files (React Flow plus ELK).
3. Do not generate code from the spec. Code is ordinary and hand-editable. A change goes spec edit, then an agent in a worktree, then a PR. Use Claude Code or the Agent SDK for this and drop the custom Inngest orchestration at first.
4. Keep the drift check, since it is the one thing nobody ships. The monitor compares changed code against the linked nodes, at commit, with the monitor kept separate from the implementing agent (supported by 2611.05094).
5. Ship it as a Claude Code plugin with skills and hooks. Add the VS Code webview only for the graph.
6. Borrow Spec Kit and OpenSpec's delta-spec idea (ADDED/MODIFIED) for spec changes.

Do not build: a custom language, a compiler, or a regenerate-everything flow. No source opened shows any of these working.

The owner's change to point 2 (2026-11-27): the graph is not read-only. Visual is the owner's preferred way to work, so editing on the graph comes early.

## Sources

- CodeSpeak July post, 2026-07-13: https://codespeak.dev/blog/spindle-20260713 [O]
- CodeSpeak home: https://codespeak.dev/ [O]
- Pragmatic Engineer on CodeSpeak, 2026-02-12: https://newsletter.pragmaticengineer.com/p/the-programming-language-after-kotlin [O]
- Böckeler/Fowler, 2025-10-15: https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html [O]
- SDD as prescribed and practiced, 2026-08-25 (v5 2026-11-16): https://arxiv.org/abs/2608.25202 [O]
- Gated spec workflow, 2026-11-03: https://arxiv.org/abs/2611.05094 [O]
- Models in the LLM era, 2026-09-28: https://arxiv.org/abs/2609.35281 [O]
- JDomInO round-trip, 2026-08-06: https://arxiv.org/abs/2608.05612 [O]
- MCP 2026-07-28: https://blog.modelcontextprotocol.io/posts/2026-07-28/ [O]
- Claude Code changelog, Nov 17 to 25 2026: https://code.claude.com/docs/en/changelog [O, partial]
- VS Code 1.145, 2026-11-04: https://code.visualstudio.com/updates/v1_145 [O]
- Spec Kit releases, Nov 2026: https://github.com/github/spec-kit/releases [O]
- Snippet-only: DZone https://dzone.com/articles/spec-driven-development , Codeplain https://thenewstack.io/codeplain-spec-driven-regenerative-code/ , Tessl status https://codemyspec.com/blog/tessl-review , OpenSpec https://github.com/Fission-AI/OpenSpec/releases/tag/v1.0.0 , arXiv 2606.27045

## Not verified

- Reproducibility, incremental regeneration and hand-edit behaviour for Codeplain, Kiro, OpenSpec and Tessl. Their docs could not be opened.
- Tessl's pivot (from a competitor's page), Kiro 2026 updates, and the ESEM 88,052-PR claim.
- Claude Code changes for June to October 2026, and exact Agent SDK versions.
- Whether the 2026-07-28 MCP changes affect stdio servers.
- Cursor, Windsurf and Antigravity 2026 specifics.
- Any independent benchmark of LLM-as-compiler reliability for spec-to-code.
