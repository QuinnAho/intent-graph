// Seeded cases: each is a tiny workspace with a spec node carrying anchors, a
// before tree and an after tree. The glue builds a throwaway git repo per case in
// the OS temp folder and runs the real range pipeline on it. Scoring is pure.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DriftPairReport, DriftVerdict } from '@intentgraph/shared/schemas';

import { runDrift, type JudgeFn, type RunReport, type Tuning } from './run.js';
import { loadSpecNodes } from './spec-nodes.js';

export interface CaseSpec {
  readonly name: string;
  readonly expect: 'drift' | 'aligned';
  readonly about: string;
}

export interface CaseOutcome {
  readonly name: string;
  readonly expect: 'drift' | 'aligned';
  /** Worst verdict over the case's pairs (drift > unclear > aligned). `aligned` when no pair was made. */
  readonly verdict: DriftVerdict;
  readonly pairs: DriftPairReport[];
  readonly no_pair: boolean;
  readonly error: string | null;
}

export interface CaseScore {
  readonly breaking: number;
  readonly caught: number;
  /** Breaking cases judged aligned or unclear. */
  readonly missed: number;
  readonly harmless: number;
  readonly wronglyFlagged: number;
  readonly unclear: number;
  readonly errors: number;
}

const RANK: Record<DriftVerdict, number> = { aligned: 0, unclear: 1, drift: 2 };

export function worstVerdict(pairs: readonly DriftPairReport[]): DriftVerdict {
  let v: DriftVerdict = 'aligned';
  for (const p of pairs) if (RANK[p.verdict] > RANK[v]) v = p.verdict;
  return v;
}

export function scoreCases(outcomes: readonly CaseOutcome[]): CaseScore {
  const breaking = outcomes.filter((o) => o.expect === 'drift');
  const harmless = outcomes.filter((o) => o.expect === 'aligned');
  return {
    breaking: breaking.length,
    caught: breaking.filter((o) => o.verdict === 'drift').length,
    missed: breaking.filter((o) => o.verdict !== 'drift').length,
    harmless: harmless.length,
    wronglyFlagged: harmless.filter((o) => o.verdict === 'drift').length,
    unclear: outcomes.filter((o) => o.verdict === 'unclear').length,
    errors: outcomes.filter((o) => o.error !== null || o.pairs.some((p) => p.decided_by === 'error')).length,
  };
}

export function readCaseSpec(dir: string, name: string): CaseSpec {
  const raw = JSON.parse(readFileSync(join(dir, 'case.json'), 'utf8')) as Partial<CaseSpec>;
  if (raw.expect !== 'drift' && raw.expect !== 'aligned') throw new Error(`${name}/case.json: expect must be "drift" or "aligned"`);
  return { name, expect: raw.expect, about: typeof raw.about === 'string' ? raw.about : '' };
}

export function listCases(casesRoot: string): string[] {
  return readdirSync(casesRoot)
    .filter((n) => statSync(join(casesRoot, n)).isDirectory() && existsSync(join(casesRoot, n, 'case.json')))
    .sort();
}

function git(cwd: string, args: string[]): void {
  execFileSync('git', ['-c', 'user.name=drift', '-c', 'user.email=drift@localhost', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], {
    cwd,
    stdio: 'pipe',
    windowsHide: true,
  });
}

function clearTree(repo: string): void {
  for (const n of readdirSync(repo)) if (n !== '.git') rmSync(join(repo, n), { recursive: true, force: true });
}

/** Build a temp repo: commit 1 = spec + before, commit 2 = spec + after. Returns its path. */
export function materialiseCase(caseDir: string): string {
  const repo = mkdtempSync(join(tmpdir(), 'drift-case-'));
  git(repo, ['init', '-q']);
  const copySide = (side: string): void => {
    clearTree(repo);
    if (existsSync(join(caseDir, 'spec'))) cpSync(join(caseDir, 'spec'), join(repo, 'spec'), { recursive: true });
    if (existsSync(join(caseDir, side))) cpSync(join(caseDir, side), repo, { recursive: true });
  };
  copySide('before');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '--allow-empty', '-m', 'before']);
  copySide('after');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '--allow-empty', '-m', 'after']);
  return repo;
}

export interface CasesRun {
  readonly outcomes: CaseOutcome[];
  readonly score: CaseScore;
  readonly reports: Record<string, RunReport>;
}

export async function runCases(
  casesRoot: string,
  judge: JudgeFn,
  opts: { tuning?: Tuning; judgeAll?: boolean; log?: (l: string) => void } = {},
): Promise<CasesRun> {
  const log = opts.log ?? (() => undefined);
  const outcomes: CaseOutcome[] = [];
  const reports: Record<string, RunReport> = {};
  for (const name of listCases(casesRoot)) {
    const dir = join(casesRoot, name);
    let spec: CaseSpec;
    try {
      spec = readCaseSpec(dir, name);
    } catch (e) {
      outcomes.push({ name, expect: 'drift', verdict: 'unclear', pairs: [], no_pair: true, error: (e as Error).message });
      continue;
    }
    log(`case ${name} (expect ${spec.expect})`);
    let repo: string | null = null;
    try {
      repo = materialiseCase(dir);
      const loaded = loadSpecNodes(join(repo, 'spec'));
      if (loaded.errors.length) throw new Error(`spec errors: ${loaded.errors.map((e) => e.message).join('; ')}`);
      const report = await runDrift({
        root: repo,
        range: 'HEAD~1..HEAD',
        nodes: loaded.nodes,
        judge,
        log,
        ...(opts.tuning ? { tuning: opts.tuning } : {}),
        ...(opts.judgeAll ? { judgeAll: true } : {}),
      });
      reports[name] = report;
      outcomes.push({ name, expect: spec.expect, verdict: worstVerdict(report.pairs), pairs: report.pairs, no_pair: report.pairs.length === 0, error: null });
    } catch (e) {
      outcomes.push({ name, expect: spec.expect, verdict: 'unclear', pairs: [], no_pair: true, error: (e as Error).message });
    } finally {
      if (repo) rmSync(repo, { recursive: true, force: true });
    }
  }
  return { outcomes, score: scoreCases(outcomes), reports };
}
