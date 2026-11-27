// the spec writer is the piece that can damage a user's files, so these tests pin
// that an edit changes the title line, the mirrored heading and updated, and no other byte.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { parseFrontmatter } from '../src/parser/spec-md/frontmatter.js';
import { parseSpecTree } from '../src/parser/spec-md/index.js';
import {
  createIntentFile,
  editSpecSource,
  hashSpecSource,
  newIntentSource,
  readSpecForEdit,
  slugFromTitle,
  writeSpecFileAtomic,
} from '../src/parser/spec-md/writer.js';

const TODAY = '2026-11-27';

const lines = (s: string): string[] => s.split('\n');
function changedLines(a: string, b: string): Array<[string | undefined, string | undefined]> {
  const x = lines(a);
  const y = lines(b);
  const out: Array<[string | undefined, string | undefined]> = [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) out.push([x[i], y[i]]);
  return out;
}

const COMMENTED = [
  '---',
  '# a comment above the id',
  'id: intent-commented',
  'title: Old title # trailing comment on the title',
  'parent: concept-calculator',
  'confidence: asserted',
  '# a comment between keys',
  'owner: quinn   # owner comment',
  'target_kinds: [function, module]',
  'description: >-',
  '  a folded block value',
  '  over two lines',
  'notes: |',
  '  line one',
  '',
  '  line three after a blank',
  'created: 2026-04-29',
  'updated: 2026-04-29 # bumped by the writer',
  '---',
  '',
  '# Old title',
  '',
  'First paragraph.',
  '',
  '---',
  '',
  'After a rule of three dashes.',
  '',
].join('\n');

describe('editSpecSource title', () => {
  it('changes only the title line, the mirrored heading and updated, keeping comments, key order and block values', () => {
    const r = editSpecSource('x.md', COMMENTED, { title: 'New title' }, TODAY);
    if (!r.ok) throw new Error(r.reason);
    expect(changedLines(COMMENTED, r.text)).toEqual([
      ['title: Old title # trailing comment on the title', 'title: New title # trailing comment on the title'],
      ['updated: 2026-04-29 # bumped by the writer', `updated: ${TODAY} # bumped by the writer`],
      ['# Old title', '# New title'],
    ]);
    const parsed = parseFrontmatter('x.md', r.text);
    expect(parsed.minimum.title).toBe('New title');
    expect(parsed.raw['notes']).toBe('line one\n\nline three after a blank\n');
    expect(parsed.body).toContain('\n---\n\nAfter a rule of three dashes.');
  });

  it('keeps windows line endings on every line', () => {
    const crlf = COMMENTED.split('\n').join('\r\n');
    const r = editSpecSource('x.md', crlf, { title: 'New title' }, TODAY);
    if (!r.ok) throw new Error(r.reason);
    expect(r.text.replace(/\r\n/g, '')).not.toContain('\n');
    expect(r.text.split('\r\n').length).toBe(crlf.split('\r\n').length);
    expect(changedLines(crlf.replace(/\r\n/g, '\n'), r.text.replace(/\r\n/g, '\n'))).toHaveLength(3);
  });

  it('adds updated as the last frontmatter line when the file has none', () => {
    const src = '---\r\nid: intent-a\r\ntitle: A\r\nparent: null\r\nconfidence: asserted\r\n---\r\n\r\n# A\r\n\r\nBody.\r\n';
    const r = editSpecSource('a.md', src, { title: 'B' }, TODAY);
    if (!r.ok) throw new Error(r.reason);
    expect(r.text).toBe(`---\r\nid: intent-a\r\ntitle: B\r\nparent: null\r\nconfidence: asserted\r\nupdated: ${TODAY}\r\n---\r\n\r\n# B\r\n\r\nBody.\r\n`);
  });

  it('edits the live fixture file in three lines', () => {
    const fixture = readFileSync(join(__dirname, '../../../tests/fixtures/live-workspace/spec/intents/adds-numbers.md'), 'utf8');
    const r = editSpecSource('a.md', fixture, { title: 'Sums two numbers' }, TODAY);
    if (!r.ok) throw new Error(r.reason);
    const want = fixture
      .replace('title: Adding two numbers gives their sum\r\n', 'title: Sums two numbers\r\n')
      .replace('---\r\n\r\n# Adding two numbers gives their sum\r\n', `updated: ${TODAY}\r\n---\r\n\r\n# Sums two numbers\r\n`);
    expect(want).not.toBe(fixture);
    expect(r.text).toBe(want);
    expect(readSpecForEdit('a.md', r.text).body).toBe('Linked to a test that passes, so the node shows verified.\n');
  });

  it('quotes a title that yaml would read as something else', () => {
    const src = '---\nid: intent-a\ntitle: A\nparent: null\nconfidence: asserted\n---\n# A\n';
    for (const title of ['Colon: inside', '2026', 'yes', '#hash first', "it's \"quoted\"", '- dash first']) {
      const r = editSpecSource('a.md', src, { title }, TODAY);
      if (!r.ok) throw new Error(r.reason);
      expect(parseFrontmatter('a.md', r.text).minimum.title).toBe(title);
    }
  });

  it('replaces a multi-line block title with one line and leaves the next key alone', () => {
    const src = '---\nid: intent-a\ntitle: >-\n  A long\n  title\nparent: null\nconfidence: asserted\n---\n\nBody.\n';
    const r = editSpecSource('a.md', src, { title: 'Short' }, TODAY);
    if (!r.ok) throw new Error(r.reason);
    expect(r.text).toBe(`---\nid: intent-a\ntitle: Short\nparent: null\nconfidence: asserted\nupdated: ${TODAY}\n---\n\nBody.\n`);
  });

  it('does not touch a heading that does not mirror the title', () => {
    const src = '---\nid: intent-a\ntitle: A\nparent: null\nconfidence: asserted\n---\n\n# Something else\n';
    const r = editSpecSource('a.md', src, { title: 'B' }, TODAY);
    if (!r.ok) throw new Error(r.reason);
    expect(r.text.endsWith('\n# Something else\n')).toBe(true);
  });

  it('refuses an empty title, a title with a line break, and a file the parser rejects', () => {
    const src = '---\nid: intent-a\ntitle: A\nparent: null\nconfidence: asserted\n---\n';
    expect(editSpecSource('a.md', src, { title: '   ' }, TODAY).ok).toBe(false);
    expect(editSpecSource('a.md', src, { title: 'two\nlines' }, TODAY).ok).toBe(false);
    expect(editSpecSource('a.md', '---\nid: x\n---\n', { title: 'B' }, TODAY).ok).toBe(false);
    expect(editSpecSource('a.md', 'no frontmatter', { title: 'B' }, TODAY).ok).toBe(false);
  });

  it('returns the same text and changed false when nothing changed', () => {
    const r = editSpecSource('x.md', COMMENTED, { title: 'Old title', body: readSpecForEdit('x.md', COMMENTED).body }, TODAY);
    if (!r.ok) throw new Error(r.reason);
    expect(r.changed).toBe(false);
    expect(r.text).toBe(COMMENTED);
  });
});

