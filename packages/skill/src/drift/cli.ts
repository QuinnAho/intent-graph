// Entry for tools/drift.mjs. Parses args, runs a range or the seeded cases,
// writes nothing itself: it returns the report and a one-line note.

import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { callClaude } from './claude-cli.js';
import { runCases } from './cases.js';
import { JUDGE_JSON_SCHEMA, JUDGE_SYSTEM_PROMPT } from './judge.js';
import { runDrift, type JudgeFn, type Tuning } from './run.js';
import { loadSpecNodes, type AnchorOverlay } from './spec-nodes.js';
import { DRIFT_TUNING } from './tuning.js';

export interface DriftArgs {
  readonly mode: 'range' | 'cases';
  readonly range: string | null;
  readonly root: string;
  readonly spec: string;
  readonly anchors: string | null;
  readonly cases: string;
  readonly last: number | null;
  readonly judgeAll: boolean;
  readonly runBudgetUsd: number | null;
}

export type ArgsParse = { ok: true; args: DriftArgs } | { ok: false; error: string };

export const DRIFT_USAGE =
  'usage: node tools/drift.mjs [--cases <dir>] | --range <a>..<b> [--root <dir>] [--spec <dir>] [--anchors <file>] [--last <n>] [--judge-all] [--budget <usd>]';

/** Pure: argv (after the script name) to options. No flags means the seeded cases. */
export function parseDriftArgs(argv: readonly string[], repoRoot: string): ArgsParse {
  const flags = new Map<string, string>();
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] ?? '';
    if (a === '--judge-all') {
      bools.add(a);
      continue;
    }
    if (!['--range', '--root', '--spec', '--anchors', '--cases', '--last', '--budget'].includes(a)) return { ok: false, error: `unknown argument ${a}` };
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) return { ok: false, error: `${a} needs a value` };
    flags.set(a, v);
    i += 1;
  }
  const abs = (p: string, base: string): string => (isAbsolute(p) ? p : resolve(base, p));
  const range = flags.get('--range') ?? null;
  // a leading dash would reach git as an option, and a triple dot means something else
  if (range !== null && (range.startsWith('-') || range.includes('...') || !/^\S+\.\.\S+$/.test(range))) return { ok: false, error: `--range must look like <a>..<b>, got ${range}` };
  if (range !== null && flags.has('--cases')) return { ok: false, error: '--range and --cases are separate modes' };
  const root = abs(flags.get('--root') ?? repoRoot, process.cwd());
  const lastRaw = flags.get('--last');
  const last = lastRaw === undefined ? null : Number(lastRaw);
  if (last !== null && (!Number.isInteger(last) || last < 1)) return { ok: false, error: '--last must be a positive whole number' };
  const budgetRaw = flags.get('--budget');
  const runBudgetUsd = budgetRaw === undefined ? null : Number(budgetRaw);
  if (runBudgetUsd !== null && !(runBudgetUsd > 0)) return { ok: false, error: '--budget must be a positive number of dollars' };
  return {
    ok: true,
    args: {
      mode: range === null ? 'cases' : 'range',
      range,
      root,
      spec: abs(flags.get('--spec') ?? join(root, 'spec'), process.cwd()),
      anchors: flags.has('--anchors') ? abs(flags.get('--anchors') ?? '', process.cwd()) : null,
      cases: abs(flags.get('--cases') ?? join(repoRoot, 'tests', 'fixtures', 'drift-cases'), process.cwd()),
      last,
      judgeAll: bools.has('--judge-all'),
      runBudgetUsd,
    },
  };
}

export interface DriftMainResult {
  readonly ok: boolean;
  readonly note: string;
  readonly report: unknown;
}

function realJudge(tuning: Tuning): JudgeFn {
  return (prompt) =>
    callClaude(prompt, {
      model: tuning.judgeModel,
      budgetUsd: tuning.perCallBudgetUsd,
      timeoutMs: tuning.callTimeoutMs,
      systemPrompt: JUDGE_SYSTEM_PROMPT,
      jsonSchema: JUDGE_JSON_SCHEMA,
    });
}

export async function driftMain(
  argv: readonly string[],
  repoRoot: string,
  log: (line: string) => void,
  judgeOverride?: JudgeFn,
): Promise<DriftMainResult> {
  const parsed = parseDriftArgs(argv, repoRoot);
  if (!parsed.ok) return { ok: false, note: `${parsed.error}. ${DRIFT_USAGE}`, report: null };
  const a = parsed.args;
  const tuning: Tuning = { ...DRIFT_TUNING, ...(a.runBudgetUsd !== null ? { runBudgetUsd: a.runBudgetUsd } : {}) };
  const judge = judgeOverride ?? realJudge(tuning);

  if (a.mode === 'cases') {
    const run = await runCases(a.cases, judge, { tuning, judgeAll: a.judgeAll, log });
    const s = run.score;
    const cost = Object.values(run.reports).reduce((n, r) => n + r.totals.cost_usd, 0);
    const judged = Object.values(run.reports).reduce((n, r) => n + r.totals.judged, 0);
    for (const o of run.outcomes) log(`${o.expect === 'drift' ? (o.verdict === 'drift' ? 'caught ' : 'MISSED ') : o.verdict === 'drift' ? 'FLAGGED' : 'ok     '} ${o.name}: expect ${o.expect}, got ${o.verdict}${o.no_pair ? ' (no pair)' : ''}${o.error ? ` - ${o.error}` : ''}`);
    const note = `caught ${s.caught} of ${s.breaking} breaking, missed ${s.missed}, wrongly flagged ${s.wronglyFlagged} of ${s.harmless} harmless, ${s.unclear} unclear, ${s.errors} errors, ${judged} judged pairs, $${cost.toFixed(4)}`;
    return {
      ok: s.breaking > 0 && s.missed === 0 && s.wronglyFlagged === 0 && s.errors === 0,
      note,
      report: { mode: 'cases', cases_root: a.cases, judge_all: a.judgeAll, tuning, score: s, cost_usd: cost, outcomes: run.outcomes, reports: run.reports },
    };
  }

  let overlay: AnchorOverlay | undefined;
  if (a.anchors) {
    try {
      overlay = JSON.parse(readFileSync(a.anchors, 'utf8')) as AnchorOverlay;
    } catch (e) {
      return { ok: false, note: `cannot read --anchors ${a.anchors}: ${(e as Error).message}`, report: null };
    }
  }
  const loaded = loadSpecNodes(a.spec, overlay);
  for (const e of loaded.errors) log(`  spec warning: ${e.file}: ${e.message}`);
  const report = await runDrift({
    root: a.root,
    range: a.range ?? '',
    nodes: loaded.nodes,
    judge,
    tuning,
    log,
    ...(a.last !== null ? { last: a.last } : {}),
    ...(a.judgeAll ? { judgeAll: true } : {}),
  });
  const t = report.totals;
  const unlinked = report.commits.reduce((n, c) => n + c.no_linked_intent.length, 0);
  const note = `${report.commits.length} commits, ${t.pairs} pairs (${t.judged} judged, ${t.by_hash} by hash), ${t.drift} drift, ${t.unclear} unclear, ${t.errors} errors, ${t.budget_skipped} over budget, ${unlinked} changed files with no linked intent, $${t.cost_usd.toFixed(4)}`;
  return {
    ok: t.drift === 0 && t.errors === 0 && t.budget_skipped === 0,
    note,
    report: { mode: 'range', spec_root: a.spec, anchors: a.anchors, spec_warnings: loaded.errors, tuning, ...report },
  };
}
