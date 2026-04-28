// Validates IntentGraph's agent configuration so CI fails fast when a
// CLAUDE.md / AGENTS.md / .claude/ / .codex/ / /spec/ / /docs/adr/ change drifts
// from the expected shape. Dependency-free on purpose — runs under `pnpm tsx`
// and uses only Node built-ins.
//
// Checks:
//   1. Every Markdown link in the repo's load-bearing prose docs resolves to
//      an existing file (anchors not validated). Scanned files: CLAUDE.md,
//      AGENTS.md, STRUCTURE.md, docs/architecture.md, automation/README.md,
//      LIFT_LOG.md, and every file under docs/adr/. Adding a new file to this
//      list catches case-sensitivity hazards that Linux CI would otherwise
//      surface only on the first contributor pull.
//   2. Every SKILL.md under .claude/skills/ and .codex/skills/ has a YAML
//      frontmatter block with `name` and `description` fields.
//   3. Every subagent file under .claude/agents/ and .codex/subagents/ has
//      YAML frontmatter with `name` and `description`.
//   4. Every command file under .claude/commands/ and .codex/commands/ has
//      YAML frontmatter with `description`.
//   5. .claude/settings.json parses as JSON; allowlist and denylist do not
//      contradict each other (no entry appears in both, ignoring whitespace).
//   6. .codex/config.toml exists and contains an [mcp.*] table per server in
//      .claude/settings.json mcpServers (light coherence check, not full TOML
//      parsing — we just look for the section header).
//   7. Every spec file under /spec/intents/, /spec/constraints/,
//      /spec/decisions/, /spec/concepts/ that is not a README has YAML
//      frontmatter with the required fields (id, title, parent, confidence).
//      The concepts/ directory is the Daniel Jackson-style boundary kind
//      (tech-spec §3.5, §4.1) added in p2-t04; the parser at
//      packages/skill/src/parser/spec-md/ treats it as a first-class kind,
//      so the validator must too.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import TOML from '@iarna/toml';

type Issue = { file: string; message: string };
const issues: Issue[] = [];
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

function fail(file: string, message: string) {
  issues.push({ file: relative(repoRoot, file), message });
}

function readText(file: string): string {
  return readFileSync(file, 'utf8');
}

