// anchor parsing per adr 0030. a bad anchor is a warning, never a throw.
import { describe, expect, it } from 'vitest';

import { parseAnchor, parseAnchorField, readAnchors } from '../src/parser/spec-md/anchors.js';

describe('parseAnchor', () => {
  it('reads a bare file path', () => {
    expect(parseAnchor('src/math.ts')).toEqual({ ok: true, anchor: { raw: 'src/math.ts', path: 'src/math.ts' } });
  });

  it('reads a symbol and a signature', () => {
    expect(parseAnchor('src/math.ts#add@9f2c1a7b')).toEqual({
      ok: true,
      anchor: { raw: 'src/math.ts#add@9f2c1a7b', path: 'src/math.ts', name: 'add', sig: '9f2c1a7b' },
    });
  });

  it('keeps spaces in a test name', () => {
    const r = parseAnchor('tests/a.test.ts#rejects a missing id');
    expect(r).toEqual({ ok: true, anchor: { raw: 'tests/a.test.ts#rejects a missing id', path: 'tests/a.test.ts', name: 'rejects a missing id' } });
  });

  it('does not treat a short @ suffix as a signature', () => {
    const r = parseAnchor('tests/a.test.ts#mails a@b');
    expect(r.ok && r.anchor.name).toBe('mails a@b');
    expect(r.ok && r.anchor.sig).toBe(undefined);
  });

  it('rejects backslashes, absolute paths, parent hops and empty parts', () => {
    for (const bad of ['src\\math.ts', '/etc/passwd', 'C:/x.ts', '../outside.ts', 'src/../../x.ts', '', '#name', 'src/a.ts#']) {
      expect(parseAnchor(bad).ok, bad).toBe(false);
    }
  });
});

describe('parseAnchorField', () => {
  it('is empty and silent when the field is missing', () => {
    expect(parseAnchorField(undefined, 'verified_by')).toEqual({ anchors: [], warnings: [] });
  });

  it('accepts a single string as a one item list', () => {
    expect(parseAnchorField('src/a.ts', 'realized_by').anchors).toHaveLength(1);
  });

  it('warns on non string entries and keeps the good ones', () => {
    const r = parseAnchorField(['src/a.ts', 42, null, 'C:\\bad.ts'], 'verified_by');
    expect(r.anchors.map((a) => a.path)).toEqual(['src/a.ts']);
    expect(r.warnings).toHaveLength(3);
    expect(r.warnings[0]).toMatch(/verified_by/);
  });

  it('warns when the field is an object', () => {
    const r = parseAnchorField({ a: 1 }, 'verified_by');
    expect(r.anchors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });
});

describe('readAnchors', () => {
  it('reads both fields from raw frontmatter', () => {
    const r = readAnchors({ realized_by: ['src/a.ts#f'], verified_by: ['tests/a.test.ts'] });
    expect(r.realizedBy).toHaveLength(1);
    expect(r.verifiedBy).toHaveLength(1);
    expect(r.warnings).toEqual([]);
  });
});
