// Tests for the static-graph build pipeline.
//
// Coverage:
//   - build() round-trips against the real /spec corpus (the team's own
//     intents) and a small TypeScript fixture, producing the expected node
//     mix (intents + code modules + code symbols).
//   - The summary counts match the actual node/edge arrays.
//   - toGraphJson() emits a stable shape with the expected top-level keys.
//   - writeToDatabase() truncates and re-inserts cleanly (idempotent).
//   - Spec parse errors are surfaced (not swallowed) so the seed script
//     can exit non-zero.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';

import { build, toGraphJson, writeToDatabase } from '../src/build-graph.js';
import { initDatabase } from '../src/db/init.js';

let tmpRoots: string[] = [];

function mkFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'ig-buildgraph-'));
  tmpRoots.push(root);
  // Minimal spec tree.
  for (const kind of ['intents', 'constraints', 'decisions', 'concepts']) {
    mkdirSync(join(root, 'spec', kind), { recursive: true });
  }
  writeFileSync(
    join(root, 'spec', 'intents', 'intent-foo.md'),
    `---
id: intent-foo
title: Foo intent
parent: null
confidence: asserted
---

A small fixture intent.
`,
  );
  writeFileSync(
    join(root, 'spec', 'concepts', 'concept-bar.md'),
    `---
id: concept-bar
title: Bar concept
parent: null
confidence: asserted
regeneration_scope: atomic
---

A small fixture concept.
`,
  );

  // Minimal source tree: one TS file with two top-level declarations.
  mkdirSync(join(root, 'packages', 'sample', 'src'), { recursive: true });
  writeFileSync(
    join(root, 'packages', 'sample', 'src', 'sample.ts'),
    `export function add(a: number, b: number): number { return a + b; }
export const PI = 3.14;
`,
  );
  return root;
}

afterEach(() => {
  for (const r of tmpRoots) {
    try {
      rmSync(r, { recursive: true, force: true });
    } catch {
      /* swallow */
    }
  }
  tmpRoots = [];
});

describe('build()', () => {
  it('emits nodes from spec and code together', () => {
    const root = mkFixture();
    const result = build({ repoRoot: root });

    expect(result.summary.specNodes).toBe(2); // intent + concept
    expect(result.summary.codeModules).toBeGreaterThanOrEqual(1);
    expect(result.summary.codeSymbols).toBeGreaterThanOrEqual(2); // add + PI
    expect(result.summary.nodes).toBe(result.nodes.length);
    expect(result.summary.edges).toBe(result.edges.length);
  });

  it('emits a produced_by edge from each code_symbol to its code_module', () => {
    const root = mkFixture();
    const result = build({ repoRoot: root });

    const codeSymbolIds = new Set(
      result.nodes.filter((n) => n.kind === 'code_symbol').map((n) => n.id),
    );
    const producedByEdges = result.edges.filter((e) => e.kind === 'produced_by');
    expect(producedByEdges.length).toBe(codeSymbolIds.size);
    for (const edge of producedByEdges) {
      expect(codeSymbolIds.has(edge.src)).toBe(true);
    }
  });

  it('does NOT auto-emit realizes edges from code_symbol to intent at L0', () => {
    // L0's job is to surface the symbols and intents separately; the
    // code_symbol → intent realizes edge is phase-4 work (proposer-anchored).
    const root = mkFixture();
    const result = build({ repoRoot: root });

    const symbolToIntentRealizes = result.edges.filter((e) => {
      const srcKind = result.nodes.find((n) => n.id === e.src)?.kind;
      const dstKind = result.nodes.find((n) => n.id === e.dst)?.kind;
      return e.kind === 'realizes' && srcKind === 'code_symbol' && dstKind === 'intent';
    });
    expect(symbolToIntentRealizes.length).toBe(0);
  });

  it('surfaces spec parse errors in the summary rather than throwing', () => {
    const root = mkFixture();
    // Add a malformed spec file.
    writeFileSync(
      join(root, 'spec', 'intents', 'intent-broken.md'),
      'no frontmatter at all\n',
    );
    const result = build({ repoRoot: root });
    expect(result.summary.errors.length).toBeGreaterThan(0);
    expect(result.summary.errors[0]?.file).toContain('intent-broken.md');
  });
});

describe('toGraphJson()', () => {
  it('emits the documented L0 export envelope', () => {
    const root = mkFixture();
    const result = build({ repoRoot: root });
    const text = toGraphJson(result);
    const parsed = JSON.parse(text) as {
      _format: string;
      _version: number;
      summary: Record<string, number>;
      nodes: unknown[];
      edges: unknown[];
    };
    expect(parsed._format).toBe('intentgraph-l0-export');
    expect(parsed._version).toBe(1);
    expect(parsed.nodes.length).toBe(result.nodes.length);
    expect(parsed.edges.length).toBe(result.edges.length);
    expect(parsed.summary['nodes']).toBe(result.summary.nodes);
  });

  it('parses node body strings back to JSON in the export', () => {
    const root = mkFixture();
    const result = build({ repoRoot: root });
    const parsed = JSON.parse(toGraphJson(result)) as {
      nodes: Array<{ kind: string; body: unknown }>;
    };
    // body is parsed JSON (not a string) — readers consume it as objects.
    for (const node of parsed.nodes) {
      expect(typeof node.body).toBe('object');
    }
  });
});

describe('writeToDatabase()', () => {
  it('seeds an in-memory DB and is idempotent on rerun', () => {
    const root = mkFixture();
    const result = build({ repoRoot: root });
    const dbInit = initDatabase(':memory:', {
      skipBackup: true,
      skipVec: true,
    });

    try {
      writeToDatabase(dbInit.client, result);
      const firstNodeCount = dbInit.client.raw
        .prepare('SELECT COUNT(*) AS n FROM node')
        .get() as { n: number };
      expect(firstNodeCount.n).toBe(result.nodes.length);

      // Rerun should truncate-and-reinsert, not double up.
      writeToDatabase(dbInit.client, result);
      const secondNodeCount = dbInit.client.raw
        .prepare('SELECT COUNT(*) AS n FROM node')
        .get() as { n: number };
      expect(secondNodeCount.n).toBe(result.nodes.length);
    } finally {
      dbInit.client.close();
    }
  });
});
