// Loads tier-2 MCP-pluggable verifiers (Verus, Dafny, dmypy, pyright LSP, ...).
// Plugins announce themselves over MCP — never gRPC.

export const VERIFIER_PLUGIN_LOADER_PLACEHOLDER = 'verifier-plugin-loader';
