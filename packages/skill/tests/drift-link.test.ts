// Tests for anchor parsing, unified-diff parsing and change-to-node linking.

import { describe, expect, it } from 'vitest';

import { parseAnchor } from '../src/drift/anchors.js';
import { parseUnifiedDiff } from '../src/drift/unified-diff.js';
import { changedSymbols, linkChanges, type FileChange, type SpecNode } from '../src/drift/link.js';
import { signatureOf } from '../src/parser/diff/signature-hash.js';

describe('parseAnchor', () => {
  it('reads path, symbol and sig', () => {
    expect(parseAnchor('src/a.ts#add@9f2c1a7b')).toEqual({
      raw: 'src/a.ts#add@9f2c1a7b',
      path: 'src/a.ts',
      symbol: 'add',
      sig: '9f2c1a7b',
    });
  });
  it('reads a whole-file target', () => {
    expect(parseAnchor('src/a.ts')).toMatchObject({ path: 'src/a.ts', symbol: null, sig: null });
  });
  it('reads a dotted member and drops a leading ./', () => {
    expect(parseAnchor('./src/a.ts#Box.open')).toMatchObject({ path: 'src/a.ts', symbol: 'Box.open' });
  });
  it('treats a short or non-hex tail as part of the symbol, not a sig', () => {
    expect(parseAnchor('src/a.ts#f@abc')).toMatchObject({ symbol: 'f@abc', sig: null });
  });
  it('rejects absolute and backslash paths', () => {
    expect(parseAnchor('/etc/passwd')).toBeNull();
    expect(parseAnchor('C:/x.ts')).toBeNull();
    expect(parseAnchor('src\\a.ts')).toBeNull();
    expect(parseAnchor('../up.ts')).toBeNull();
    expect(parseAnchor('')).toBeNull();
  });
});

const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@ header
 export function add(a: number, b: number): number {
-  return a + b;
+  return a - b;
 }
@@ -10 +10,2 @@
-x
+y
+z
diff --git a/new.md b/new.md
new file mode 100644
--- /dev/null
+++ b/new.md
@@ -0,0 +1 @@
+hello
`;

describe('parseUnifiedDiff', () => {
  it('splits files and hunks with line numbers', () => {
    const files = parseUnifiedDiff(DIFF);
    expect([...files.keys()]).toEqual(['src/a.ts', 'new.md']);
    const hunks = files.get('src/a.ts') ?? [];
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toMatchObject({ oldStart: 1, oldLines: 3, newStart: 1, newLines: 3 });
    expect(hunks[0]?.text).toContain('-  return a + b;');
    expect(hunks[1]).toMatchObject({ oldStart: 10, oldLines: 1, newStart: 10, newLines: 2 });
    expect(files.get('new.md')?.[0]).toMatchObject({ oldStart: 0, oldLines: 0, newStart: 1, newLines: 1 });
  });
});

const BEFORE = `// math helpers
export function add(a: number, b: number): number {
  return a + b;
}

export function mul(a: number, b: number): number {
  return a * b;
}
`;

function change(path: string, before: string | null, after: string | null, diff: string): FileChange {
  return {
    path,
    status: before === null ? 'A' : after === null ? 'D' : 'M',
    before,
    after,
    binary: false,
    hunks: parseUnifiedDiff(diff).get(path) ?? [],
  };
}

const ADD_DIFF = `--- a/src/m.ts
+++ b/src/m.ts
@@ -2,3 +2,3 @@
 export function add(a: number, b: number): number {
-  return a + b;
+  return a - b;
 }