describe('editSpecSource body', () => {
  it('reads the body without the mirrored heading, with plain newlines', () => {
    const crlf = COMMENTED.split('\n').join('\r\n');
    const read = readSpecForEdit('x.md', crlf);
    expect(read.title).toBe('Old title');
    expect(read.body).toBe('First paragraph.\n\n---\n\nAfter a rule of three dashes.\n');
  });

  it('writes a new body in the file line endings and keeps the frontmatter and heading bytes', () => {
    const crlf = COMMENTED.split('\n').join('\r\n');
    const r = editSpecSource('x.md', crlf, { body: 'New text.\n\n---\n\nStill after a rule.\n' }, TODAY);
    if (!r.ok) throw new Error(r.reason);
    expect(r.text.replace(/\r\n/g, '')).not.toContain('\n');
    const head = crlf.slice(0, crlf.indexOf('# Old title\r\n\r\n') + '# Old title\r\n\r\n'.length);
    expect(r.text.startsWith(head.replace('updated: 2026-04-29', `updated: ${TODAY}`))).toBe(true);
    expect(r.text.endsWith('# Old title\r\n\r\nNew text.\r\n\r\n---\r\n\r\nStill after a rule.\r\n')).toBe(true);
    expect(readSpecForEdit('x.md', r.text).body).toBe('New text.\n\n---\n\nStill after a rule.\n');
  });

  it('accepts a body that starts with three dashes because the frontmatter closes first', () => {
    const src = '---\nid: intent-a\ntitle: A\nparent: null\nconfidence: asserted\n---\n\n# A\n\nx\n';
    const r = editSpecSource('a.md', src, { body: '---\nnot: frontmatter\n---\n' }, TODAY);
    if (!r.ok) throw new Error(r.reason);
    const parsed = parseFrontmatter('a.md', r.text);
    expect(Object.keys(parsed.raw)).toEqual(['id', 'title', 'parent', 'confidence', 'updated']);
    expect(parsed.body).toContain('not: frontmatter');
  });
});

