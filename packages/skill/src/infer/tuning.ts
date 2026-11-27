// Design numbers for the inferred-intent script. Change them here, not in code.

export const INFER_TUNING = {
  /** Model alias passed to `claude --model`. The same cheap model the drift check uses. */
  model: 'haiku',
  /** Hard cap per call, passed as `--max-budget-usd`. */
  perCallBudgetUsd: 0.05,
  /** Stop calling once a run's total cost reaches this. `--budget` overrides it. */
  runBudgetUsd: 0.25,
  /** Kill a call that runs longer than this. */
  callTimeoutMs: 120_000,
  /** Everything sent for one folder, notes included. */
  maxPromptChars: 12_000,
  /** Leading comment kept per file. */
  maxCommentChars: 400,
  /** One symbol signature line. */
  maxSignatureChars: 160,
  /** Symbols listed per file. The rest are counted. */
  maxSymbolsPerFile: 40,
  /** Files over this are not parsed, only named. */
  maxParseBytes: 2_000_000,
  /** Declared intent or concept title kept in the prompt. */
  maxDeclaredTitleChars: 140,
  /** Proposal limits, the same numbers the schema in packages/shared enforces. */
  maxTitleChars: 90,
  maxBodyChars: 400,
  minAnchors: 2,
  maxAnchors: 8,
  maxProposals: 3,
  /** Bump when the prompt or the schema changes, so old cache entries stop matching. */
  promptVersion: 'p3',
  /**
   * A folder is a source folder when its repo-relative path matches one of these.
   * The first is a package's src subfolders (the src root holds entry files only).
   * The second is a plain workspace with a top-level src.
   */
  sourceFolderPatterns: ['^packages/[^/]+/src/.+', '^src(/.+)?$'],
} as const;

export type InferTuning = { -readonly [K in keyof typeof INFER_TUNING]: (typeof INFER_TUNING)[K] extends number ? number : (typeof INFER_TUNING)[K] extends readonly string[] ? readonly string[] : string };
