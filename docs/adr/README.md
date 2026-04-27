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
| 0014 | [Interactive /qa shells out to codex exec directly; supersede ADR-0013's composes-/codex clause](./0014-qa-pass-2-shells-out-to-codex-exec-directly.md) | Proposed |