describe('slugFromTitle', () => {
  it('lowercases, folds accents and joins words with dashes', () => {
    expect(slugFromTitle('Divides by zero safely!', 60)).toBe('divides-by-zero-safely');
    expect(slugFromTitle('  Café  über   alles ', 60)).toBe('cafe-uber-alles');
    expect(slugFromTitle('!!!', 60)).toBe('');
  });

  it('cuts a long title at a word break under the limit', () => {
    const s = slugFromTitle('one two three four five six seven eight nine ten', 20);
    expect(s.length).toBeLessThanOrEqual(20);
    expect(s).toBe('one-two-three-four');
  });
});

describe('newIntentSource', () => {
  it('has the adr 0009 minimum, asserted confidence, draft status and today dates, and parses', () => {
    const r = newIntentSource({ title: 'Divides by zero: safely', parent: 'concept-calculator', today: TODAY });
    if (!r.ok) throw new Error(r.reason);
    expect(r.id).toBe('intent-divides-by-zero-safely');
    expect(r.slug).toBe('divides-by-zero-safely');
    const p = parseFrontmatter('n.md', r.text);
    expect(p.minimum).toEqual({ id: r.id, title: 'Divides by zero: safely', parent: 'concept-calculator', confidence: 'asserted' });
    expect(p.raw['status']).toBe('draft');
    expect(Object.keys(p.raw)).toEqual(['id', 'title', 'parent', 'confidence', 'status', 'created', 'updated']);
    expect(r.text).toContain(`created: ${TODAY}\nupdated: ${TODAY}\n`);
    expect(r.text.endsWith('\n# Divides by zero: safely\n')).toBe(true);
  });

  it('refuses an empty title or one with no letters or numbers', () => {
    expect(newIntentSource({ title: '  ', parent: 'concept-a', today: TODAY }).ok).toBe(false);
    expect(newIntentSource({ title: '???', parent: 'concept-a', today: TODAY }).ok).toBe(false);
  });
});

describe('files on disk', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tempSpec = (): string => {
    const d = mkdtempSync(join(tmpdir(), 'ig-writer-'));
    dirs.push(d);
    mkdirSync(join(d, 'spec', 'concepts'), { recursive: true });
    writeFileSync(join(d, 'spec', 'concepts', 'c.md'), '---\nid: concept-c\ntitle: C\nparent: null\nconfidence: asserted\n---\n');
    return d;
  };

  it('creates an intent file parseSpecTree accepts, and refuses the same slug twice', () => {
    const d = tempSpec();
    const first = createIntentFile(join(d, 'spec'), { title: 'Rounds to cents', parent: 'concept-c', today: TODAY });
    if (!first.ok) throw new Error(first.reason);
    expect(first.file).toBe(join(d, 'spec', 'intents', 'rounds-to-cents.md'));
    const tree = parseSpecTree(join(d, 'spec'));
    expect(tree.errors).toEqual([]);
    expect(tree.nodes.find((n) => n.id === 'intent-rounds-to-cents')?.parentId).toBe('concept-c');
    const before = readFileSync(first.file, 'utf8');
    const again = createIntentFile(join(d, 'spec'), { title: 'Rounds to Cents!', parent: 'concept-c', today: TODAY });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('duplicate');
    expect(readFileSync(first.file, 'utf8')).toBe(before);
    expect(readdirSync(join(d, 'spec', 'intents'))).toEqual(['rounds-to-cents.md']);
  });

  it('writes atomically and leaves no temp file behind', () => {
    const d = tempSpec();
    const f = join(d, 'spec', 'concepts', 'c.md');
    writeSpecFileAtomic(f, 'new\r\ntext');
    expect(readFileSync(f, 'utf8')).toBe('new\r\ntext');
    expect(readdirSync(join(d, 'spec', 'concepts'))).toEqual(['c.md']);
  });

  it('hashes bytes, so a line ending change is a different hash', () => {
    expect(hashSpecSource('a\n')).not.toBe(hashSpecSource('a\r\n'));
    expect(hashSpecSource(Buffer.from('a\n'))).toBe(hashSpecSource('a\n'));
  });
});
