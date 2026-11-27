// Entry for tools/infer.mjs. Parses args, plans the folders, runs them (or lists them for
// --dry-run) and returns the report and a one-line note. The only files it writes are the
// reply cache under <root>/.runs/infer/. It never writes under spec/.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import type { InferProposal } from '@intentgraph/shared/schemas';

import { callClaude } from '../drift/claude-cli.js';
import { loadSpecNodes } from '../drift/spec-nodes.js';
import { collectProjectSnapshot } from '../parser/fileWalker.js';
import { planFolders, type FolderPlan } from './folders.js';
import { readFolder, scrubPaths } from './gather.js';
import { INFER_JSON_SCHEMA, INFER_SYSTEM_PROMPT, type Declared } from './prompt.js';
import { cacheKey, runInfer, type InferCache, type InferCall } from './run.js';
import { INFER_TUNING, type InferTuning } from './tuning.js';

export interface InferArgs {
  readonly root: string;
  readonly paths: readonly string[] | null;
  readonly dryRun: boolean;
  readonly budgetUsd: number | null;
}

export type InferArgsParse = { ok: true; args: InferArgs } | { ok: false; error: string };

export const INFER_USAGE = 'usage: node tools/infer.mjs [--root <dir>] [--paths <folder>,<folder>] [--dry-run] [--budget <usd>]';

/** Pure: argv (after the script name) to options. */
export function parseInferArgs(argv: readonly string[], repoRoot: string): InferArgsParse {
  const flags = new Map<string, string>();
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] ?? '';
    if (a === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (!['--root', '--paths', '--budget'].includes(a)) return { ok: false, error: `unknown argument ${a}` };
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) return { ok: false, error: `${a} needs a value` };
    flags.set(a, v);
    i += 1;
  }
  const rootRaw = flags.get('--root') ?? repoRoot;
  const budgetRaw = flags.get('--budget');
  const budgetUsd = budgetRaw === undefined ? null : Number(budgetRaw);
  if (budgetUsd !== null && !(budgetUsd > 0)) return { ok: false, error: '--budget must be a positive number of dollars' };
  const pathsRaw = flags.get('--paths');
  const paths = pathsRaw === undefined ? null : pathsRaw.split(',').map((p) => p.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')).filter(Boolean);
  if (paths !== null && paths.length === 0) return { ok: false, error: '--paths needs at least one folder' };
  if (paths?.some((p) => p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.split('/').includes('..'))) return { ok: false, error: '--paths takes repo-relative folders' };
  return { ok: true, args: { root: isAbsolute(rootRaw) ? rootRaw : resolve(process.cwd(), rootRaw), paths, dryRun, budgetUsd } };
}

/** Keep the plans a --paths entry names, as the folder itself or a folder under it. */
export function filterPlans(plans: readonly FolderPlan[], paths: readonly string[] | null): FolderPlan[] {
  if (paths === null) return [...plans];
  return plans.filter((p) => paths.some((x) => p.folder === x || p.folder.startsWith(`${x}/`)));
}

const KIND_BY_DIR: Record<string, Declared['kind']> = { intents: 'intent', concepts: 'concept', constraints: 'constraint', decisions: 'decision' };

export function loadDeclared(root: string): { declared: Declared[]; nodes: ReturnType<typeof loadSpecNodes>['nodes']; warnings: string[] } {
  const loaded = loadSpecNodes(join(root, 'spec'));
  const declared: Declared[] = [];
  for (const n of loaded.nodes) {
    const kind = KIND_BY_DIR[n.file.replace(/\\/g, '/').split('/').slice(-2, -1)[0] ?? ''];
    if (kind) declared.push({ id: n.id, kind, title: n.title });
  }
  // the parser repeats the file's full path in its message, so any path in it is scrubbed and the short name kept
  const warnings = loaded.errors.map((e) => `${e.file.replace(/\\/g, '/').split('/').slice(-2).join('/')}: ${scrubPaths(e.message).replace(/^<path>:\s*/, '')}`);
  return { declared, nodes: loaded.nodes, warnings };
}

