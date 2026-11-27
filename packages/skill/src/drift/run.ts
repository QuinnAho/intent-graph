// Glue: run the drift check over a commit range. Gathers git changes, links them
// to spec nodes, settles each (commit, node) pair by hash or by the judge, and
// returns the report. Never writes to the repo or the spec tree.

import { extname } from 'node:path';

import type { DriftPairReport } from '@intentgraph/shared/schemas';

import { dispatchGrammarForExtension } from '../parser/grammar-registry.js';
import type { ClaudeCallResult } from './claude-cli.js';
import { listCommits, readCommitChanges } from './git.js';
import { budgetHunks, buildJudgePrompt, evidenceInDiff, parseJudgeReply } from './judge.js';
import { linkChanges, type FileLink, type LinkedPair, type SpecNode } from './link.js';
import { DRIFT_TUNING } from './tuning.js';

export type Tuning = { -readonly [K in keyof typeof DRIFT_TUNING]: (typeof DRIFT_TUNING)[K] extends number ? number : string };

export type JudgeFn = (prompt: string, nodeId: string) => Promise<ClaudeCallResult>;

export interface RunOptions {
  readonly root: string;
  readonly range: string;
  readonly nodes: readonly SpecNode[];
  readonly judge: JudgeFn;
  readonly tuning?: Tuning;
  /** Keep only the last N commits in the range that touch an anchored path. */
  readonly last?: number;
  /** Send pairs to the judge even when the normalised hash did not move. */
  readonly judgeAll?: boolean;
  readonly log?: (line: string) => void;
}

export interface CommitReport {
  readonly commit: string;
  readonly subject: string;
  readonly files: FileLink[];
  readonly no_linked_intent: string[];
  readonly model_calls: number;
}

export interface RunTotals {
  pairs: number;
  judged: number;
  by_hash: number;
  drift: number;
  aligned: number;
  unclear: number;
  errors: number;
  budget_skipped: number;
  cost_usd: number;
  judge_seconds: number;
}

export interface RunReport {
  readonly range: string;
  readonly root: string;
  readonly commits: CommitReport[];
  readonly pairs: DriftPairReport[];
  readonly totals: RunTotals;
}

function isCode(path: string): boolean {
  return dispatchGrammarForExtension(extname(path).toLowerCase()) !== null;
}

function hashPair(commit: string, p: LinkedPair, diffChars: number, truncated: boolean): DriftPairReport {
  return {
    commit,
    node_id: p.nodeId,
    targets: p.targets,
    decided_by: 'hash',
    verdict: 'aligned',
    confidence: null,
    evidence: '',
    evidence_in_diff: null,
    suggested_action: 'none: the normalised syntax hash of every bound target is unchanged',
    truncated,
    diff_chars: diffChars,
    cost_usd: 0,
    seconds: 0,
    judge_model: null,
    error: null,
  };
}

export async function runDrift(opts: RunOptions): Promise<RunReport> {
  const tuning: Tuning = opts.tuning ?? { ...DRIFT_TUNING };
  const log = opts.log ?? (() => undefined);
  const anchored = new Set(opts.nodes.flatMap((n) => n.realizedBy.map((a) => a.path)));
  const byId = new Map(opts.nodes.map((n) => [n.id, n]));

  let commits = listCommits(opts.root, opts.range, opts.last ? [...anchored] : []);
  if (opts.last && anchored.size === 0) commits = [];
  if (opts.last) commits = commits.slice(-opts.last);

  const totals: RunTotals = { pairs: 0, judged: 0, by_hash: 0, drift: 0, aligned: 0, unclear: 0, errors: 0, budget_skipped: 0, cost_usd: 0, judge_seconds: 0 };
  const commitReports: CommitReport[] = [];
  const pairs: DriftPairReport[] = [];

  for (const c of commits) {
    let symbolBudget = tuning.maxFilesForSymbols;
    const changes = readCommitChanges(
      opts.root,
      c,
      (p) => anchored.has(p) || (isCode(p) && symbolBudget-- > 0),
      tuning.diffContextLines,
    );
    const link = linkChanges(changes, opts.nodes);
    const short = c.sha.slice(0, 7);
    let calls = 0;

    for (const p of link.pairs) {
      const node = byId.get(p.nodeId);
      const diff = budgetHunks(p.hunks, tuning.maxDiffChars);
      let row: DriftPairReport;
      if (!p.logicChanged && !opts.judgeAll) {
        row = hashPair(c.sha, p, diff.chars, diff.truncated);
      } else if (totals.cost_usd >= tuning.runBudgetUsd) {
        row = { ...hashPair(c.sha, p, diff.chars, diff.truncated), decided_by: 'budget', verdict: 'unclear', suggested_action: 'run budget reached, judge this pair by hand' };
      } else {
        const prompt = buildJudgePrompt({
          nodeId: p.nodeId,
          nodeText: node?.text ?? p.nodeId,
          targets: p.targets.map((t) => `${t.anchor}${t.missing ? ' (missing after the change)' : t.changed ? ' (changed)' : ' (hash unchanged)'}`),
          diff,
          maxNodeChars: tuning.maxNodeChars,
        });
        const r = await opts.judge(prompt, p.nodeId);
        calls += 1;
        totals.cost_usd += r.costUsd;
        totals.judge_seconds += r.seconds;
        const parsed = r.error ? { ok: false as const, error: r.error } : parseJudgeReply(r.reply, p.nodeId);
        if (parsed.ok) {
          row = {
            commit: c.sha,
            node_id: p.nodeId,
            targets: p.targets,
            decided_by: 'judge',
            verdict: parsed.value.verdict,
            confidence: parsed.value.confidence,
            evidence: parsed.value.evidence,
            evidence_in_diff: evidenceInDiff(parsed.value.evidence, diff.text),
            suggested_action: parsed.value.suggested_action,
            truncated: diff.truncated,
            diff_chars: diff.chars,
            cost_usd: r.costUsd,
            seconds: r.seconds,
            judge_model: r.model,
            error: null,
          };
        } else {
          row = {
            ...hashPair(c.sha, p, diff.chars, diff.truncated),
            decided_by: 'error',
            verdict: 'unclear',
            suggested_action: 'judge failed, judge this pair by hand',
            cost_usd: r.costUsd,
            seconds: r.seconds,
            judge_model: r.model,
            error: parsed.error,
          };
        }
      }
      totals.pairs += 1;
      if (row.decided_by === 'judge') totals.judged += 1;
      if (row.decided_by === 'hash') totals.by_hash += 1;
      if (row.decided_by === 'error') totals.errors += 1;
      if (row.decided_by === 'budget') totals.budget_skipped += 1;
      totals[row.verdict] += 1;
      pairs.push(row);
      log(`  ${short} ${row.node_id}: ${row.verdict} by ${row.decided_by}${row.decided_by === 'judge' ? ` (${row.confidence}, $${row.cost_usd.toFixed(4)}, ${row.seconds}s)` : ''}${row.error ? ` - ${row.error}` : ''}`);
    }

    commitReports.push({ commit: c.sha, subject: c.subject, files: link.files, no_linked_intent: link.noLinkedIntent, model_calls: calls });
    if (link.pairs.length === 0) log(`  ${short} no pairs, no model call (${link.noLinkedIntent.length} files with no linked intent)`);
  }

  totals.cost_usd = Math.round(totals.cost_usd * 1e6) / 1e6;
  totals.judge_seconds = Math.round(totals.judge_seconds * 10) / 10;
  return { range: opts.range, root: opts.root, commits: commitReports, pairs, totals };
}
