// Incremental parse cache. Extension owns live CSTs for open files; the skill
// owns project-wide CSTs for non-open files. This module is the skill's half.

export const PARSER_CACHE_PLACEHOLDER = 'parser-cache';