/** The cache file as a plain map, loaded once and saved after the run. */
export function fileCache(path: string): InferCache & { save(): void } {
  let entries: Record<string, InferProposal[]> = {};
  try {
    const j = JSON.parse(readFileSync(path, 'utf8')) as { entries?: Record<string, InferProposal[]> };
    if (j.entries && typeof j.entries === 'object') entries = j.entries;
  } catch {
    // no cache yet, or an unreadable one: start empty
  }
  return {
    get: (k) => entries[k],
    set: (k, v) => {
      entries[k] = v;
    },
    save: () => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ version: 1, entries }, null, 2));
    },
  };
}

export interface InferMainResult {
  readonly ok: boolean;
  readonly note: string;
  readonly report: unknown;
  readonly dryRun: boolean;
}

function realCall(tuning: InferTuning): InferCall {
  return (prompt) =>
    callClaude(prompt, {
      model: tuning.model,
      budgetUsd: tuning.perCallBudgetUsd,
      timeoutMs: tuning.callTimeoutMs,
      systemPrompt: INFER_SYSTEM_PROMPT,
      jsonSchema: INFER_JSON_SCHEMA,
    });
}

export async function inferMain(
  argv: readonly string[],
  repoRoot: string,
  log: (line: string) => void,
  callOverride?: InferCall,
): Promise<InferMainResult> {
  const parsed = parseInferArgs(argv, repoRoot);
  if (!parsed.ok) return { ok: false, note: `${parsed.error}. ${INFER_USAGE}`, report: null, dryRun: false };
  const a = parsed.args;
  const tuning: InferTuning = { ...(INFER_TUNING as InferTuning), ...(a.budgetUsd !== null ? { runBudgetUsd: a.budgetUsd } : {}) };

  const spec = loadDeclared(a.root);
  for (const w of spec.warnings) log(`  spec warning: ${w}`);
  const snapshot = collectProjectSnapshot(a.root);
  const plans = filterPlans(planFolders(snapshot.files, spec.nodes, tuning.sourceFolderPatterns), a.paths);
  if (plans.length === 0) {
    // a --paths that names nothing is a typo. an empty workspace is just done
    const none = a.paths !== null;
    return { ok: !none, note: none ? 'no source folder with unclaimed files matches --paths' : 'no source folder has unclaimed files, nothing to infer', report: null, dryRun: a.dryRun };
  }

  const cachePath = join(a.root, '.runs', 'infer', 'cache.json');
  const cache = fileCache(cachePath);

  if (a.dryRun) {
    const rows = plans.map((p) => {
      let cached = false;
      try {
        cached = cache.get(cacheKey(p.folder, readFolder(a.root, p.folder, p.unclaimed, tuning).codeHash, spec.declared, tuning)) !== undefined;
      } catch {
        // unreadable folder: counts as a call, the real run reports the error
      }
      return { folder: p.folder, unclaimed_files: p.unclaimed.length, claimed_files: p.claimed.length, cached };
    });
    for (const r of rows) log(`  ${r.cached ? 'cached' : 'call  '} ${r.folder} (${r.unclaimed_files} files${r.claimed_files > 0 ? `, ${r.claimed_files} already claimed` : ''})`);
    const calls = rows.filter((r) => !r.cached).length;
    const claimed = rows.reduce((n, r) => n + r.claimed_files, 0);
    return {
      ok: true,
      dryRun: true,
      note: `dry run, ${rows.length} folders, ${claimed} files already claimed, ${calls} model calls, ${rows.length - calls} cached`,
      report: { mode: 'dry-run', folders: rows, calls },
    };
  }

  const report = await runInfer({ root: a.root, plans, declared: spec.declared, call: callOverride ?? realCall(tuning), cache, tuning, log });
  cache.save();
  const t = report.totals;
  const note = `${t.proposals} proposals from ${t.folders} folders, ${t.calls} calls, ${t.cached} cached, ${t.errors} errors, ${t.dropped_anchors} anchors dropped, ${t.dropped_proposals} proposals dropped, $${t.cost_usd.toFixed(4)}${report.incomplete ? `, INCOMPLETE: ${report.stopped}` : ''}`;
  return {
    ok: t.errors === 0 && !report.incomplete,
    dryRun: false,
    note,
    report: { mode: 'run', args: { paths: a.paths, budget_usd: tuning.runBudgetUsd }, tuning: { model: tuning.model, prompt_version: tuning.promptVersion }, spec_warnings: spec.warnings, ...report },
  };
}
