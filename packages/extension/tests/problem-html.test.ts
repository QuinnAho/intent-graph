import { describe, expect, it } from 'vitest';

import { BUILD_PAGE_COMMAND, buildProblemHtml } from '../src/problem-html.js';

const count = (s: string, sub: string): number => s.split(sub).length - 1;

describe('buildProblemHtml', () => {
  it('missing page: says what is wrong and the command once', () => {
    const h = buildProblemHtml({ kind: 'no-page' });
    expect(h).toContain('not built');
    expect(count(h, BUILD_PAGE_COMMAND)).toBe(1);
    expect(BUILD_PAGE_COMMAND).toBe('pnpm --filter @intentgraph/webview build');
    expect(h).toContain('run IntentGraph: Open Graph again'.replace('run', 'Then run'));
    expect(h).toContain('--vscode-foreground');
  });

  it('no node: names Node.js 20 and the next step', () => {
    const h = buildProblemHtml({ kind: 'no-node' });
    expect(h).toContain('Node.js 20 or newer on the PATH');
    expect(h).toContain('Open Graph again');
    expect(h).not.toContain(BUILD_PAGE_COMMAND);
  });

  it('other failure: one sentence and the last 5 lines, escaped', () => {
    const lines = ['L1x', 'L2x', 'L3x', 'L4x', 'L5x', '<script>alert(1)</script>', 'a & b'];
    const h = buildProblemHtml({ kind: 'failed', lines });
    expect(h).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(h).not.toContain('<script');
    expect(h).toContain('a &amp; b');
    expect(h).not.toContain('L2x');
    expect(h).toContain('L3x');
  });

  it('failed with no output says so', () => {
    expect(buildProblemHtml({ kind: 'failed', lines: [] })).toContain('(no output)');
  });

  it('has the strict policy: nothing framed, no script, no handler', () => {
    for (const p of [{ kind: 'no-page' }, { kind: 'no-node' }, { kind: 'failed', lines: ['x'] }] as const) {
      const h = buildProblemHtml(p);
      const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(h)?.[1] ?? '';
      expect(policy).toBe("default-src 'none'; style-src 'unsafe-inline';");
      expect(h).not.toMatch(/<script|<iframe|\son\w+=/i);
    }
  });
});
