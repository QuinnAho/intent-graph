// Lifted from claudemap/scripts/package-claudemap-skill.js @ claudemap@vendored.
// Adapted: TS strict, retargeted at the IntentGraph monorepo layout. Drops
// every ClaudeMap-specific artifact branch (the React app bundling, runtime
// graph placeholders, slash-command rendering, scoped-map manifest) — the
// IntentGraph agent-skill ships SKILL.md + agents/ + bin/ pointing at the
// already-built @intentgraph/skill executable. The dual-flavor (claude vs
// codex) packaging shape is preserved.
// License: MIT (see /claudemap/LICENSE). See LIFT_LOG.md for the full lift record.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const AGENT_SKILL_ROOT = join(REPO_ROOT, 'packages', 'agent-skill');
const SKILL_BUILD_DIR = join(REPO_ROOT, 'packages', 'skill', 'dist');
const DEFAULT_OUTPUT_ROOT = join(REPO_ROOT, 'artifacts', 'agent-skill');

type Assistant = 'claude' | 'codex' | 'all';

interface PackagerOptions {
  outputRoot: string;
  assistant: Assistant;
}

function parseArgs(argv: string[]): PackagerOptions {
  const options: PackagerOptions = {
    outputRoot: DEFAULT_OUTPUT_ROOT,
    assistant: 'claude',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') {
      const next = argv[index + 1];
      if (!next) throw new Error('Missing value for --output');
      options.outputRoot = resolve(next);
      index += 1;
      continue;
    }
    if (arg === '--assistant') {
      const next = argv[index + 1];
      if (next !== 'claude' && next !== 'codex' && next !== 'all') {
        throw new Error(`Invalid --assistant value: ${next ?? ''}. Valid: claude, codex, all`);
      }
      options.assistant = next;
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg ?? ''}`);
  }
  return options;
}

function printUsage(): void {
  console.log('IntentGraph agent-skill packager');
  console.log('  pnpm tsx scripts/package-agent-skill.ts [--output <dir>] [--assistant claude|codex|all]');
}

function ensureSkillBuildExists(): void {
  const expected = join(SKILL_BUILD_DIR, 'index.js');
  if (!existsSync(expected)) {
    throw new Error(
      `Expected built skill artifact at ${expected}. Run \`pnpm --filter @intentgraph/skill build\` first.`,
    );
  }
}

function ensureCleanArtifactDir(outputRoot: string, name: string): string {
  const root = join(outputRoot, name);
  mkdirSync(outputRoot, { recursive: true });
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  return root;
}

function copyAgentSkillFiles(artifactRoot: string): void {
  for (const file of ['SKILL.md', 'README.md', 'package.json']) {
    const source = join(AGENT_SKILL_ROOT, file);
    if (!existsSync(source)) continue;
    cpSync(source, join(artifactRoot, file));
  }
  for (const dir of ['agents', 'bin']) {
    const source = join(AGENT_SKILL_ROOT, dir);
    if (!existsSync(source)) continue;
    cpSync(source, join(artifactRoot, dir), { recursive: true });
  }
  // Bundle the built skill so the entry script can resolve it without a
  // separate npm install.
  cpSync(SKILL_BUILD_DIR, join(artifactRoot, 'skill-dist'), { recursive: true });
}

function writeManifest(artifactRoot: string, assistant: 'claude' | 'codex'): void {
  const versionFromPkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    version?: string;
  };
  const manifest = {
    name: '@intentgraph/agent-skill',
    version: versionFromPkg.version ?? '0.0.0',
    assistant,
    generatedAt: new Date().toISOString(),
    entrypoints: {
      skill: 'SKILL.md',
      bin: 'bin/intentgraph-skill.js',
    },
    notes:
      assistant === 'codex'
        ? [
            'Drop into .codex/skills/intentgraph/ for Codex CLI.',
            'agents/openai.yaml is the Codex-side mirror of SKILL.md frontmatter.',
          ]
        : [
            'Drop into .claude/skills/intentgraph/ for Claude Code.',
            'SKILL.md is the canonical manifest; agents/openai.yaml is unused by Claude Code.',
          ],
  };
  writeFileSync(join(artifactRoot, 'agent-skill-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function buildOne(outputRoot: string, assistant: 'claude' | 'codex'): string {
  const dirName = assistant === 'codex' ? 'intentgraph-codex' : 'intentgraph';
  const artifactRoot = ensureCleanArtifactDir(outputRoot, dirName);
  copyAgentSkillFiles(artifactRoot);
  writeManifest(artifactRoot, assistant);
  return artifactRoot;
}

export async function buildAgentSkillArtifact(options: PackagerOptions): Promise<{ artifacts: string[] }> {
  ensureSkillBuildExists();
  const built: string[] = [];
  if (options.assistant === 'all') {
    built.push(buildOne(options.outputRoot, 'claude'));
    built.push(buildOne(options.outputRoot, 'codex'));
  } else {
    built.push(buildOne(options.outputRoot, options.assistant));
  }
  return { artifacts: built };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await buildAgentSkillArtifact(options);
  for (const artifact of result.artifacts) {
    console.log(`agent-skill artifact ready at ${artifact}`);
  }
}

const isDirectInvocation = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(entry) === resolve(fileURLToPath(import.meta.url));
})();

if (isDirectInvocation) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`agent-skill packaging failed: ${message}`);
    process.exitCode = 1;
  });
}
