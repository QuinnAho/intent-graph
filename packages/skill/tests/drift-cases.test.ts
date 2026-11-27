// Seeded-case runner: builds a temp repo per case and scores the verdicts.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { runCases } from '../src/drift/cases.js';
import type { JudgeFn } from '../src/drift/run.js';

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

function put(root: string, rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

const NODE = `---
id: intent-order
title: Newest first
parent: null
confidence: asserted
realized_by:
  - src/o.ts#order
---

Items are sorted newest first.
`;
const SRC = 'export function order(xs: number[]): number[] {\n  return [...xs].sort((a, b) => b - a);\n}\n';

describe('runCases', { timeout: 60_000 }, () => {
  it('sees a same-size edit, settles a comment by hash, and errors on a case with no change', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drift-cases-test-'));
    roots.push(root);
    for (const name of ['flip', 'comment', 'same']) {
      put(root, `${name}/spec/intents/order.md`, NODE);
      put(root, `${name}/before/src/o.ts`, SRC);
    }
    put(root, 'flip/case.json', '{"expect":"drift"}');
    put(root, 'flip/after/src/o.ts', SRC.replace('b - a', 'a - b'));
    put(root, 'comment/case.json', '{"expect":"aligned"}');
    put(root, 'comment/after/src/o.ts', SRC.replace('  return', '  // newest first\n  return'));
    put(root, 'same/case.json', '{"expect":"aligned"}');
    put(root, 'same/after/src/o.ts', SRC);

    const calls: string[] = [];
    const judge: JudgeFn = async (prompt, nodeId) => {
      calls.push(prompt);
      return { reply: { node_id: nodeId, verdict: 'drift', confidence: 'high', evidence: 'return [...xs].sort((a, b) => a - b);', suggested_action: 'flip it back' }, costUsd: 0, seconds: 0, model: 'fake', error: null };
    };
    const run = await runCases(root, judge);
    const by = Object.fromEntries(run.outcomes.map((o) => [o.name, o]));
    expect(by['flip']?.verdict).toBe('drift');
    expect(by['comment']?.pairs[0]?.decided_by).toBe('hash');
    expect(by['same']?.error).toMatch(/no change/);
    expect(calls).toHaveLength(1);
    expect(run.score).toMatchObject({ breaking: 1, caught: 1, missed: 0, harmless: 2, wronglyFlagged: 0, errors: 1 });
  });
});
