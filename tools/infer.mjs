#!/usr/bin/env node
// inferred intent: a cheap model reads source folders no declared intent claims and proposes what each is for.
// usage: node tools/infer.mjs [--root <dir>] [--paths <folder>,<folder>] [--dry-run] [--budget <usd>]
// prints one line per folder, then PASS|FAIL infer (time) - note. exit 0 only on pass.
// report: <root>/.runs/infer/<timestamp>/report.json and <root>/.runs/infer/latest.json. never writes to /spec.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// root comes from this file, so any worktree runs its own copy
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rootFlag = process.argv.indexOf('--root');
const outRoot = rootFlag >= 0 && process.argv[rootFlag + 1] ? resolve(process.argv[rootFlag + 1]) : root;
const runDir = join(outRoot, '.runs', 'infer', stamp);
const t0 = Date.now();
const secs = () => Math.round((Date.now() - t0) / 100) / 10;

let result;
try {
  // the infer code is typescript in packages/skill, tsx (already a root dev dependency) loads it
  const { tsImport } = await import('tsx/esm/api');
  const cli = await tsImport(pathToFileURL(join(root, 'packages/skill/src/infer/cli.ts')).href, import.meta.url);
  result = await cli.inferMain(process.argv.slice(2), root, (line) => console.log(line));
} catch (e) {
  console.log(`FAIL infer (${secs()}s) - crashed: ${e?.stack?.split('\n').slice(0, 3).join(' | ') ?? e}`);
  process.exit(1);
}

const verdict = result.ok ? 'PASS' : 'FAIL';
// a dry run writes nothing, so it cannot cover the report of a real run
if (result.dryRun || result.report === null) {
  console.log(`${verdict} infer (${secs()}s) - ${result.note}`);
  process.exit(result.ok ? 0 : 1);
}
mkdirSync(runDir, { recursive: true });
const reportPath = join(runDir, 'report.json');
// latest.json and the PASS line name the report relative to the root, so no local path leaks
const reportRel = `.runs/infer/${stamp}/report.json`;
writeFileSync(reportPath, JSON.stringify({ result: verdict, seconds: secs(), note: result.note, report: result.report }, null, 2));
writeFileSync(join(outRoot, '.runs', 'infer', 'latest.json'), JSON.stringify({ result: verdict, seconds: secs(), note: result.note, report: reportRel }, null, 2));
console.log(`${verdict} infer (${secs()}s) - ${result.note}. report ${reportRel}`);
process.exit(result.ok ? 0 : 1);
