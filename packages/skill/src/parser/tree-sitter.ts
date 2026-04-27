// Wrapper around the native tree-sitter library. Owns the parser instance
// pool and exposes parse() / parseIncremental() with a per-file CST cache.

export const PARSER_TREE_SITTER_PLACEHOLDER = 'parser-tree-sitter';
