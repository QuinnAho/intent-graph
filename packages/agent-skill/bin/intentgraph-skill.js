#!/usr/bin/env node
// Entry script. Delegates to the bundled @intentgraph/skill executable.
// Both Claude Code and Codex spawn this file directly via the bin entry.

import('@intentgraph/skill').catch((err) => {
  console.error('[intentgraph] failed to start skill:', err);
  process.exit(1);
});
