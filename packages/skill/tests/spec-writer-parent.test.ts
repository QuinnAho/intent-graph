// a parent edit is the write behind every wire on the graph, so these tests pin that it
// changes the parent line and updated, and no other byte, whatever the file looks like.
import { describe, expect, it } from 'vitest';

import { parseFrontmatter } from '../src/parser/spec-md/frontmatter.js';
import { editSpecSource } from '../src/parser/spec-md/writer.js';

const TODAY = '2026-11-27';

// comments, an odd key order, a folded and a literal block value
const ODD = [
  '---',
  '# a comment above everything',
  'confidence: asserted',
  'title: Adds numbers',
  'id: intent-odd',
  'parent: concept-calculator   # where it lives',
  '# a comment between keys',
  'description: >-',
  '  a folded block value',
  '  over two lines',
  'notes: |',
  '  line one',
  '',
  '  line three after a blank',
  'updated: 2026-04-29 # bumped by the writer',
  'created: 2026-04-29',
  '---',
  '',
  '# Adds numbers',
  '',
  'Body that stays.',
  '',
];

const VARIANTS: ReadonlyArray<[string, string]> = [
  ['lf', ODD.join('\n')],
  ['crlf', ODD.join('\r\n')],
];

function expectOnly(before: string, after: string, swaps: Array<[string, string]>): void {
  let want = before;
  for (const [a, b] of swaps) {
    expect(want.includes(a)).toBe(true);
    want = want.replace(a, b);
  }
  expect(after).toBe(want);
}

describe('editSpecSource with a parent', () => {
  for (const [name, src] of VARIANTS) {
    const eol = name === 'crlf' ? '\r\n' : '\n';
    it(`changes a parent and keeps every other byte (${name})`, () => {
      const r = editSpecSource('odd.md', src, { parent: 'concept-other' }, TODAY);
      expect(r.ok && r.changed).toBe(true);
      if (!r.ok) return;
      expectOnly(src, r.text, [
        ['parent: concept-calculator   # where it lives', 'parent: concept-other   # where it lives'],
        ['updated: 2026-04-29 # bumped by the writer', `updated: ${TODAY} # bumped by the writer`],
      ]);
      expect(parseFrontmatter('odd.md', r.text).minimum.parent).toBe('concept-other');
      expect(r.text.split(eol).length).toBe(src.split(eol).length);
    });

    it(`removes a parent as parent: null and keeps every other byte (${name})`, () => {
      const r = editSpecSource('odd.md', src, { parent: null }, TODAY);
      expect(r.ok && r.changed).toBe(true);
      if (!r.ok) return;
      expectOnly(src, r.text, [
        ['parent: concept-calculator   # where it lives', 'parent: null   # where it lives'],
        ['updated: 2026-04-29 # bumped by the writer', `updated: ${TODAY} # bumped by the writer`],
      ]);
      expect(parseFrontmatter('odd.md', r.text).minimum.parent).toBeNull();
    });

    it(`adds a parent to a node that had none and keeps every other byte (${name})`, () => {
      const none = src.replace('parent: concept-calculator   # where it lives', 'parent: null');
      const r = editSpecSource('odd.md', none, { parent: 'concept-calculator' }, TODAY);
      expect(r.ok && r.changed).toBe(true);
      if (!r.ok) return;
      expectOnly(none, r.text, [
        ['parent: null', 'parent: concept-calculator'],
        ['updated: 2026-04-29 # bumped by the writer', `updated: ${TODAY} # bumped by the writer`],
      ]);
    });

    it(`adds a parent to an empty parent line and keeps its comment (${name})`, () => {
      const empty = src.replace('parent: concept-calculator   # where it lives', 'parent:      # required');
      const r = editSpecSource('odd.md', empty, { parent: 'concept-calculator' }, TODAY);
      expect(r.ok && r.changed).toBe(true);
      if (!r.ok) return;
      expectOnly(empty, r.text, [
        ['parent:      # required', 'parent:      concept-calculator # required'],
        ['updated: 2026-04-29 # bumped by the writer', `updated: ${TODAY} # bumped by the writer`],
      ]);
    });
  }

  it('writes nothing new when the parent is already that one', () => {
    const src = ODD.join('\n');
    const r = editSpecSource('odd.md', src, { parent: 'concept-calculator' }, TODAY);
    expect(r).toEqual({ ok: true, text: src, changed: false });
  });

  it('adds updated when the file has none', () => {
    const src = ODD.filter((l) => !l.startsWith('updated:')).join('\n');
    const r = editSpecSource('odd.md', src, { parent: null }, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toBe(src.replace('parent: concept-calculator   # where it lives', 'parent: null   # where it lives').replace('created: 2026-04-29\n---', `created: 2026-04-29\nupdated: ${TODAY}\n---`));
  });

  it('refuses a parent id that is not a plain id', () => {
    const src = ODD.join('\n');
    for (const bad of ['', 'a b', 'x: y', '[list]', '#hash']) {
      const r = editSpecSource('odd.md', src, { parent: bad }, TODAY);
      expect(r.ok).toBe(false);
    }
  });

  it('changes a parent and a title together, nothing else', () => {
    const src = ODD.join('\n');
    const r = editSpecSource('odd.md', src, { parent: 'concept-b', title: 'Adds more' }, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expectOnly(src, r.text, [
      ['title: Adds numbers', 'title: Adds more'],
      ['parent: concept-calculator   # where it lives', 'parent: concept-b   # where it lives'],
      ['updated: 2026-04-29', `updated: ${TODAY}`],
      ['# Adds numbers', '# Adds more'],
    ]);
  });
});

describe('editSpecSource on an empty or null parent value', () => {
  const values = ['', ' null', ' ~', ' ""', " ''", ' Null'];
  const comments = ['', ' # required'];
  for (const v of values) {
    for (const c of comments) {
      for (const eol of ['\n', '\r\n']) {
        const line = `parent:${v}${v === '' && c ? '' : ''}${c}`;
        it(`sets a parent on "${line}" (${eol === '\n' ? 'lf' : 'crlf'})`, () => {
          const src = ['---', 'id: intent-e', 'title: E', line, 'confidence: asserted', '---', ''].join(eol);
          const r = editSpecSource('e.md', src, { parent: 'concept-a' }, TODAY);
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          expect(r.text).toBe(
            src.replace(line, `parent: concept-a${c}`).replace(`confidence: asserted${eol}`, `confidence: asserted${eol}updated: ${TODAY}${eol}`),
          );
          expect(parseFrontmatter('e.md', r.text).minimum.parent).toBe('concept-a');
        });
      }
    }
  }
});
