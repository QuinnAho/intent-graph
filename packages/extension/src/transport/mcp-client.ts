// Thin wrapper around @modelcontextprotocol/sdk's StdioClientTransport.
// Connects to the spawned skill subprocess and exposes typed call() helpers
// keyed by the constants in @intentgraph/shared/protocol/mcp-tool-names.

export const TRANSPORT_MCP_CLIENT_PLACEHOLDER = 'transport-mcp-client';
