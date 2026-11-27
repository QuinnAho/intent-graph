// Verifier findings on lane 2: big files, missing targets, full report rows.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DriftPairReportSchema } from '@intentgraph/shared/schemas';

import { parseAnchor } from '../src/drift/anchors.js';
import { judgeArgs, type ClaudeCallResult } from '../src/drift/claude-cli.js';
import { findMissingTargets, linkChanges, type SpecNode } from '../src/drift/link.js';
import { runDrift, type JudgeFn } from '../src/drift/run.js';
import { loadSpecNodes } from '../src/drift/spec-nodes.js';
import { DRIFT_TUNING } from '../src/drift/tuning.js';
import { parseUnifiedDiff } from '../src/drift/unified-diff.js';
import { signatureOf } from '../src/parser/diff/signature-hash.js';

/** A valid TS file of roughly `kb` kilobytes with `target` as the last function. */
function bigSource(kb: number, ret = 'a + b'): string {
  const filler: string[] = [];
  let i = 0;
  while (filler.join('\n').length < kb * 1024) {
    filler.push(`export function filler${i}(x: number): number {\n  return x * ${i} + 1;\n}\n`);
    i += 1;
  }
  return `${filler.join('\n')}\nexport function target(a: number, b: number): number {\n  return ${ret};\n}\n`;
}

function node(id: string, anchors: string[]): SpecNode {
  return { id, title: id, text: id, file: `${id}.md`, realizedBy: anchors.map((a) => parseAnchor(a)!) };
}

describe('large files (finding 1)', () => {
  it('hashes a 38 KB and a 300 KB file without throwing, and still ignores formatting', () => {
    for (const kb of [38, 300]) {
      const src = bigSource(kb);
      const r = signatureOf('big.ts', src, 'target');
      expect(r.found).toBe(true);
      expect(signatureOf('big.ts', src.replace('return a + b;', 'return a+b;'), 'target').hash).toBe(r.hash);
      expect(signatureOf('big.ts', bigSource(kb, 'a - b'), 'target').hash).not.toBe(r.hash);
    }
  });

  it('refuses a file over the parse cap with a clear error', () => {
    expect(() => signatureOf('big.ts', bigSource(4), 'target', { maxBytes: 100 })).toThrow(/parse cap/);
  });

  it('a file that cannot be parsed marks only its own pair, the rest still link', () => {
    const big = bigSource(4);
    const small = 'export function f(): number {\n  return 1;\n}\n';
    const r = linkChanges(
      [
        { path: 'big.ts', status: 'M', before: big, after: big.replace('a + b', 'a - b'), binary: false, hunks: [] },
        { path: 's.ts', status: 'M', before: small, after: small.replace('1', '2'), binary: false, hunks: parseUnifiedDiff('--- a/s.ts\n+++ b/s.ts\n@@ -2 +2 @@\n-  return 1;\n+  return 2;\n').get('s.ts') ?? [] },
      ],
      [node('n-big', ['big.ts#target']), node('n-small', ['s.ts#f'])],
      { maxParseBytes: 1000 },
    );
    const bigPair = r.pairs.find((p) => p.nodeId === 'n-big');
    expect(bigPair?.errors[0]).toMatch(/parse cap/);
    expect(r.pairs.find((p) => p.nodeId === 'n-small')).toMatchObject({ logicChanged: true, errors: [] });
  });
});

describe('findMissingTargets (finding 2)', () => {
  const files: Record<string, string> = { 'src/a.ts': 'export function here(): void {}\n' };
  const read = (p: string): string | null => files[p] ?? null;

  it('names a missing file and a missing symbol, and passes ones that exist', () => {
    const missing = findMissingTargets([node('n1', ['src/nothere.ts#nope', 'src/a.ts#gone', 'src/a.ts#here', 'src/a.ts'])], read, {});
    expect(missing).toEqual([
      { nodeId: 'n1', anchor: 'src/nothere.ts#nope', kind: 'missing', reason: 'file src/nothere.ts does not exist' },
      { nodeId: 'n1', anchor: 'src/a.ts#gone', kind: 'missing', reason: 'symbol gone is not in src/a.ts' },
    ]);
  });

  it('reports a target it cannot parse as an error, not as missing', () => {
    const out = findMissingTargets([node('n1', ['src/a.ts#here'])], read, { maxParseBytes: 5 });
    expect(out[0]).toMatchObject({ kind: 'error' });
    expect(out[0]?.reason).toMatch(/parse cap/);
  });
});

