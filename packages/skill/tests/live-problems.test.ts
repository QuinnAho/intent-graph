// a spec file that fails to parse is reported in graph.json and the log, never dropped silently.
import { describe, expect, it } from 'vitest';

import type { BuildGraphResult } from '../src/build-graph.js';
import { composeLiveGraph, diffProblems } from '../src/live/compose.js';

const result = (errors: Array<{ file: string; message: string }>, warnings: Array<{ file: string; message: string }> = []) =>
  ({
    nodes: [{ id: 'intent-a', kind: 'intent', title: 'A', body: '{}', confidence: 'asserted', parentId: null, version: 0, createdAt: 0, updatedAt: 0 }],
    edges: [],
    summary: { nodes: 1, edges: 0, specNodes: 1, codeModules: 0, codeSymbols: 0, skeletonSymbols: 0, warnings, errors },
  }) as unknown as BuildGraphResult;

describe('composeLiveGraph problems', () => {
  it('lists parser errors with the path relative to the workspace and the first line of the message', () => {
    const g = composeLiveGraph(result([{ file: 'C:\\ws\\spec\\intents\\bad.md', message: 'frontmatter is not valid YAML: end of the stream\n 1 | ---' }]), new Map(), null, 'C:/ws');
    expect(g.problems).toEqual([{ severity: 'error', file: 'spec/intents/bad.md', message: 'frontmatter is not valid YAML: end of the stream' }]);
  });

  it('lists parser warnings too, after the errors', () => {
    const g = composeLiveGraph(result([{ file: '/ws/spec/a.md', message: 'e' }], [{ file: '/ws/spec/b.md', message: 'w' }]), new Map(), null, '/ws');
    expect(g.problems.map((p) => p.severity)).toEqual(['error', 'warning']);
  });

  it('is an empty list when every file parses, and other nodes keep their status', () => {
    const g = composeLiveGraph(result([]), new Map(), null, '/ws');
    expect(g.problems).toEqual([]);
    expect(g.nodes[0]!.status).toBe('pending');
  });
});

describe('diffProblems', () => {
  const p = (file: string, message = 'bad') => ({ severity: 'error' as const, file, message });
  it('names new problems and fixed files once', () => {
    expect(diffProblems([], [p('a.md')])).toEqual({ added: [p('a.md')], fixed: [] });
    expect(diffProblems([p('a.md')], [p('a.md')])).toEqual({ added: [], fixed: [] });
    expect(diffProblems([p('a.md')], [])).toEqual({ added: [], fixed: ['a.md'] });
    expect(diffProblems([p('a.md', 'x')], [p('a.md', 'y')])).toEqual({ added: [p('a.md', 'y')], fixed: [] });
  });
});
