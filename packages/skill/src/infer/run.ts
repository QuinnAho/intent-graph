// The run loop for inferred intent. Folder by folder: read, look in the cache, call the
// model if needed, check the anchors, keep what survives. The model call and the cache are
// passed in, so the tests never reach a model. Nothing here writes a file.

import { createHash } from 'node:crypto';

import type { InferProposal } from '@intentgraph/shared/schemas';

import type { ClaudeCallResult } from '../drift/claude-cli.js';
import { readFolder, type FolderInput } from './gather.js';
import type { FolderPlan } from './folders.js';
import { buildPrompt, checkAnchors, parseReply, pinDeclaredId, type Declared } from './prompt.js';
import { INFER_TUNING, type InferTuning } from './tuning.js';

export type InferCall = (prompt: string, folder: string) => Promise<ClaudeCallResult>;

/** Cached replies, keyed by cacheKey. Only replies that parsed are stored. */
export interface InferCache {
  get(key: string): InferProposal[] | undefined;
  set(key: string, proposals: InferProposal[]): void;
}

export type FolderStatus = 'proposed' | 'cached' | 'none' | 'error' | 'budget';

export interface ProposalRow {
  readonly id: string;
  readonly folder: string;
  readonly title: string;
  readonly body: string;
  readonly anchors: string[];
  readonly belongs_under: string | null;
  readonly restates: string | null;
  readonly confidence: 'inferred' | 'semantic';
  /** True when every file the anchors cite is a placeholder, so nothing here works yet. Worked out in code from the stub marking. */
  readonly planned: boolean;
  readonly code_hash: string;
}

export interface FolderRow {
  readonly folder: string;
  readonly files: number;
  readonly claimed_files: number;
  readonly status: FolderStatus;
  /** True when the reply came from the cache, whatever the checked outcome. */
  readonly from_cache: boolean;
  readonly calls: number;
  readonly cost_usd: number;
  readonly seconds: number;
  readonly truncated: boolean;
  readonly error: string | null;
  readonly proposals: string[];
  readonly dropped_proposals: number;
  readonly dropped_anchors: number;
}

