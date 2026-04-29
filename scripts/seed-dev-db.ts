// scripts/seed-dev-db.ts
//
// CLI wrapper around packages/skill/src/build-graph.ts. Bootstraps a fresh
// development SQLite database from /spec markdown plus the tree-sitter walk
// of the source tree, then writes the same graph as graph.json for the L0
// dogfood gate.
//
// Tech-spec §6 phase 2 line 442 wires this script into the L0 build:
//   "server/src/build-graph.ts: tree-sitter native walk of src/, parse
//    /spec/*.md, emit graph.json plus a SQLite seeded from it."
//
// L0 gate (tech-spec §6 phase 2 line 444): `pnpm build && open
// app/dist/index.html` shows IntentGraph's own intents and code modules.
// This script produces the seed data the app consumes.
//
// Usage:
//   pnpm tsx scripts/seed-dev-db.ts                   # default paths
//   pnpm tsx scripts/seed-dev-db.ts --repo <root>     # override repo root
//   pnpm tsx scripts/seed-dev-db.ts --db <path>       # override DB path
//   pnpm tsx scripts/seed-dev-db.ts --json <path>     # override graph.json path
//
// Defaults:
//   repo = current working directory
//   db   = <repo>/.intentgraph/dev.db
//   json = <repo>/.intentgraph/graph.json
//
// Idempotent: rerunning truncates the node/edge tables and re-seeds.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, toGraphJson, writeToDatabase } from '../packages/skill/src/build-graph.js';
import { initDatabase } from '../packages/skill/src/db/init.js';

interface CliArgs {
  readonly repoRoot: string;
  readonly dbPath: string;
  readonly jsonPath: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let repoRoot = process.cwd();
  let dbPath: string | null = null;
  let jsonPath: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--repo':
        repoRoot = resolve(argv[i + 1] ?? '.');
        i += 1;
        break;
      case '--db':
        dbPath = resolve(argv[i + 1] ?? '');
        i += 1;
        break;
      case '--json':
        jsonPath = resolve(argv[i + 1] ?? '');
        i += 1;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg && arg.startsWith('-')) {
          process.stderr.write(`unknown flag: ${arg}\n`);
          process.exit(64);
        }
    }
  }

  return {
    repoRoot,
    dbPath: dbPath ?? `${repoRoot}/.intentgraph/dev.db`,
    jsonPath: jsonPath ?? `${repoRoot}/.intentgraph/graph.json`,
  };
}

function printHelp(): void {
  process.stdout.write(`Usage: pnpm tsx scripts/seed-dev-db.ts [flags]

Flags:
  --repo <path>   Repository root (default: cwd).
  --db <path>     SQLite output path (default: <repo>/.intentgraph/dev.db).
  --json <path>   graph.json output path (default: <repo>/.intentgraph/graph.json).
  -h, --help      Show this help.
`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  process.stdout.write(`[seed-dev-db] repo: ${args.repoRoot}\n`);
  process.stdout.write(`[seed-dev-db] building static graph from /spec + tree-sitter walk...\n`);

  const result = build({ repoRoot: args.repoRoot });

  if (result.summary.errors.length > 0) {
    process.stderr.write(
      `[seed-dev-db] ERROR: ${result.summary.errors.length} spec parse error(s):\n`,
    );
    for (const err of result.summary.errors) {
      process.stderr.write(`  ${err.file}: ${err.message}\n`);
    }
    process.exit(1);
  }

  if (result.summary.warnings.length > 0) {
    process.stderr.write(
      `[seed-dev-db] ${result.summary.warnings.length} spec warning(s):\n`,
    );
    for (const warn of result.summary.warnings) {
      process.stderr.write(`  ${warn.file}: ${warn.message}\n`);
    }
  }

  process.stdout.write(
    `[seed-dev-db] graph: ${result.summary.nodes} nodes (${result.summary.specNodes} spec, ${result.summary.codeModules} modules, ${result.summary.codeSymbols} symbols), ${result.summary.edges} edges\n`,
  );
  if (result.summary.skeletonSymbols > 0) {
    // Tech-spec §7-J: ERROR / MISSING regions are first-class. Log the count
    // so a regression that suddenly emits hundreds of skeletons is visible.
    process.stdout.write(
      `[seed-dev-db]   of which ${result.summary.skeletonSymbols} unknown_skeleton symbol(s) from partial-parse regions\n`,
    );
  }

  // Ensure output dirs exist for both targets.
  mkdirSync(dirname(args.dbPath), { recursive: true });
  mkdirSync(dirname(args.jsonPath), { recursive: true });

  // Write graph.json first (cheaper and produces an artifact even if the DB
  // step fails for environment reasons — sqlite-vec absent, etc.).
  writeFileSync(args.jsonPath, toGraphJson(result), 'utf8');
  process.stdout.write(`[seed-dev-db] wrote graph.json → ${args.jsonPath}\n`);

  // Seed the SQLite database via the canonical init path.
  const dbInit = initDatabase(args.dbPath, {
    // Dev DB: the backup-before-migrate guard exists for production paths;
    // for a fresh dev seed there's nothing to back up. The init helper
    // tolerates skipBackup for greenfield bootstraps.
    skipBackup: true,
    // Phase 2 does not require sqlite-vec at runtime; tolerate a missing
    // extension. The seed populates `node` and `edge` only — vec tables
    // are populated in phase 5 when embeddings come online.
    skipVec: true,
  });

  try {
    writeToDatabase(dbInit.client, result);
    process.stdout.write(`[seed-dev-db] wrote SQLite seed → ${args.dbPath}\n`);
  } finally {
    dbInit.client.close();
  }

  process.stdout.write(`[seed-dev-db] done.\n`);
}

const isDirectInvocation =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectInvocation) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`[seed-dev-db] FATAL: ${(err as Error).message}\n`);
    if ((err as Error).stack) {
      process.stderr.write(`${(err as Error).stack}\n`);
    }
    process.exit(1);
  }
}
