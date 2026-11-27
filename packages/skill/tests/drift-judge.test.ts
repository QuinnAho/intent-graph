// Tests for the pure judge helpers, case scoring, arg parsing and the CLI flags.

import { describe, expect, it } from 'vitest';

import { budgetHunks, buildJudgePrompt, evidenceInDiff, parseJudgeReply, JUDGE_SYSTEM_PROMPT } from '../src/drift/judge.js';
import { judgeArgs } from '../src/drift/claude-cli.js';
import { scoreCases, worstVerdict, type CaseOutcome } from '../src/drift/cases.js';
import { parseDriftArgs } from '../src/drift/cli.js';
import { DRIFT_TUNING } from '../src/drift/tuning.js';
import type { PairHunk } from '../src/drift/link.js';
import type { DriftPairReport } from '@intentgraph/shared/schemas';

function hunk(path: string, lines: number, width = 20): PairHunk {
  const body = Array.from({ length: lines }, (_, i) => `+${String(i).padEnd(width, 'x')}`);
  return { path, hunk: { oldStart: 1, oldLines: 0, newStart: 1, newLines: lines, text: ['@@ -1,0 +1,' + lines + ' @@', ...body].join('\n') } };
}

describe('budgetHunks', () => {
  it('keeps a small diff whole', () => {
    const d = budgetHunks([hunk('a.ts', 3)], 10_000);
    expect(d.truncated).toBe(false);
    expect(d.text).toContain('--- a.ts');
    expect(d.chars).toBe(d.text.length);
  });
  it('cuts a huge diff at a line boundary, marks it, and stays under the cap', () => {
    const d = budgetHunks([hunk('a.ts', 50), hunk('b.ts', 5000)], 3000);
    expect(d.truncated).toBe(true);
    expect(d.text.length).toBeLessThanOrEqual(3000);
    for (const l of d.text.trimEnd().split('\n')) expect(l === '--- a.ts' || l === '--- b.ts' || l.startsWith('@@') || /^\+\d+x*$/.test(l)).toBe(true);
  });
});

describe('buildJudgePrompt', () => {
  it('carries the node, the targets and the diff, and says when the diff was cut', () => {
    const diff = budgetHunks([hunk('a.ts', 5000)], 500);
    const p = buildJudgePrompt({ nodeId: 'intent-x', nodeText: 'Totals never go negative.', targets: ['a.ts#f (changed)'], diff, maxNodeChars: 100 });
    expect(p).toContain('intent-x');
    expect(p).toContain('Totals never go negative.');
    expect(p).toContain('a.ts#f (changed)');
    expect(p).toContain('CUT');
    expect(p).not.toMatch(/author|committer/i);
  });
  it('cuts long node text', () => {
    const diff = budgetHunks([hunk('a.ts', 1)], 500);
    const p = buildJudgePrompt({ nodeId: 'n', nodeText: 'y'.repeat(500), targets: [], diff, maxNodeChars: 100 });
    expect(p).toContain('[node text cut]');
    expect(p).not.toContain('y'.repeat(101));
  });
});

describe('parseJudgeReply', () => {
  const good = { node_id: 'n1', verdict: 'drift', confidence: 'high', evidence: 'return a - b;', suggested_action: 'restore addition' };
  it('accepts a structured object', () => {
    expect(parseJudgeReply(good, 'n1')).toEqual({ ok: true, value: good });
  });
  it('accepts fenced JSON text', () => {
    expect(parseJudgeReply('```json\n' + JSON.stringify(good) + '\n```', 'n1').ok).toBe(true);
  });
  it('rejects a wrong verdict word, a numeric confidence and a wrong node id', () => {
    expect(parseJudgeReply({ ...good, verdict: 'broken' }, 'n1').ok).toBe(false);
    expect(parseJudgeReply({ ...good, confidence: 0.9 }, 'n1').ok).toBe(false);
    expect(parseJudgeReply(good, 'n2').ok).toBe(false);
    expect(parseJudgeReply('no json here', 'n1').ok).toBe(false);
    expect(parseJudgeReply(null, 'n1').ok).toBe(false);
  });
});

