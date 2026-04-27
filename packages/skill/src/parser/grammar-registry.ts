// Maps language IDs to tree-sitter grammars. Grammar versions are pinned —
// ERROR/MISSING nodes from version drift become first-class "unknown skeleton"
// nodes in the graph rather than failing.

export const PARSER_GRAMMAR_REGISTRY_PLACEHOLDER = 'parser-grammar-registry';
