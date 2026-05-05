# Architecture Decision Records

One ADR per architectural pillar. New ADRs are numbered sequentially. Once accepted, an ADR is immutable; supersede it with a new ADR rather than editing.

| # | Title | Status |
|---|-------|--------|
| 0001 | [Plugin-first, not standalone IDE](./0001-plugin-first.md) | Accepted |
| 0002 | [Relational graph store as substrate](./0002-relational-graph-store.md) | Accepted |
| 0003 | [Spec-driven loop is the backbone](./0003-spec-driven-loop.md) | Accepted |
| 0004 | [Agent orchestration is first-class](./0004-agent-orchestration.md) | Accepted |
| 0005 | [Faithfulness via architecture, not training](./0005-faithfulness-by-architecture.md) | Accepted |
| 0006 | [Agent configuration setup](./0006-agent-configuration-setup.md) | Accepted (#3, #4 superseded by 0010) |
| 0007 | [Autonomous workflow: cc-sdd + bash-loop Ralph](./0007-autonomous-workflow.md) | Accepted (monitor-training CI clause superseded by 0012) |
| 0008 | [Codex bridge: slash command, not auto-invoking skill](./0008-codex-bridge.md) | Accepted |
| 0009 | [Spec frontmatter schema](./0009-spec-frontmatter-schema.md) | Accepted |
| 0010 | [TOML parsing in the agent-config validator](./0010-toml-parsing-in-validator.md) | Accepted |
| 0011 | [Test infrastructure layout](./0011-test-infrastructure-layout.md) | Accepted |
| 0012 | [Defer the monitor-training CI check until the first fine-tune script lands](./0012-defer-monitor-training-ci-check.md) | Accepted |
| 0013 | [QA self-audit pattern: self-report plus independent Codex audit, per commit](./0013-qa-self-audit-pattern.md) | Accepted (composes-/codex clause partially superseded by 0014) |
| 0014 | [Interactive /qa shells out to codex exec directly; supersede ADR-0013's composes-/codex clause](./0014-qa-pass-2-shells-out-to-codex-exec-directly.md) | Accepted (partially supersedes 0013) |
| 0015 | [Schema scope: monolithic Drizzle schema in phase 2 vs staged per-phase migration](./0015-schema-scope-staged-vs-monolithic.md) | Accepted |
| 0016 | [Verifier interface: location, scheduling, and registration](./0016-verifier-interface.md) | Accepted |
| 0017 | [Task state machine: split storage and view enums](./0017-task-state-machine.md) | Accepted |
| 0018 | [Concepts as the regeneration unit and primary scaling axis](./0018-concepts-as-regeneration-unit.md) | Accepted |
| 0019 | [Obligation attachment semantics: schema permissive, discipline at concept contract surface](./0019-obligation-attachment-semantics.md) | Accepted |
| 0020 | [Per-decision-type legibility taxonomy](./0020-per-decision-type-legibility-taxonomy.md) | Accepted |
| 0021 | [Monitor LLM presentation framing: teammate observation, not audit finding](./0021-monitor-llm-presentation-framing.md) | Accepted |
| 0022 | [Categorical encoding for AI confidence and severity](./0022-categorical-encoding-for-confidence-and-severity.md) | Accepted |
| 0023 | [Branch-and-review for graph state: three-tier state model with merge as a new inbox item type](./0023-branch-and-review-for-graph-state.md) | Accepted |
| 0024 | [Provenance preservation on edits: confidence flags downgrade only on explicit assertion](./0024-provenance-preservation-on-edits.md) | Accepted |
| 0025 | [Scope change and stale requirement detection](./0025-scope-change-and-stale-requirement-detection.md) | Accepted |
| 0026 | [Parent ID is concept-only](./0026-parent-id-is-concept-only.md) | Accepted |
| 0027 | [Playwright MCP as the first UI-driving MCP server](./0027-playwright-mcp-first-ui-driving-server.md) | Proposed (split-rejection clause to be superseded by 0028 on acceptance) |
| 0028 | [MCP server registrations belong in /.mcp.json, not .claude/settings.json](./0028-mcp-server-registrations-belong-in-mcp-json.md) | Proposed |
