// Canonical MCP tool name constants. The skill registers tools by these names
// and the extension references them by these constants — never by string literal.

export const MCP_TOOL_NAMES_PLACEHOLDER = Object.freeze({
  // graph.*       — populated in Phase 0
  // retrieval.*   — populated in Phase 1
  // task.*        — populated in Phase 1
  // verify.*      — populated in Phase 2
  // trace.*       — populated in Phase 2
} as const);
