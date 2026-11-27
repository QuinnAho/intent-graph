// design numbers for the spec writer. change them here, not in code.
export const SPEC_WRITE_TUNING = {
  // longest slug a new intent file name gets, cut at a word break
  slugMaxLength: 60,
  // longest title the writer accepts
  titleMaxLength: 200,
  // kind a new intent targets when the request names none, and the one the form preselects
  defaultTargetKinds: ['code_module'],
  // a rename over a file held open for a moment (windows) is tried again this many times
  renameRetries: 20,
  // wait between those tries, ms. 20 tries x 25 ms gives up after half a second.
  renameRetryMs: 25,
} as const;
