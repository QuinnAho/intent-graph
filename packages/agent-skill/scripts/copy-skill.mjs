// Build step for @intentgraph/agent-skill. Verifies that the upstream
// @intentgraph/skill build artifact exists, then leaves SKILL.md, agents/,
// and bin/ in place for npm publish. No bundling — the bin file is a thin
// dynamic-import shim and the skill itself ships as its own package.

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillDist = resolve(__dirname, '..', '..', 'skill', 'dist', 'index.js');

if (!existsSync(skillDist)) {
  console.error('[agent-skill] expected upstream build at', skillDist);
  console.error('[agent-skill] run `pnpm --filter @intentgraph/skill build` first');
  process.exit(1);
}

console.log('[agent-skill] ready to publish.');
