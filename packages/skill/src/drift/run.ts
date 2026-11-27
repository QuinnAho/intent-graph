// Glue: run the drift check over a commit range. Gathers git changes, links them
// to spec nodes, settles each (commit, node) pair by hash or by the judge, and
// returns the report. Never writes to the repo or the spec tree.

import { extname } from 'node:path';

import type { DriftPairReport, DriftTargetState } from '@intentgraph/shared/schemas';

import { dispatchGrammarForExtension } from '../parser/grammar-registry.js';
import type { ClaudeCallResult } from './claude-cli.js';
import { listCommits, readCommitChanges, resolveRev, show } from './git.js';
import { budgetHunks, buildJudgePrompt, evidenceInDiff, parseJudgeReply } from './judge.js';
import { findMissingTargets, linkChanges, type FileLink, type SpecNode } from './link.js';
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
  missing_targets: number;
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

interface RowBase {
  readonly commit: string;
  readonly nodeId: string;
  readonly targets: DriftTargetState[];
  readonly diffChars: number;
  readonly truncated: boolean;
}

// rows nobody judged still carry every field: an ADR-0022 confidence, a certainty and a plain reason
function hashRow(b: RowBase): DriftPairReport {
  return {
    commit: b.commit,
    node_id: b.nodeId,
    targets: b.targets,
    decided_by: 'hash',
    verdict: 'aligned',
    confidence: 'extracted',
    certainty: 'high',
    evidence: 'the signature did not change: the normalised syntax hash of every bound target is the same before and after (or matches its confirmed @sig)',
    evidence_in_diff: false,
    suggested_action: 'none, only formatting or comments changed in the bound code',
    truncated: b.truncated,
    diff_chars: b.diffChars,
    cost_usd: 0,
    seconds: 0,
    judge_model: null,
    error: null,
  };
}

function undecidedRow(b: RowBase, decidedBy: 'budget' | 'error', reason: string, action: string): DriftPairReport {
  return {
    ...hashRow(b),
    decided_by: decidedBy,
    verdict: 'unclear',
    confidence: 'semantic',
    certainty: 'low',
    evidence: `not judged: ${reason}`,
    suggested_action: action,
    error: decidedBy === 'error' ? reason : null,
  };
}

function lastRev(range: string): string {
  const i = range.lastIndexOf('..');
  return i < 0 ? range : range.slice(i + 2);
}

