// maps one vitest json report back onto spec nodes by file and test name.
import { describe, expect, it } from 'vitest';

import { mapCheckStatus, needsTestRun, toRelative } from '../src/live/check-status.js';
import type { Anchor } from '../src/parser/spec-md/anchors.js';

const root = 'C:/ws';
const report = {
  testResults: [
    {
      name: 'C:\\ws\\tests\\math.test.ts',
      status: 'passed',
      assertionResults: [
        { title: 'adds two numbers', fullName: 'math adds two numbers', status: 'passed' },
        { title: 'skips this', fullName: 'math skips this', status: 'skipped' },
      ],
    },
    {
      name: 'C:/ws/tests/flip.test.ts',
      status: 'failed',
      assertionResults: [
        { title: 'greets', fullName: 'greets', status: 'failed' },
        { title: 'waves', fullName: 'waves', status: 'passed' },
      ],
    },
    { name: 'C:/ws/tests/broken.test.ts', status: 'failed', assertionResults: [] },
  ],
};
const a = (path: string, name?: string): Anchor => ({ raw: name ? `${path}#${name}` : path, path, ...(name ? { name } : {}) });

describe('mapCheckStatus', () => {
  it('is pending with no verified_by', () => {
    expect(mapCheckStatus([], report, root).status).toBe('pending');
  });

  it('is pending before any run', () => {
    expect(mapCheckStatus([a('tests/math.test.ts')], null, root).status).toBe('pending');
  });

  it('is verified when a named test passes, by title or full name', () => {
    expect(mapCheckStatus([a('tests/math.test.ts', 'adds two numbers')], report, root).status).toBe('verified');
    expect(mapCheckStatus([a('tests/math.test.ts', 'math adds two numbers')], report, root).status).toBe('verified');
  });

  it('is failed when any linked test fails', () => {
    expect(mapCheckStatus([a('tests/math.test.ts', 'adds two numbers'), a('tests/flip.test.ts')], report, root).status).toBe('failed');
    expect(mapCheckStatus([a('tests/flip.test.ts', 'greets')], report, root).status).toBe('failed');
  });

  it('is verified for a named passing test in a file with other failures', () => {
    expect(mapCheckStatus([a('tests/flip.test.ts', 'waves')], report, root).status).toBe('verified');
  });

  it('is failed when a whole file fails to load', () => {
    expect(mapCheckStatus([a('tests/broken.test.ts')], report, root).status).toBe('failed');
  });

  it('is pending with a reason when the test is missing or skipped', () => {
    const missing = mapCheckStatus([a('tests/nope.test.ts')], report, root);
    expect(missing.status).toBe('pending');
    expect(missing.reasons[0]).toMatch(/not found/);
    expect(mapCheckStatus([a('tests/math.test.ts', 'skips this')], report, root).status).toBe('pending');
  });

  it('counts a whole file as verified only when every test in it passed', () => {
    expect(mapCheckStatus([a('tests/math.test.ts')], report, root).status).toBe('pending');
  });
});

describe('toRelative', () => {
  it('normalises windows paths against the root', () => {
    expect(toRelative('C:\\ws\\tests\\a.ts', 'C:/ws')).toBe('tests/a.ts');
    expect(toRelative('c:/ws/tests/a.ts', 'C:\\ws\\')).toBe('tests/a.ts');
  });
});

describe('needsTestRun', () => {
  const linked = { tests: new Set(['tests/a.test.ts']), realized: new Set(['src/a.ts']) };
  it('runs when a linked test or a realized file changed', () => {
    expect(needsTestRun(new Set(['tests/a.test.ts']), linked, linked)).toBe(true);
    expect(needsTestRun(new Set(['src/a.ts']), linked, linked)).toBe(true);
  });
  it('runs when the set of linked tests changed', () => {
    expect(needsTestRun(new Set(['spec/intents/x.md']), linked, { tests: new Set(['tests/b.test.ts']), realized: linked.realized })).toBe(true);
  });
  it('skips unrelated edits', () => {
    expect(needsTestRun(new Set(['spec/intents/x.md', 'src/other.ts']), linked, linked)).toBe(false);
  });
});
