// The Verifier interface. Two implementations: in-process (./builtin/*) and
// MCP plugin (./plugins/loader.ts). Capabilities advertised statically
// (canShrink, canExplain, isDeterministic) so the orchestrator can route
// obligations without round-tripping.

export const VERIFIER_INTERFACE_PLACEHOLDER = 'verifier-interface';