export async function runDrift(opts: RunOptions): Promise<RunReport> {
  const tuning: Tuning = opts.tuning ?? { ...DRIFT_TUNING };
  const log = opts.log ?? (() => undefined);
  const anchored = new Set(opts.nodes.flatMap((n) => n.realizedBy.map((a) => a.path)));
  const byId = new Map(opts.nodes.map((n) => [n.id, n]));
  const linkOpts = { maxParseBytes: tuning.maxParseBytes };

  let commits = listCommits(opts.root, opts.range, opts.last ? [...anchored] : []);
  if (opts.last && anchored.size === 0) commits = [];
  if (opts.last) commits = commits.slice(-opts.last);

  const totals: RunTotals = { pairs: 0, judged: 0, by_hash: 0, drift: 0, aligned: 0, unclear: 0, errors: 0, budget_skipped: 0, missing_targets: 0, cost_usd: 0, judge_seconds: 0 };
  const commitReports: CommitReport[] = [];
  const pairs: DriftPairReport[] = [];

  const record = (row: DriftPairReport): void => {
    totals.pairs += 1;
    if (row.decided_by === 'judge') totals.judged += 1;
    if (row.decided_by === 'hash') totals.by_hash += 1;
    if (row.decided_by === 'error') totals.errors += 1;
    if (row.decided_by === 'budget') totals.budget_skipped += 1;
    if (row.decided_by === 'missing') totals.missing_targets += 1;
    totals[row.verdict] += 1;
    pairs.push(row);
    log(`  ${row.commit.slice(0, 7)} ${row.node_id}: ${row.verdict} by ${row.decided_by}${row.decided_by === 'judge' ? ` (${row.certainty}, $${row.cost_usd.toFixed(4)}, ${row.seconds}s)` : ''}${row.error ? ` - ${row.error}` : ''}${row.decided_by === 'missing' ? ` - ${row.evidence}` : ''}`);
  };

  for (const c of commits) {
    let symbolBudget = tuning.maxFilesForSymbols;
    const changes = readCommitChanges(
      opts.root,
      c,
      (p) => anchored.has(p) || (isCode(p) && symbolBudget-- > 0),
      tuning.diffContextLines,
    );
    const link = linkChanges(changes, opts.nodes, linkOpts);
    let calls = 0;

    for (const p of link.pairs) {
      const node = byId.get(p.nodeId);
      const diff = budgetHunks(p.hunks, tuning.maxDiffChars);
      const base: RowBase = { commit: c.sha, nodeId: p.nodeId, targets: p.targets, diffChars: diff.chars, truncated: diff.truncated };
      if (p.errors.length > 0) {
        record(undecidedRow(base, 'error', p.errors.join('; '), 'judge this pair by hand, the bound file could not be parsed'));
        continue;
      }
      if (!p.logicChanged && !opts.judgeAll) {
        record(hashRow(base));
        continue;
      }
      if (totals.cost_usd >= tuning.runBudgetUsd) {
        record(undecidedRow(base, 'budget', 'run budget reached', 'run budget reached, judge this pair by hand'));
        continue;
      }
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
      if (!parsed.ok) {
        record({ ...undecidedRow(base, 'error', parsed.error, 'judge failed, judge this pair by hand'), cost_usd: r.costUsd, seconds: r.seconds, judge_model: r.model });
        continue;
      }
      record({
        commit: c.sha,
        node_id: p.nodeId,
        targets: p.targets,
        decided_by: 'judge',
        verdict: parsed.value.verdict,
        // a model judged it from two human-written values (ADR-0025 step 4)
        confidence: 'inferred',
        certainty: parsed.value.confidence,
        evidence: parsed.value.evidence.trim() || '(the judge gave no quote)',
        evidence_in_diff: evidenceInDiff(parsed.value.evidence, diff.text),
        suggested_action: parsed.value.suggested_action.trim() || '(the judge gave no action)',
        truncated: diff.truncated,
        diff_chars: diff.chars,
        cost_usd: r.costUsd,
        seconds: r.seconds,
        judge_model: r.model,
        error: null,
      });
    }

    commitReports.push({ commit: c.sha, subject: c.subject, files: link.files, no_linked_intent: link.noLinkedIntent, model_calls: calls });
    if (link.pairs.length === 0) log(`  ${c.sha.slice(0, 7)} no pairs, no model call (${link.noLinkedIntent.length} files with no linked intent)`);
  }

  // targets that do not exist at the end of the range are reported once, with no model call
  const end = resolveRev(opts.root, lastRev(opts.range));
  for (const m of findMissingTargets(opts.nodes, (path) => show(opts.root, end, path), linkOpts)) {
    const anchor = byId.get(m.nodeId)?.realizedBy.find((a) => a.raw === m.anchor);
    const target: DriftTargetState = { anchor: m.anchor, path: anchor?.path ?? m.anchor, symbol: anchor?.symbol ?? null, before_hash: null, after_hash: null, changed: false, missing: m.kind === 'missing' };
    const base: RowBase = { commit: end, nodeId: m.nodeId, targets: [target], diffChars: 0, truncated: false };
    if (m.kind === 'error') {
      record(undecidedRow(base, 'error', m.reason, 'check this target by hand, it could not be parsed'));
      continue;
    }
    record({
      ...hashRow(base),
      decided_by: 'missing',
      verdict: 'unclear',
      confidence: 'extracted',
      certainty: 'high',
      evidence: `missing target at ${end.slice(0, 7)}: ${m.reason}`,
      suggested_action: 'fix the anchor, or restore the code it names',
    });
  }

  totals.cost_usd = Math.round(totals.cost_usd * 1e6) / 1e6;
  totals.judge_seconds = Math.round(totals.judge_seconds * 10) / 10;
  return { range: opts.range, root: opts.root, commits: commitReports, pairs, totals };
}
