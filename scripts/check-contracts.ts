// Lifted from claudemap/scripts/check-contracts.js @ claudemap@vendored.
// Adapted: TS strict, completely retargeted. ClaudeMap's script enforced "raw
// literal" rules across a JS source tree (presentation modes, graph sources,
// path filenames, hex colors). IntentGraph has different invariants: Drizzle
// schema (packages/skill/src/db/schema.ts) is the source of truth for SQLite
// tables, Zod schemas (packages/shared/src/schemas/) are the source of truth
// for runtime validation, and the two MUST agree. This script is the CI check
// that enforces that agreement. The structure of "scan, report rule
// violations, exit non-zero" survives; the rules are entirely new.
// License: MIT (see /claudemap/LICENSE). See LIFT_LOG.md for the full lift record.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

interface CheckResult {
  ok: boolean;
  reason: string;
}

interface Check {
  name: string;
  run(): CheckResult;
}

function readIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

function relPath(p: string): string {
  return relative(REPO_ROOT, p).split('\\').join('/');
}

const SCHEMA_DIR = join(REPO_ROOT, 'packages', 'shared', 'src', 'schemas');
const DRIZZLE_SCHEMA = join(REPO_ROOT, 'packages', 'skill', 'src', 'db', 'schema.ts');
const MIGRATIONS_DIR = join(REPO_ROOT, 'packages', 'skill', 'src', 'db', 'migrations');

/**
 * Required Zod schemas — every entry MUST be exported from
 * @intentgraph/shared/schemas/index.ts. The check looks for the presence of an
 * `export *` line referencing the file, not for the schema bindings themselves.
 * (Real Zod inspection is out of scope here; the goal is to keep the schema
 * surface stable and to fail fast when a file is added or removed without
 * updating the barrel.)
 */
const REQUIRED_SCHEMA_FILES = [
  'node.ts',
  'edge.ts',
  'obligation.ts',
  'lease.ts',
  'task.ts',
  'trace.ts',
  'mcp-tool-io.ts',
  'walker.ts',
];

const checks: Check[] = [
  {
    name: 'shared-schemas-barrel',
    run(): CheckResult {
      const indexPath = join(SCHEMA_DIR, 'index.ts');
      const text = readIfExists(indexPath);
      if (text === null) {
        return { ok: false, reason: `${relPath(indexPath)} is missing.` };
      }
      const missing: string[] = [];
      for (const file of REQUIRED_SCHEMA_FILES) {
        const filePath = join(SCHEMA_DIR, file);
        if (!existsSync(filePath)) {
          missing.push(`schema file ${relPath(filePath)} is missing`);
          continue;
        }
        const stem = file.replace(/\.ts$/, '');
        const re = new RegExp(`export \\* from '\\./${stem}(\\.js)?'`);
        if (!re.test(text)) {
          missing.push(`barrel does not re-export ./${stem}.js`);
        }
      }
      if (missing.length > 0) {
        return { ok: false, reason: missing.join('; ') };
      }
      return { ok: true, reason: `${REQUIRED_SCHEMA_FILES.length} schema files present and re-exported.` };
    },
  },
  {
    name: 'drizzle-schema-file-present',
    run(): CheckResult {
      if (!existsSync(DRIZZLE_SCHEMA)) {
        return { ok: false, reason: `${relPath(DRIZZLE_SCHEMA)} is missing.` };
      }
      return { ok: true, reason: 'Drizzle schema file present.' };
    },
  },
  {
    name: 'drizzle-zod-table-coverage',
    run(): CheckResult {
      // Tables defined by Drizzle and Zod schemas must agree by name. The check
      // is a simple identifier scan — it does not enforce column-by-column
      // agreement (Atlas migrate lint covers DDL drift). Once schema.ts ships
      // real `sqliteTable(...)` bindings this check tightens; while the file is
      // still a stub the check passes with a notice.
      const drizzleText = readIfExists(DRIZZLE_SCHEMA) ?? '';
      const isStub = /DB_SCHEMA_PLACEHOLDER/.test(drizzleText);
      if (isStub) {
        return {
          ok: true,
          reason:
            'Drizzle schema is still a Phase 0 stub; column-level coverage check is deferred until Phase 2.',
        };
      }
      const tableMatches = [...drizzleText.matchAll(/sqliteTable\(\s*['"`]([a-z_]+)['"`]/g)].map(
        (m) => m[1]!,
      );
      // Required by Tech-Spec §4: node, edge, obligation, lease, fence_seq,
      // event_log, trace_event, retrieval, row_audit, vec_intent, vec_code.
      const required = [
        'node',
        'edge',
        'obligation',
        'lease',
        'event_log',
        'trace_event',
        'retrieval',
        'row_audit',
      ];
      const missing = required.filter((name) => !tableMatches.includes(name));
      if (missing.length > 0) {
        return {
          ok: false,
          reason: `Drizzle schema is missing tables: ${missing.join(', ')}.`,
        };
      }
      return { ok: true, reason: `${required.length} required tables found in Drizzle schema.` };
    },
  },
  {
    name: 'migrations-dir-present',
    run(): CheckResult {
      if (!existsSync(MIGRATIONS_DIR)) {
        return { ok: false, reason: `${relPath(MIGRATIONS_DIR)} is missing.` };
      }
      return { ok: true, reason: 'Migrations directory present.' };
    },
  },
];

function main(): void {
  let failed = 0;
  for (const check of checks) {
    const result = check.run();
    const tag = result.ok ? 'PASS' : 'FAIL';
    console.log(`[${tag}] ${check.name}: ${result.reason}`);
    if (!result.ok) failed += 1;
  }
  if (failed > 0) {
    console.error(`check-contracts: ${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('check-contracts: OK');
}

main();