function listFiles(dir: string, predicate: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(p, predicate));
    } else if (predicate(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

function extractFrontmatter(text: string): Record<string, string> | null {
  // Normalize mixed CRLF/LF before matching so files saved through editors
  // that flip line endings (Windows ↔ Linux) parse identically.
  const normalized = text.replace(/\r\n/g, '\n');
  const m = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!m || !m[1]) return null;
  const out: Record<string, string> = {};
  for (const rawLine of m[1].split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// Pure: returns the list of broken relative-link targets in `file`. Exposed
// so tests can exercise the scan against a temp fixture without spawning the
// CLI. Anchors and absolute (http/mailto/#) links are skipped.
export function findBrokenMarkdownLinks(file: string): string[] {
  const text = readText(file);
  const dir = dirname(file);
  const linkRe = /\[[^\]]*\]\((?!https?:|mailto:|#)([^)]+)\)/g;
  const broken: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(text)) !== null) {
    const captured = match[1];
    if (!captured) continue;
    const target = captured.split('#')[0];
    if (!target) continue;
    const resolved = resolve(dir, target);
    if (!existsSync(resolved)) {
      broken.push(captured);
    }
  }
  return broken;
}

function checkMarkdownLinks(file: string) {
  for (const target of findBrokenMarkdownLinks(file)) {
    fail(file, `broken link: ${target}`);
  }
}

function checkSkillFrontmatter(skillFile: string) {
  const fm = extractFrontmatter(readText(skillFile));
  if (!fm) return fail(skillFile, 'missing YAML frontmatter');
  for (const key of ['name', 'description']) {
    if (!fm[key]) fail(skillFile, `frontmatter missing required field: ${key}`);
  }
}

function checkSubagentFrontmatter(file: string) {
  const fm = extractFrontmatter(readText(file));
  if (!fm) return fail(file, 'missing YAML frontmatter');
  for (const key of ['name', 'description']) {
    if (!fm[key]) fail(file, `frontmatter missing required field: ${key}`);
  }
}

function checkCommandFrontmatter(file: string) {
  const fm = extractFrontmatter(readText(file));
  if (!fm) return fail(file, 'missing YAML frontmatter');
  if (!fm.description) fail(file, 'frontmatter missing required field: description');
}

function checkSpecFrontmatter(file: string) {
  const fm = extractFrontmatter(readText(file));
  if (!fm) return fail(file, 'missing YAML frontmatter');
  for (const key of ['id', 'title', 'parent', 'confidence']) {
    if (!(key in fm)) fail(file, `frontmatter missing required field: ${key}`);
  }
  const allowed = new Set(['extracted', 'inferred', 'semantic', 'asserted']);
  if (fm.confidence && !allowed.has(fm.confidence)) {
    fail(file, `confidence must be one of ${[...allowed].join('|')}; got ${fm.confidence}`);
  }
}

function checkClaudeSettings() {
  const file = join(repoRoot, '.claude', 'settings.json');
  if (!existsSync(file)) return fail(file, '.claude/settings.json missing');
  let parsed: unknown;
  try {
    parsed = JSON.parse(readText(file));
  } catch (e) {
    return fail(file, `not valid JSON: ${(e as Error).message}`);
  }
  const settings = parsed as { permissions?: { allow?: string[]; deny?: string[] } };
  const allow = settings.permissions?.allow ?? [];
  const deny = settings.permissions?.deny ?? [];
  const allowSet = new Set(allow.map((s) => s.trim()));
  for (const d of deny) {
    if (allowSet.has(d.trim())) {
      fail(file, `entry appears in both allow and deny: ${d}`);
    }
  }
}

function checkCodexConfigCoherence() {
  const codex = join(repoRoot, '.codex', 'config.toml');
  const claude = join(repoRoot, '.claude', 'settings.json');
  if (!existsSync(codex)) return fail(codex, '.codex/config.toml missing');
  if (!existsSync(claude)) return;

  let claudeJson: { mcpServers?: Record<string, unknown> } = {};
  try {
    claudeJson = JSON.parse(readText(claude));
  } catch {
    return; // already reported by checkClaudeSettings
  }

  // ADR-0006:32 used a substring match (`codexText.includes('[mcp.<name>]')`)
  // which incorrectly accepts a commented `# [mcp.foo]` line and would miss
  // the inline-table form. ADR-0010 supersedes that decision; we now parse
  // the TOML with @iarna/toml (zero transitive deps).
  let codexParsed: Record<string, unknown>;
  try {
    codexParsed = TOML.parse(readText(codex)) as Record<string, unknown>;
  } catch (e) {
    return fail(codex, `not valid TOML: ${(e as Error).message}`);
  }
  const mcpTable = (codexParsed.mcp ?? {}) as Record<string, unknown>;

  for (const name of Object.keys(claudeJson.mcpServers ?? {})) {
    if (!(name in mcpTable)) {
      fail(
        codex,
        `MCP server "${name}" registered in .claude/settings.json but missing from .codex/config.toml [mcp] table`,
      );
    }
  }
}

function main() {
  // Required prose docs at the repo root.
  for (const f of ['CLAUDE.md', 'AGENTS.md', 'STRUCTURE.md', 'LIFT_LOG.md']) {
    const p = join(repoRoot, f);
    if (existsSync(p)) checkMarkdownLinks(p);
    else fail(p, `${f} missing at repo root`);
  }

  // Other prose docs whose absence is also a defect.
  for (const rel of ['docs/architecture.md', 'automation/README.md']) {
    const p = join(repoRoot, rel);
    if (existsSync(p)) checkMarkdownLinks(p);
    else fail(p, `${rel} missing`);
  }

  // Every ADR file. Sweeping the directory keeps coverage current as new ADRs
  // land — no need to update this script per ADR.
  const adrDir = join(repoRoot, 'docs', 'adr');
  if (existsSync(adrDir)) {
    for (const f of listFiles(adrDir, (n) => n.endsWith('.md'))) {
      checkMarkdownLinks(f);
    }
  }

  for (const skillsDir of ['.claude/skills', '.codex/skills']) {
    const dir = join(repoRoot, skillsDir);
    if (!existsSync(dir)) {
      fail(dir, `${skillsDir}/ missing`);
      continue;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skill = join(dir, entry.name, 'SKILL.md');
      if (!existsSync(skill)) {
        fail(skill, `SKILL.md missing in ${skillsDir}/${entry.name}/`);
        continue;
      }
      checkSkillFrontmatter(skill);
    }
  }

  for (const subagentDir of ['.claude/agents', '.codex/subagents']) {
    const dir = join(repoRoot, subagentDir);
    if (!existsSync(dir)) {
      fail(dir, `${subagentDir}/ missing`);
      continue;
    }
    for (const f of listFiles(dir, (n) => n.endsWith('.md'))) {
      checkSubagentFrontmatter(f);
    }
  }

  for (const commandDir of ['.claude/commands', '.codex/commands']) {
    const dir = join(repoRoot, commandDir);
    if (!existsSync(dir)) {
      fail(dir, `${commandDir}/ missing`);
      continue;
    }
    for (const f of listFiles(dir, (n) => n.endsWith('.md'))) {
      checkCommandFrontmatter(f);
    }
  }

  checkClaudeSettings();
  checkCodexConfigCoherence();

  for (const specDir of ['spec/intents', 'spec/constraints', 'spec/decisions', 'spec/concepts']) {
    const dir = join(repoRoot, specDir);
    if (!existsSync(dir)) continue;
    for (const f of listFiles(dir, (n) => n.endsWith('.md') && n.toLowerCase() !== 'readme.md')) {
      checkSpecFrontmatter(f);
    }
  }

  if (issues.length === 0) {
    console.log('check-agent-config: OK');
    return;
  }
  console.error(`check-agent-config: ${issues.length} issue(s):`);
  for (const issue of issues) {
    console.error(`  ${issue.file}: ${issue.message}`);
  }
  process.exit(1);
}

// Only run main() when invoked directly (`tsx scripts/check-agent-config.ts`).
// When the file is imported (e.g. by Vitest pulling in `findBrokenMarkdownLinks`)
// we skip the side-effects.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const stat = statSync(repoRoot);
    if (!stat.isDirectory()) throw new Error('repoRoot is not a directory');
  } catch (e) {
    console.error(
      `check-agent-config: cannot access repo root ${repoRoot}: ${(e as Error).message}`,
    );
    process.exit(2);
  }

  main();
}
