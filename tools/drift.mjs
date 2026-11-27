#!/usr/bin/env node
// drift check prototype. usage: node tools/drift.mjs [--cases <dir>] | --range <a>..<b> --root <dir> [...]
// no flags runs the seeded cases in tests/fixtures/drift-cases.
// prints one line per pair, then PASS|FAIL drift (time) - note. exit 0 only on pass.
// report: .runs/drift/<timestamp>/report.json. never writes to the repo or /spec.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// root comes from this file, so any worktree runs its own copy
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = join(root, '.runs', 'drift', stamp);
const t0 = Date.now();
const secs = () => Math.round((Date.now() - t0) / 100) / 10;

let result;
try {
  // the drift code is typescript in packages/skill, tsx (already a root dev dependency) loads it
  const { tsImport } = await import('tsx/esm/api');
  const cli = await tsImport(pathToFileURL(join(root, 'packages/skill/src/drift/cli.ts')).href, import.meta.url);
  result = await cli.driftMain(process.argv.slice(2), root, (line) => console.log(line));
} catch (e) {
  console.log(`FAIL drift (${secs()}s) - crashed: ${e?.stack?.split('\n').slice(0, 3).join(' | ') ?? e}`);
  process.exit(1);
}

mkdirSync(runDir, { recursive: true });
const reportPath = join(runDir, 'report.json');
writeFileSync(reportPath, JSON.stringify({ result: result.ok ? 'PASS' : 'FAIL', seconds: secs(), note: result.note, args: process.argv.slice(2), report: result.report }, null, 2));
writeFileSync(join(root, '.runs', 'drift', 'latest.json'), JSON.stringify({ result: result.ok ? 'PASS' : 'FAIL', seconds: secs(), note: result.note, report: reportPath }, null, 2));
console.log(`${result.ok ? 'PASS' : 'FAIL'} drift (${secs()}s) - ${result.note}. report ${reportPath}`);
process.exit(result.ok ? 0 : 1);
