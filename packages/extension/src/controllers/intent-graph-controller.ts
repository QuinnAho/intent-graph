// Owns the primary WebviewPanel. Singleton per workspace folder.
// `retainContextWhenHidden: true` only on this panel.
// Bridges webview messages to MCP tool calls and pushes notifications/* back.

export const INTENT_GRAPH_CONTROLLER_PLACEHOLDER = 'intent-graph-controller';
