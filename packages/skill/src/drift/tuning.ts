// Design numbers for the drift check prototype. Change them here, not in code.

export const DRIFT_TUNING = {
  /** Model alias passed to `claude --model`. A cheap model that did not write the change. */
  judgeModel: 'haiku',
  /** Hard cap per judge call, passed as `--max-budget-usd`. */
  perCallBudgetUsd: 0.05,
  /** Stop judging once a run's total cost passes this. Remaining pairs are marked `budget`. */
  runBudgetUsd: 3,
  /** Kill a judge call that runs longer than this. */
  callTimeoutMs: 120_000,
  /** Diff text shown to the judge per pair. Longer diffs are cut at a hunk or line and marked. */
  maxDiffChars: 12_000,
  /** Node text shown to the judge. */
  maxNodeChars: 4_000,
  /** Files per commit whose symbols are listed. Past this the file is listed without symbols. */
  maxFilesForSymbols: 200,
  /** Source files larger than this are not parsed. Their pairs come back unclear with the reason. */
  maxParseBytes: 2_000_000,
  /** Diff context lines asked of git. */
  diffContextLines: 3,
} as const;
