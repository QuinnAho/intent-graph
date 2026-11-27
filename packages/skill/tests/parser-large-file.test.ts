// A source file longer than tree-sitter's default 32 KiB input buffer must still parse.
//
// Found on 2026-11-27: a 40 kb file came back from build-graph as
// "tree-sitter parse failed: Invalid argument" and the graph had no nodes from it.
// The drift check had the same fault in its own parse call (drift-fixes.test.ts).

import { describe, expect, it } from 'vitest';

import { ParseCache } from '../src/parser/cache.js';
import { extractCodeSymbols, parseFile } from '../src/parser/tree-sitter.js';

function sourceOf(minBytes: number): { content: string; count: number } {
  let content = '';
  let count = 0;
  while (Buffer.byteLength(content, 'utf8') < minBytes) {
    content += `export function big${count}(x: number): number {\n  return x + ${count};\n}\n`;
    count += 1;
  }
  return { content, count };
}

describe('parseFile() on a file over 32 KiB', () => {
  it('parses a 40 kb file and finds every top-level function', () => {
    const { content, count } = sourceOf(40_000);
    const parsed = parseFile('big.ts', content, new ParseCache());
    expect(parsed).not.toBeNull();
    expect(parsed!.clean).toBe(true);
    expect(extractCodeSymbols('big.ts', parsed!)).toHaveLength(count);
  });

  it('parses a file past the limit that holds multi-byte text', () => {
    // bytes and string length differ here, which is where a buffer sized by one
    // and filled by the other would fall short
    const { content, count } = sourceOf(33_000);
    const withAccents = `// ${'é'.repeat(2000)}\n${content}`;
    const parsed = parseFile('accents.ts', withAccents, new ParseCache());
    expect(parsed).not.toBeNull();
    expect(parsed!.clean).toBe(true);
    expect(extractCodeSymbols('accents.ts', parsed!)).toHaveLength(count);
  });

  it('still parses a small file the same way', () => {
    const { content, count } = sourceOf(500);
    const parsed = parseFile('small.ts', content, new ParseCache());
    expect(parsed!.clean).toBe(true);
    expect(extractCodeSymbols('small.ts', parsed!)).toHaveLength(count);
  });
});