describe('evidenceInDiff', () => {
  const diff = '--- a.ts\n@@ -1 +1 @@\n-  return a + b;\n+  return a  -  b;\n';
  it('finds a quote with or without the marker and with other spacing', () => {
    expect(evidenceInDiff('return a - b;', diff)).toBe(true);
    expect(evidenceInDiff('+  return a - b;', diff)).toBe(true);
    expect(evidenceInDiff('return a + b;', diff)).toBe(true);
  });
  it('rejects an invented quote and an empty one', () => {
    expect(evidenceInDiff('return a * b;', diff)).toBe(false);
    expect(evidenceInDiff('  ', diff)).toBe(false);
  });
});

describe('judgeArgs', () => {
  it('runs print mode on the cheap model with no tools, no session and a budget cap', () => {
    const args = judgeArgs({ model: DRIFT_TUNING.judgeModel, budgetUsd: DRIFT_TUNING.perCallBudgetUsd, timeoutMs: 1, systemPrompt: JUDGE_SYSTEM_PROMPT, jsonSchema: {} });
    expect(args[0]).toBe('-p');
    expect(args[args.indexOf('--model') + 1]).toBe('haiku');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(Number(args[args.indexOf('--max-budget-usd') + 1])).toBeGreaterThan(0);
    expect(args).toContain('--no-session-persistence');
    expect(args).toContain('--strict-mcp-config');
    expect(args).not.toContain('--permission-mode');
    expect(args.join(' ')).not.toMatch(/dangerously|bypass/);
  });
});

function row(verdict: DriftPairReport['verdict']): DriftPairReport {
  return { commit: 'c', node_id: 'n', targets: [], decided_by: 'judge', verdict, confidence: 'inferred', certainty: 'high', evidence: 'q', evidence_in_diff: true, suggested_action: 'a', truncated: false, diff_chars: 0, cost_usd: 0, seconds: 0, judge_model: null, error: null };
}

describe('scoreCases', () => {
  it('counts caught, missed and wrongly flagged', () => {
    const o = (name: string, expect: 'drift' | 'aligned', verdict: DriftPairReport['verdict']): CaseOutcome => ({ name, expect, verdict, pairs: [row(verdict)], no_pair: false, error: null });
    const s = scoreCases([o('a', 'drift', 'drift'), o('b', 'drift', 'unclear'), o('c', 'drift', 'aligned'), o('d', 'aligned', 'aligned'), o('e', 'aligned', 'drift')]);
    expect(s).toMatchObject({ breaking: 3, caught: 1, missed: 2, harmless: 2, wronglyFlagged: 1, unclear: 1, errors: 0 });
  });
  it('takes the worst verdict over pairs', () => {
    expect(worstVerdict([row('aligned'), row('drift'), row('unclear')])).toBe('drift');
    expect(worstVerdict([])).toBe('aligned');
  });
});

describe('parseDriftArgs', () => {
  it('defaults to the seeded cases', () => {
    const r = parseDriftArgs([], '/repo');
    expect(r.ok && r.args.mode).toBe('cases');
  });
  it('reads a range run', () => {
    const r = parseDriftArgs(['--range', 'abc..main', '--root', '/x', '--last', '20'], '/repo');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.args).toMatchObject({ mode: 'range', range: 'abc..main', last: 20 });
  });
  it('rejects bad input', () => {
    expect(parseDriftArgs(['--range', 'main'], '/r').ok).toBe(false);
    expect(parseDriftArgs(['--range', '--output=x..y'], '/r').ok).toBe(false);
    expect(parseDriftArgs(['--range', 'a...b'], '/r').ok).toBe(false);
    expect(parseDriftArgs(['--last', '0', '--range', 'a..b'], '/r').ok).toBe(false);
    expect(parseDriftArgs(['--wat'], '/r').ok).toBe(false);
  });
});
