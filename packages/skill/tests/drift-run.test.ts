// End-to-end over a throwaway git repo with a fake judge: which pairs reach the
// model, which are settled by hash, and that nothing under spec/ is written.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ClaudeCallResult } from '../src/drift/claude-cli.js';
import { runDrift, type JudgeFn } from '../src/drift/run.js';
import { loadSpecNodes } from '../src/drift/spec-nodes.js';
import { DRIFT_TUNING } from '../src/drift/tuning.js';

const NODE = `---
id: intent-totals
title: Totals never go negative
parent: null
confidence: asserted
realized_by:
  - src/total.ts#total
---

# Totals never go negative

total() returns the sum of the items, and never less than zero.
`;

const SRC = `export function total(items: number[]): number {
  const sum = items.reduce((a, b) => a + b, 0);
  return Math.max(0, sum);
}

export function other(): number {
  return 1;
}
`;

let repo = '';
const shas: Record<string, string> = {};

function git(args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@localhost', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd: repo, encoding: 'utf8' }).trim();
}
function commit(label: string, files: Record<string, string>): void {
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(repo, p, '..'), { recursive: true });
    writeFileSync(join(repo, p), c);
  }
  git(['add', '-A']);
  git(['commit', '-q', '-m', label]);
  shas[label] = git(['rev-parse', 'HEAD']);
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'drift-run-test-'));
  git(['init', '-q']);
  commit('base', { 'spec/intents/totals.md': NODE, 'src/total.ts': SRC, 'README.md': 'hi\n' });
  commit('docs', { 'README.md': 'hello\n' });
  commit('comment', { 'src/total.ts': SRC.replace('  const sum', '  // add them up\n  const sum') });
  commit('logic', { 'src/total.ts': SRC.replace('  // add them up\n', '').replace('return Math.max(0, sum);', 'return sum;') });
  commit('unbound', { 'src/total.ts': SRC.replace('return Math.max(0, sum);', 'return sum;').replace('return 1;', 'return 2;'), 'src/new.ts': 'export const n = 1;\n' });
  commit('huge', { 'src/total.ts': SRC.replace('return Math.max(0, sum);', 'return sum;').replace('return 2;', 'return 3;').replace('export function total', Array.from({ length: 400 }, (_, i) => `// filler line ${i}`).join('\n') + '\nexport function total').replace('const sum = items', 'const sum = 0 + items') });
});

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

function fakeJudge(calls: string[]): JudgeFn {
  return async (prompt, nodeId): Promise<ClaudeCallResult> => {
    calls.push(prompt);
    return {
      reply: { node_id: nodeId, verdict: 'drift', confidence: 'medium', evidence: 'return sum;', suggested_action: 'restore the clamp at zero' },
      costUsd: 0.001,
      seconds: 0.1,
      model: 'fake',
      error: null,
    };
  };
}

describe('runDrift', { timeout: 60_000 }, () => {
  it('settles each commit the right way', async () => {
    const specBefore = readFileSync(join(repo, 'spec/intents/totals.md'), 'utf8');
    const calls: string[] = [];
    const { nodes } = loadSpecNodes(join(repo, 'spec'));
    const r = await runDrift({ root: repo, range: `${shas['base']}..HEAD`, nodes, judge: fakeJudge(calls), tuning: { ...DRIFT_TUNING, maxDiffChars: 2000 } });

    const byCommit = (label: string) => r.commits.find((c) => c.commit === shas[label]);
    const pairOf = (label: string) => r.pairs.filter((p) => p.commit === shas[label]);

    // docs-only commit: no pair, no model call, README reported as no linked intent
    expect(byCommit('docs')?.model_calls).toBe(0);
    expect(byCommit('docs')?.no_linked_intent).toEqual(['README.md']);
    expect(pairOf('docs')).toEqual([]);

    // comment inside the bound symbol: settled by hash, no model call
    expect(pairOf('comment')).toHaveLength(1);
    expect(pairOf('comment')[0]).toMatchObject({ decided_by: 'hash', verdict: 'aligned', cost_usd: 0 });
    expect(byCommit('comment')?.model_calls).toBe(0);

    // logic change: one judge call, verdict and evidence recorded
    expect(pairOf('logic')[0]).toMatchObject({ decided_by: 'judge', verdict: 'drift', confidence: 'inferred', certainty: 'medium', evidence_in_diff: true, judge_model: 'fake' });

    // a change to an unbound symbol and a new unbound file: no pair, both reported
    expect(pairOf('unbound')).toEqual([]);
    expect(byCommit('unbound')?.no_linked_intent).toEqual(['src/new.ts']);
    expect(byCommit('unbound')?.files.find((f) => f.path === 'src/total.ts')?.unlinkedSymbols).toEqual(['other']);

    // huge diff: cut and marked, and the judge is told
    const huge = pairOf('huge')[0];
    expect(huge?.truncated).toBe(true);
    expect(huge?.diff_chars).toBeLessThanOrEqual(2000);
    expect(calls.some((c) => c.includes('CUT'))).toBe(true);

    // the judge never sees who wrote the change or the commit message
    for (const c of calls) {
      expect(c).not.toContain('t@localhost');
      expect(c).not.toMatch(/\blogic\b|\bhuge\b/);
    }

    expect(r.totals).toMatchObject({ judged: 2, by_hash: 1, drift: 2, aligned: 1 });
    expect(readFileSync(join(repo, 'spec/intents/totals.md'), 'utf8')).toBe(specBefore);
    expect(git(['status', '--porcelain'])).toBe('');
  });

  it('stops calling the judge once the run budget is spent', async () => {
    const calls: string[] = [];
    const { nodes } = loadSpecNodes(join(repo, 'spec'));
    const r = await runDrift({ root: repo, range: `${shas['base']}..HEAD`, nodes, judge: fakeJudge(calls), tuning: { ...DRIFT_TUNING, runBudgetUsd: 0.0005 } });
    expect(calls).toHaveLength(1);
    expect(r.totals.budget_skipped).toBe(1);
  });

  it('last N keeps only commits that touch an anchored path', async () => {
    const { nodes } = loadSpecNodes(join(repo, 'spec'));
    const r = await runDrift({ root: repo, range: `${shas['base']}..HEAD`, nodes, judge: fakeJudge([]), last: 2 });
    expect(r.commits.map((c) => c.commit)).toEqual([shas['unbound'], shas['huge']]);
  });

  it('judge-all sends hash-equal pairs to the judge too', async () => {
    const calls: string[] = [];
    const { nodes } = loadSpecNodes(join(repo, 'spec'));
    const r = await runDrift({ root: repo, range: `${shas['docs']}..${shas['comment']}`, nodes, judge: fakeJudge(calls), judgeAll: true });
    expect(calls).toHaveLength(1);
    expect(r.pairs[0]?.decided_by).toBe('judge');
  });
});

describe('loadSpecNodes', () => {
  it('reads realized_by, and an overlay replaces it without touching the file', () => {
    const own = loadSpecNodes(join(repo, 'spec'));
    expect(own.nodes[0]?.realizedBy.map((a) => a.raw)).toEqual(['src/total.ts#total']);
    const over = loadSpecNodes(join(repo, 'spec'), { 'intent-totals': ['src/total.ts#other'], 'intent-ghost': ['x.ts'] });
    expect(over.nodes[0]?.realizedBy.map((a) => a.raw)).toEqual(['src/total.ts#other']);
    expect(over.errors.map((e) => e.message)).toEqual(['no spec node with id intent-ghost']);
  });
});
