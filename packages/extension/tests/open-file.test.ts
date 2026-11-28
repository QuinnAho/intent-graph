import { describe, expect, it } from 'vitest';

import { decideOpen, otherColumn } from '../src/open-file.js';

describe('decideOpen', () => {
  it('takes a workspace path and a line', () => {
    expect(decideOpen({ type: 'intentgraph.open', path: 'src/math.ts', line: 3 })).toEqual({ ok: true, segments: ['src', 'math.ts'], line: 3 });
  });

  it('opens at the top when the line is missing', () => {
    expect(decideOpen({ type: 'intentgraph.open', path: 'src/math.ts' })).toEqual({ ok: true, segments: ['src', 'math.ts'], line: 1 });
  });

  it('keeps a .. that stays inside the workspace', () => {
    expect(decideOpen({ type: 'intentgraph.open', path: 'src/../tests/./math.test.ts', line: 2 })).toEqual({ ok: true, segments: ['tests', 'math.test.ts'], line: 2 });
  });

  it('refuses a path that leaves the workspace', () => {
    for (const path of ['../secret.txt', 'src/../../secret.txt', '..', 'a/b/../../../c']) {
      expect(decideOpen({ type: 'intentgraph.open', path }).ok, path).toBe(false);
    }
  });

  it('refuses an absolute path', () => {
    for (const path of ['/etc/passwd', 'C:/Windows/win.ini', 'c:\\Windows\\win.ini', '\\\\server\\share\\x', 'C:x', 'file:///etc/passwd']) {
      expect(decideOpen({ type: 'intentgraph.open', path }).ok, path).toBe(false);
    }
  });

  it('refuses backslashes, an empty path and the workspace root itself', () => {
    for (const path of ['src\\math.ts', '', '.', './', 'src/..']) {
      expect(decideOpen({ type: 'intentgraph.open', path }).ok, path).toBe(false);
    }
  });

  it('refuses anything that is not a string path', () => {
    for (const path of [undefined, null, 3, ['src/math.ts'], { p: 'src/math.ts' }]) {
      expect(decideOpen({ type: 'intentgraph.open', path }).ok).toBe(false);
    }
    expect(decideOpen(null).ok).toBe(false);
    expect(decideOpen('src/math.ts').ok).toBe(false);
  });

  it('refuses a message of another type', () => {
    expect(decideOpen({ type: 'intentgraph.ready', path: 'src/math.ts' }).ok).toBe(false);
  });

  it('refuses a line that is not a whole number from 1', () => {
    for (const line of [0, -1, 1.5, '3', Number.NaN, Number.POSITIVE_INFINITY, null]) {
      expect(decideOpen({ type: 'intentgraph.open', path: 'src/math.ts', line }).ok, String(line)).toBe(false);
    }
  });

  it('refuses a nul byte in the path', () => {
    expect(decideOpen({ type: 'intentgraph.open', path: 'src/ma\0th.ts' }).ok).toBe(false);
  });
});

describe('otherColumn', () => {
  it('opens beside the panel, never on top of it', () => {
    expect(otherColumn(2)).toBe(1);
    expect(otherColumn(1)).toBe(2);
    expect(otherColumn(3)).toBe(1);
    expect(otherColumn(undefined)).toBe(1);
  });
});
