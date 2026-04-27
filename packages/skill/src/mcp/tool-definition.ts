// Shared ToolDefinition shape — separated from server.ts so each tool family
// file can import only the type without dragging in the MCP SDK at import time.

export interface ToolDefinition {
  name: string;
  description: string;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}