describe('judge isolation (finding 3)', () => {
  it('runs the judge in safe mode so no CLAUDE.md, memory, hooks or plugins load', () => {
    const args = judgeArgs({ model: 'haiku', budgetUsd: 0.05, timeoutMs: 1, systemPrompt: 's', jsonSchema: {} });
    expect(args).toContain('--safe-mode');
    // --bare would also skip memory, but it reads no OAuth login, so the judge could not sign in here
    expect(args).not.toContain('--bare');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args).toContain('--max-budget-usd');
    expect(args).toContain('--json-schema');
  });
});

let repo = '';
let base = '';
function git(args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@localhost', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd: repo, encoding: 'utf8' }).trim();
}
function put(rel: string, text: string): void {
  mkdirSync(join(repo, rel, '..'), { recursive: true });
  writeFileSync(join(repo, rel), text);
}
const nodeMd = (id: string, anchors: string[]): string =>
  `---\nid: ${id}\ntitle: ${id}\nparent: null\nconfidence: asserted\nrealized_by:\n${anchors.map((a) => `  - ${a}`).join('\n')}\n---\n\n${id} keeps its promise.\n`;

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'drift-fixes-test-'));
  git(['init', '-q']);
  put('spec/intents/big.md', nodeMd('intent-big', ['src/big.ts#target']));
  put('spec/intents/ghost.md', nodeMd('intent-ghost', ['src/nothere.ts#nope', 'src/small.ts#gone']));
  put('spec/intents/small.md', nodeMd('intent-small', ['src/small.ts#f']));
  put('src/big.ts', bigSource(38));
  put('src/small.ts', 'export function f(): number {\n  return 1;\n}\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'base']);
  base = git(['rev-parse', 'HEAD']);
  put('src/big.ts', bigSource(38, 'a - b'));
  put('src/small.ts', 'export function f(): number {\n  // one\n  return 1;\n}\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'change']);
});
afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

function fakeJudge(calls: string[]): JudgeFn {
  return async (prompt, nodeId): Promise<ClaudeCallResult> => {
    calls.push(nodeId);
    return { reply: { node_id: nodeId, verdict: 'drift', confidence: 'high', evidence: 'return a - b;', suggested_action: 'restore +' }, costUsd: 0, seconds: 0, model: 'fake', error: null };
  };
}

describe('runDrift on the verifier repros', { timeout: 60_000 }, () => {
  it('a 38 KB bound file is judged, missing targets get rows, every row is complete', async () => {
    const calls: string[] = [];
    const { nodes } = loadSpecNodes(join(repo, 'spec'));
    const r = await runDrift({ root: repo, range: `${base}..HEAD`, nodes, judge: fakeJudge(calls) });

    expect(r.pairs.find((p) => p.node_id === 'intent-big')).toMatchObject({ decided_by: 'judge', verdict: 'drift', confidence: 'inferred', certainty: 'high' });

    const ghost = r.pairs.filter((p) => p.node_id === 'intent-ghost');
    expect(ghost.map((p) => p.targets[0]?.anchor).sort()).toEqual(['src/nothere.ts#nope', 'src/small.ts#gone']);
    for (const g of ghost) expect(g).toMatchObject({ decided_by: 'missing', verdict: 'unclear', confidence: 'extracted', cost_usd: 0 });
    expect(ghost[0]?.targets[0]?.missing).toBe(true);
    expect(calls).not.toContain('intent-ghost');
    expect(r.totals.missing_targets).toBe(2);

    const hash = r.pairs.find((p) => p.node_id === 'intent-small');
    expect(hash).toMatchObject({ decided_by: 'hash', confidence: 'extracted', certainty: 'high' });
    expect(hash?.evidence).toMatch(/signature did not change/);

    for (const p of r.pairs) {
      DriftPairReportSchema.parse(p);
      expect(p.confidence).not.toBeNull();
      expect(p.certainty).not.toBeNull();
      expect(p.evidence.trim()).not.toBe('');
      expect(p.suggested_action.trim()).not.toBe('');
    }
  });

  it('a file over the parse cap gives an unclear row with the reason and the run finishes', async () => {
    const calls: string[] = [];
    const { nodes } = loadSpecNodes(join(repo, 'spec'));
    const r = await runDrift({ root: repo, range: `${base}..HEAD`, nodes, judge: fakeJudge(calls), tuning: { ...DRIFT_TUNING, maxParseBytes: 10_000 } });
    const big = r.pairs.filter((p) => p.node_id === 'intent-big');
    expect(big.length).toBeGreaterThan(0);
    for (const b of big) {
      expect(b).toMatchObject({ decided_by: 'error', verdict: 'unclear', confidence: 'semantic', certainty: 'low' });
      expect(b.error).toMatch(/parse cap/);
    }
    expect(calls).not.toContain('intent-big');
    expect(r.pairs.find((p) => p.node_id === 'intent-small')?.decided_by).toBe('hash');
  });
});