`;

function node(id: string, anchors: string[]): SpecNode {
  return {
    id,
    title: id,
    text: `${id} text`,
    file: `spec/intents/${id}.md`,
    realizedBy: anchors.map((a) => {
      const p = parseAnchor(a);
      if (!p) throw new Error(a);
      return p;
    }),
  };
}

describe('changedSymbols', () => {
  it('names only symbols whose normalised hash moved, plus added and removed ones', () => {
    const after = BEFORE.replace('a + b', 'a - b').replace('// math helpers', '// helpers') + 'export const Z = 1;\n';
    expect(changedSymbols('src/m.ts', BEFORE, after)).toEqual(['add', 'Z']);
    expect(changedSymbols('src/m.ts', BEFORE, BEFORE.replace('export function mul', 'export function times'))).toEqual(['times', 'mul']);
  });
});

describe('linkChanges', () => {
  const after = BEFORE.replace('a + b', 'a - b');

  it('links a changed bound symbol and keeps only its hunks', () => {
    const r = linkChanges([change('src/m.ts', BEFORE, after, ADD_DIFF)], [node('intent-add', ['src/m.ts#add'])]);
    expect(r.pairs).toHaveLength(1);
    const p = r.pairs[0];
    expect(p?.nodeId).toBe('intent-add');
    expect(p?.logicChanged).toBe(true);
    expect(p?.targets[0]).toMatchObject({ path: 'src/m.ts', symbol: 'add', changed: true, missing: false });
    expect(p?.hunks).toHaveLength(1);
    expect(r.noLinkedIntent).toEqual([]);
    expect(r.files[0]).toMatchObject({ path: 'src/m.ts', changedSymbols: ['add'], linkedNodeIds: ['intent-add'] });
  });

  it('makes no pair when the bound symbol is untouched', () => {
    const r = linkChanges([change('src/m.ts', BEFORE, after, ADD_DIFF)], [node('intent-mul', ['src/m.ts#mul'])]);
    expect(r.pairs).toEqual([]);
    // the file is still bound to a node, so it is not "no linked intent"
    expect(r.noLinkedIntent).toEqual([]);
    expect(r.files[0]?.unlinkedSymbols).toEqual(['add']);
  });

  it('a comment-only edit inside a bound symbol is a pair with no logic change', () => {
    const commented = BEFORE.replace('  return a + b;', '  // sum\n  return a + b;');
    const diff = `--- a/src/m.ts\n+++ b/src/m.ts\n@@ -3 +3,2 @@\n+  // sum\n   return a + b;\n`;
    const r = linkChanges([change('src/m.ts', BEFORE, commented, diff)], [node('intent-add', ['src/m.ts#add'])]);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]?.logicChanged).toBe(false);
  });

  it('reports a changed file with no node as no linked intent', () => {
    const r = linkChanges(
      [change('src/m.ts', BEFORE, after, ADD_DIFF), change('README.md', 'a', 'b', '--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-a\n+b\n')],
      [node('intent-add', ['src/m.ts#add'])],
    );
    expect(r.noLinkedIntent).toEqual(['README.md']);
    expect(r.files.map((f) => f.path)).toEqual(['src/m.ts', 'README.md']);
  });

  it('links a whole-file anchor and judges by file hash', () => {
    const reformatted = BEFORE.replace('return a + b;', 'return a+b;');
    const diff = '--- a/src/m.ts\n+++ b/src/m.ts\n@@ -3 +3 @@\n-  return a + b;\n+  return a+b;\n';
    const r = linkChanges([change('src/m.ts', BEFORE, reformatted, diff)], [node('intent-file', ['src/m.ts'])]);
    expect(r.pairs[0]?.logicChanged).toBe(false);
    expect(r.pairs[0]?.hunks).toHaveLength(1);
  });

  it('marks a removed bound symbol as changed and missing, with every hunk of the file', () => {
    const renamed = BEFORE.replace('function add', 'function plus');
    const diff = '--- a/src/m.ts\n+++ b/src/m.ts\n@@ -2 +2 @@\n-export function add(a: number, b: number): number {\n+export function plus(a: number, b: number): number {\n';
    const r = linkChanges([change('src/m.ts', BEFORE, renamed, diff)], [node('intent-add', ['src/m.ts#add'])]);
    expect(r.pairs[0]?.targets[0]).toMatchObject({ changed: true, missing: true });
    expect(r.pairs[0]?.logicChanged).toBe(true);
  });

  it('a deleted bound file is changed and missing', () => {
    const r = linkChanges([change('src/m.ts', BEFORE, null, '')], [node('intent-file', ['src/m.ts'])]);
    expect(r.pairs[0]?.targets[0]).toMatchObject({ changed: true, missing: true, after_hash: null });
  });

  it('treats a change back to the confirmed @sig as no logic change', () => {
    const sig = signatureOf('src/m.ts', after, 'add').hash.slice(0, 12);
    const r = linkChanges([change('src/m.ts', BEFORE, after, ADD_DIFF)], [node('intent-add', [`src/m.ts#add@${sig}`])]);
    expect(r.pairs[0]?.logicChanged).toBe(false);
  });

  it('groups several targets of one node into one pair', () => {
    const both = after.replace('a * b', 'a * b * 1');
    const diff = `--- a/src/m.ts\n+++ b/src/m.ts\n@@ -3 +3 @@\n-  return a + b;\n+  return a - b;\n@@ -7 +7 @@\n-  return a * b;\n+  return a * b * 1;\n`;
    const r = linkChanges([change('src/m.ts', BEFORE, both, diff)], [node('intent-math', ['src/m.ts#add', 'src/m.ts#mul'])]);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]?.targets).toHaveLength(2);
    expect(r.pairs[0]?.hunks).toHaveLength(2);
  });
});
