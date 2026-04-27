// Lifted from claudemap/scripts/install-claudemap.js @ claudemap@vendored.
// Adapted: TS strict, retargeted at IntentGraph's `.claude/skills/intentgraph/`
// and `.codex/skills/intentgraph/` layout. The ClaudeMap installer also wrote
// slash-command files and ran an `npm install` inside the installed skill;
// IntentGraph does neither — the skill is a self-contained tsup bundle, and the
// slash commands are project-defined under `.claude/commands/` and not part of
// the published agent-skill.
// License: MIT (see /claudemap/LICENSE). See LIFT_LOG.md for the full lift record.

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAgentSkillArtifact } from './package-agent-skill.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

interface InstallOptions {
  /** Directory the installed skill should land in (a workspace root). */
  targetRoot: string;
  /** `claude` → `.claude/skills/intentgraph/`. `codex` → `.codex/skills/intentgraph/`. */
  assistant: 'claude' | 'codex';
  /** Print actions but do not write. */
  dryRun?: boolean;
  /** If false, expects the artifact already to exist at artifactsRoot. */
  buildArtifact?: boolean;
  /** Defaults to `<repo>/artifacts/agent-skill`. */
  artifactsRoot?: string;
}

function destForAssistant(targetRoot: string, assistant: 'claude' | 'codex'): string {
  if (assistant === 'codex') {
    return join(targetRoot, '.codex', 'skills', 'intentgraph');
  }
  return join(targetRoot, '.claude', 'skills', 'intentgraph');
}

function artifactDirForAssistant(artifactsRoot: string, assistant: 'claude' | 'codex'): string {
  return join(artifactsRoot, assistant === 'codex' ? 'intentgraph-codex' : 'intentgraph');
}

export async function installAgentSkill(options: InstallOptions): Promise<{ installedTo: string }> {
  const artifactsRoot = options.artifactsRoot ?? join(REPO_ROOT, 'artifacts', 'agent-skill');
  if (options.buildArtifact !== false) {
    await buildAgentSkillArtifact({ outputRoot: artifactsRoot, assistant: options.assistant });
  }
  const source = artifactDirForAssistant(artifactsRoot, options.assistant);
  if (!existsSync(source)) {
    throw new Error(`Artifact missing at ${source}; run packager first.`);
  }
  const dest = destForAssistant(options.targetRoot, options.assistant);
  if (options.dryRun) {
    console.log(`[dry-run] would install ${source} → ${dest}`);
    return { installedTo: dest };
  }
  mkdirSync(dirname(dest), { recursive: true });
  rmSync(dest, { recursive: true, force: true });
  cpSync(source, dest, { recursive: true });
  return { installedTo: dest };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const targetRoot = argv[0];
  if (!targetRoot) {
    console.error('Usage: pnpm tsx scripts/install-agent-skill.ts <targetRoot> [--assistant claude|codex] [--dry-run]');
    process.exit(1);
  }
  let assistant: 'claude' | 'codex' = 'claude';
  let dryRun = false;
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--assistant') {
      const next = argv[index + 1];
      if (next !== 'claude' && next !== 'codex') {
        throw new Error(`Invalid --assistant value: ${next ?? ''}.`);
      }
      assistant = next;
      index += 1;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg ?? ''}`);
  }
  const result = await installAgentSkill({ targetRoot: resolve(targetRoot), assistant, dryRun });
  console.log(`installed to ${result.installedTo}`);
}

const isDirectInvocation = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(entry) === resolve(fileURLToPath(import.meta.url));
})();

if (isDirectInvocation) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`agent-skill install failed: ${message}`);
    process.exitCode = 1;
  });
}
