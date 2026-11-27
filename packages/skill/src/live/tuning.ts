// design numbers for the live server. change them here, not in code.
export const LIVE_TUNING = {
  // a lone save rebuilds after this quiet window
  quietMs: 300,
  // a burst (git checkout, format on save across files) waits for this window instead
  burstMs: 2000,
  // more pending files than this counts as a burst
  burstFiles: 5,
  // a test run that takes longer than this is killed and its nodes stay pending
  testTimeoutMs: 60_000,
  // sse comment line so proxies and the browser keep the stream open
  keepAliveMs: 15_000,
  // browser reconnect delay sent in the sse retry field
  retryMs: 1000,
  // how often the server looks for a new drift report. it only stats and reads files.
  driftPollMs: 400,
  // how often the server looks for a new inference report or settled list. it only stats and reads files.
  inferPollMs: 400,
  // largest json body a save or create may send
  maxRequestBytes: 256 * 1024,
  // writes (save, create, parent) the server remembers so undo can take them back
  undoDepth: 20,
} as const;

export type LiveTuning = { readonly [K in keyof typeof LIVE_TUNING]: number };
