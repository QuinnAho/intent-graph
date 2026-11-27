// Lifted from claudemap/scripts/smoke-test-package.js @ claudemap@vendored.
// Adapted: TS strict, retargeted at the IntentGraph agent-skill artifact.
// Asserts that the claude artifact has the expected structure
// without exercising the full ClaudeMap install/setup/refresh pipeline (those
// commands do not exist in IntentGraph).
// License: MIT (see /claudemap/LICENSE). See docs/04 - Workflow/Lift Log.md for the full lift record.

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAgentSkillArtifact } from './package-agent-skill.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SMOKE_OUTPUT = join(REPO_ROOT, 'artifacts', 'smoke', 'agent-skill');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function assertArtifactShape(root: string, expectedAssistant: 'claude'): void {
  for (const required of ['SKILL.md', 'package.json', 'bin/intentgraph-skill.js', 'skill-dist']) {
    assert(existsSync(join(root, required)), `${expectedAssistant}: missing ${required}`);
  }
  const manifest = readJson<{ assistant?: string }>(join(root, 'agent-skill-manifest.json'));
  assert(
    manifest.assistant === expectedAssistant,
    `${expectedAssistant}: manifest.assistant !== ${expectedAssistant} (got ${String(manifest.assistant)})`,
  );
}

async function main(): Promise<void> {
  rmSync(SMOKE_OUTPUT, { recursive: true, force: true });
  const result = await buildAgentSkillArtifact({ outputRoot: SMOKE_OUTPUT });
  assert(result.artifacts.length === 1, `expected 1 artifact, got ${result.artifacts.length}`);
  assertArtifactShape(join(SMOKE_OUTPUT, 'intentgraph'), 'claude');
  console.log('agent-skill smoke test passed.');
  console.log(` Claude artifact: ${join(SMOKE_OUTPUT, 'intentgraph')}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`agent-skill smoke test failed: ${message}`);
  process.exitCode = 1;
});