export interface InferReport {
  readonly incomplete: boolean;
  readonly stopped: string | null;
  readonly totals: {
    readonly folders: number;
    readonly calls: number;
    readonly cached: number;
    readonly proposals: number;
    readonly errors: number;
    readonly budget_skipped: number;
    readonly dropped_proposals: number;
    readonly dropped_anchors: number;
    readonly cost_usd: number;
  };
  readonly folders: FolderRow[];
  readonly proposals: ProposalRow[];
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

export function declaredHash(declared: readonly Declared[]): string {
  return sha([...declared].sort((a, b) => a.id.localeCompare(b.id)).map((d) => `${d.kind}\0${d.id}\0${d.title}`).join('\n'));
}

/** Same folder, same code, same prompt version, model and declared titles: same key. */
export function cacheKey(folder: string, codeHash: string, declared: readonly Declared[], tuning: Pick<InferTuning, 'promptVersion' | 'model'> = INFER_TUNING): string {
  return sha([tuning.promptVersion, tuning.model, folder, codeHash, declaredHash(declared)].join('\0'));
}

/** Stable while the folder and the code it was read from stay the same. */
export function proposalId(folder: string, codeHash: string, index: number): string {
  return `inf-${sha(`${folder}\0${codeHash}\0${index}`).slice(0, 12)}`;
}

export interface RunInferOptions {
  readonly root: string;
  readonly plans: readonly FolderPlan[];
  readonly declared: readonly Declared[];
  readonly call: InferCall;
  readonly cache: InferCache;
  readonly tuning?: InferTuning;
  readonly log?: (line: string) => void;
  /** Test seam: use these inputs instead of reading files. */
  readonly inputFor?: (plan: FolderPlan) => FolderInput;
}

const PLANNED = 'Planned: ';

/** Put the plan marker on the front when it is not there, and cut the end to stay inside the limit. */
export function withPlanned(text: string, max: number): string {
  const marked = /^planned:/i.test(text) ? text : `${PLANNED}${text}`;
  return marked.length > max ? `${marked.slice(0, max - 3).trimEnd()}...` : marked;
}

/** Turn one folder's parsed proposals into rows. Anchors are checked against the real files. */
export function rowsFor(
  input: FolderInput,
  proposals: readonly InferProposal[],
  declared: readonly Declared[],
  tuning: Pick<InferTuning, 'maxTitleChars' | 'maxBodyChars'> = INFER_TUNING,
): { rows: ProposalRow[]; droppedProposals: number; droppedAnchors: number } {
  const rows: ProposalRow[] = [];
  let droppedProposals = 0;
  let droppedAnchors = 0;
  proposals.forEach((p, i) => {
    const check = checkAnchors(p.anchors, input.files);
    droppedAnchors += check.dropped.length;
    if (check.kept.length === 0) {
      droppedProposals += 1;
      return;
    }
    // planned goes by the files the kept anchors cite, never by what the model says
    const cited = new Set(check.kept.map((a) => a.split('#')[0]));
    const planned = input.files.filter((f) => cited.has(f.path)).every((f) => f.stub);
    rows.push({
      id: proposalId(input.folder, input.codeHash, i),
      folder: input.folder,
      title: planned ? withPlanned(p.title, tuning.maxTitleChars) : p.title,
      body: planned ? withPlanned(p.body, tuning.maxBodyChars) : p.body,
      planned,
      anchors: check.kept,
      belongs_under: pinDeclaredId(p.belongs_under, 'concept', declared),
      restates: pinDeclaredId(p.restates, 'intent', declared),
      confidence: p.confidence,
      code_hash: input.codeHash,
    });
  });
  return { rows, droppedProposals, droppedAnchors };
}

export async function runInfer(opts: RunInferOptions): Promise<InferReport> {
  const tuning = opts.tuning ?? (INFER_TUNING as InferTuning);
  const log = opts.log ?? ((): void => undefined);
  const folders: FolderRow[] = [];
  const proposals: ProposalRow[] = [];
  let spent = 0;
  let calls = 0;
  let stopped: string | null = null;

  for (const plan of opts.plans) {
    const base = { folder: plan.folder, files: plan.unclaimed.length, claimed_files: plan.claimed.length, from_cache: false, calls: 0, cost_usd: 0, seconds: 0, truncated: false, error: null, proposals: [] as string[], dropped_proposals: 0, dropped_anchors: 0 };
    let input: FolderInput;
    try {
      input = opts.inputFor ? opts.inputFor(plan) : readFolder(opts.root, plan.folder, plan.unclaimed, tuning);
    } catch (e) {
      folders.push({ ...base, status: 'error', error: `cannot read folder: ${(e as Error).message}` });
      log(`  error   ${plan.folder}: cannot read folder`);
      continue;
    }
    const key = cacheKey(plan.folder, input.codeHash, opts.declared, tuning);
    let parsed = opts.cache.get(key);
    let status: FolderStatus = 'cached';
    let row = { ...base, from_cache: parsed !== undefined };

    if (parsed === undefined) {
      if (spent >= tuning.runBudgetUsd) {
        stopped ??= `budget cap of $${tuning.runBudgetUsd} reached after ${calls} calls ($${spent.toFixed(4)} spent)`;
        folders.push({ ...base, status: 'budget' });
        log(`  budget  ${plan.folder}: not asked, cap reached`);
        continue;
      }
      const built = buildPrompt(input, opts.declared, tuning.maxPromptChars, tuning.maxDeclaredTitleChars);
      // a reply that breaks the limits gets one more try, a failed call does not
      const callsBefore = calls;
      let res = await opts.call(built.text, plan.folder);
      calls += 1;
      spent += res.costUsd;
      let seconds = res.seconds;
      let reply = res.error === null ? parseReply(res.reply, tuning.maxProposals) : null;
      if (res.error === null && reply !== null && !reply.ok && spent < tuning.runBudgetUsd) {
        const again = await opts.call(built.text, plan.folder);
        calls += 1;
        spent += again.costUsd;
        seconds += again.seconds;
        res = { ...again, costUsd: res.costUsd + again.costUsd };
        reply = again.error === null ? parseReply(again.reply, tuning.maxProposals) : null;
      }
      row = { ...base, calls: calls - callsBefore, cost_usd: res.costUsd, seconds, truncated: built.truncated };
      if (res.error !== null || reply === null) {
        const error = res.error ?? 'no reply';
        folders.push({ ...row, status: 'error', error });
        log(`  error   ${plan.folder}: ${error.slice(0, 120)}`);
        continue;
      }
      if (!reply.ok) {
        folders.push({ ...row, status: 'error', error: reply.error });
        log(`  error   ${plan.folder}: ${reply.error}`);
        continue;
      }
      parsed = reply.proposals;
      opts.cache.set(key, parsed);
      status = 'proposed';
    }

    const made = rowsFor(input, parsed, opts.declared, tuning);
    proposals.push(...made.rows);
    folders.push({
      ...row,
      status: made.rows.length > 0 ? status : 'none',
      proposals: made.rows.map((r) => r.id),
      dropped_proposals: made.droppedProposals,
      dropped_anchors: made.droppedAnchors,
    });
    log(`  ${made.rows.length > 0 ? status.padEnd(7) : 'none   '} ${plan.folder}: ${made.rows.length} proposals${row.truncated ? ' (cut)' : ''}${status === 'cached' ? ' (cache)' : ''}`);
  }

  const sum = (f: (r: FolderRow) => number): number => folders.reduce((n, r) => n + f(r), 0);
  const budgetSkipped = folders.filter((f) => f.status === 'budget').length;
  return {
    incomplete: budgetSkipped > 0,
    stopped,
    totals: {
      folders: folders.length,
      calls,
      cached: folders.filter((f) => f.from_cache).length,
      proposals: proposals.length,
      errors: folders.filter((f) => f.status === 'error').length,
      budget_skipped: budgetSkipped,
      dropped_proposals: sum((f) => f.dropped_proposals),
      dropped_anchors: sum((f) => f.dropped_anchors),
      cost_usd: Math.round(spent * 1e6) / 1e6,
    },
    folders,
    proposals,
  };
}
