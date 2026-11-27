// Tests for the normalised syntax hash (ADR-0030 `@sig`).
// The hash must ignore whitespace and comments, and must move on any logic change.

import { describe, expect, it } from 'vitest';

import {
  signatureOf,
  listTopLevelSymbols,
  sigMatches,
} from '../src/parser/diff/signature-hash.js';

const BASE = `import { x } from './x.js';

// adds two numbers
export function add(a: number, b: number): number {
  return a + b;
}

export const LIMIT = 10;

export class Box {
  open(): string {
    return 'open';
  }
}
`;

const REFORMATTED = `import { x } from './x.js';
/* a block comment the hash must ignore */
export function add(
  a: number,
  b: number,
): number {
  // inner comment
  return a+b;
}
export const LIMIT    = 10;
export class Box { open(): string { return 'open'; } }
`;

describe('signatureOf', () => {
  it('ignores whitespace and comments for a named symbol', () => {
    const before = signatureOf('a.ts', BASE, 'add');
    const after = signatureOf('a.ts', REFORMATTED, 'add');
    expect(before.found).toBe(true);
    expect(after.found).toBe(true);
    expect(after.hash).toBe(before.hash);
  });

  it('ignores whitespace and comments for the whole file', () => {
    expect(signatureOf('a.ts', REFORMATTED).hash).toBe(signatureOf('a.ts', BASE).hash);
  });

  it('changes when an operator changes', () => {
    const changed = BASE.replace('return a + b;', 'return a - b;');
    expect(signatureOf('a.ts', changed, 'add').hash).not.toBe(signatureOf('a.ts', BASE, 'add').hash);
  });

  it('changes when a literal changes', () => {
    const changed = BASE.replace('LIMIT = 10', 'LIMIT = 11');
    expect(signatureOf('a.ts', changed, 'LIMIT').hash).not.toBe(
      signatureOf('a.ts', BASE, 'LIMIT').hash,
    );
  });

  it('changes when a parameter type changes', () => {
    const changed = BASE.replace('b: number)', 'b: string)');
    expect(signatureOf('a.ts', changed, 'add').hash).not.toBe(signatureOf('a.ts', BASE, 'add').hash);
  });

  it('changes when the export is dropped', () => {
    const changed = BASE.replace('export function add', 'function add');
    expect(signatureOf('a.ts', changed, 'add').hash).not.toBe(signatureOf('a.ts', BASE, 'add').hash);
  });

  it('a change in one symbol leaves another symbol alone', () => {
    const changed = BASE.replace('return a + b;', 'return a * b;');
    expect(signatureOf('a.ts', changed, 'LIMIT').hash).toBe(signatureOf('a.ts', BASE, 'LIMIT').hash);
  });

  it('finds a class method by dotted name', () => {
    const before = signatureOf('a.ts', BASE, 'Box.open');
    expect(before.found).toBe(true);
    const changed = BASE.replace("return 'open';", "return 'shut';");
    expect(signatureOf('a.ts', changed, 'Box.open').hash).not.toBe(before.hash);
  });

  it('reports a missing symbol instead of throwing', () => {
    const r = signatureOf('a.ts', BASE, 'nope');
    expect(r.found).toBe(false);
    expect(r.hash).toBe('');
  });

  it('hashes non-code files on text with whitespace runs collapsed', () => {
    expect(signatureOf('n.md', 'a  b\n\nc').hash).toBe(signatureOf('n.md', 'a b c\n').hash);
    expect(signatureOf('n.md', 'a b').hash).not.toBe(signatureOf('n.md', 'a c').hash);
  });

  it('is deterministic and hex', () => {
    const a = signatureOf('a.ts', BASE, 'add').hash;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(signatureOf('a.ts', BASE, 'add').hash).toBe(a);
  });

  it('works on javascript too', () => {
    const js = 'function f(a) { return a + 1; }\n';
    const jsFmt = 'function f(a){\n  // c\n  return a+1\n;}\n';
    expect(signatureOf('f.js', jsFmt, 'f').hash).toBe(signatureOf('f.js', js, 'f').hash);
  });
});

describe('listTopLevelSymbols', () => {
  it('lists names with line ranges', () => {
    const syms = listTopLevelSymbols('a.ts', BASE);
    expect(syms.map((s) => s.name)).toEqual(['add', 'LIMIT', 'Box', 'Box.open']);
    const add = syms.find((s) => s.name === 'add');
    // the export keyword sits on line 4 (1-based)
    expect(add?.startLine).toBe(4);
    expect(add?.endLine).toBe(6);
  });
});

describe('sigMatches', () => {
  it('compares an anchor prefix of eight or more hex chars', () => {
    const h = signatureOf('a.ts', BASE, 'add').hash;
    expect(sigMatches(h.slice(0, 8), h)).toBe(true);
    expect(sigMatches(h.slice(0, 7), h)).toBe(false);
    expect(sigMatches('deadbeef', h)).toBe(h.startsWith('deadbeef'));
  });
});
