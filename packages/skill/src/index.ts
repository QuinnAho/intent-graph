// Entry point for the IntentGraph skill subprocess. Parses CLI args, opens the
// SQLite store, runs migrations + backup, starts the MCP server over stdio (or
// Streamable HTTP when explicitly requested), and wires watcher + orchestrator.
//
// Invoked by:
//   - The VS Code extension via packages/extension/src/skill-process
//   - Claude Code via .claude/skills/intentgraph (packages/agent-skill)
//   - Codex via .codex/skills/intentgraph (packages/agent-skill)

export const SKILL_ENTRY_PLACEHOLDER = 'intentgraph-skill';
