// The 4-tier semantic diff ladder:
//   tier 0 — signature hash (same → no change)
//   tier 1 — body normalized hash (whitespace/comment-stripped)
//   tier 2 — GumTree edit script via mergiraf
//   tier 3 — optional LLM behavior classifier (gated, off by default)
// Hyperparameters fixed per language. Never auto-tune in the inner loop.

export const PARSER_DIFF_LADDER_PLACEHOLDER = 'parser-diff-ladder';
