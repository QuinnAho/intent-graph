// an accepted proposal becomes a real intent file: the parser reads back the same
// title, body, parent and realized_by anchors, and yaml specials in a title survive.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readAnchors } from '../src/parser/spec-md/anchors.js';
import { parseFrontmatter } from '../src/parser/spec-md/frontmatter.js';
import { createIntentFile, newIntentSource, readSpecForEdit } from '../src/parser/spec-md/writer.js';

const TODAY = '2026-11-27';
const ANCHORS = ['packages/a/src/run.ts#runAll', 'packages/a/src/cli.ts'];

function readBack(text: string): { title: string; parent: string | null; body: string; anchors: string[] } {
  const parsed = parseFrontmatter('x.md', text);
  const spec = readSpecForEdit('x.md', text);
  return { title: parsed.minimum.title, parent: parsed.minimum.parent, body: spec.body, anchors: readAnchors(parsed.raw).realizedBy.map((a) => a.raw) };
}

describe('newIntentSource for an accepted proposal', () => {
  it('reads back the same title, body, parent and anchors', () => {
    const r = newIntentSource({ title: 'Runs every folder once', parent: 'concept-c', today: TODAY, targetKinds: ['code_module'], body: 'Walks the folders and runs each one.', realizedBy: ANCHORS });
    if (!r.ok) throw new Error(r.reason);
    expect(readBack(r.text)).toEqual({ title: 'Runs every folder once', parent: 'concept-c', body: 'Walks the folders and runs each one.\n', anchors: ANCHORS });
    expect(r.text).toContain('realized_by:\n  - packages/a/src/run.ts#runAll\n  - packages/a/src/cli.ts\n');
  });

  it('keeps a title with yaml specials and a body with markdown', () => {
    const titles = ['Key: value # not a comment', "It's [not] a list", '- starts like a list', 'yes', '@at & star *', '"quoted"', '123'];
    for (const title of titles) {
      const body = 'First line.\n\n- a list item\n---\n`code: here`';
      const r = newIntentSource({ title, parent: 'concept-c', today: TODAY, targetKinds: ['code_module'], body, realizedBy: ANCHORS });
      if (!r.ok) throw new Error(`${title}: ${r.reason}`);
      expect(readBack(r.text)).toEqual({ title, parent: 'concept-c', body: `${body}\n`, anchors: ANCHORS });
    }
  });

  it('writes parent null for a proposal with no concept', () => {
    const r = newIntentSource({ title: 'Top level', parent: null, today: TODAY, targetKinds: ['code_module'], body: 'b', realizedBy: ANCHORS });
    if (!r.ok) throw new Error(r.reason);
    expect(readBack(r.text).parent).toBeNull();
  });

  it('refuses an anchor that would not read back', () => {
    for (const bad of ['C:/abs/file.ts', '../out.ts', 'a\\b.ts', 'a.ts\nstatus: active', '']) {
      expect(newIntentSource({ title: 'T', parent: 'concept-c', today: TODAY, body: 'b', realizedBy: [bad] }).ok).toBe(false);
    }
  });

  it('leaves a create without body or anchors exactly as before', () => {
    const r = newIntentSource({ title: 'Plain', parent: 'concept-c', today: TODAY });
    if (!r.ok) throw new Error(r.reason);
    expect(r.text).not.toContain('realized_by');
    expect(r.text.endsWith('# Plain\n')).toBe(true);
  });
});

describe('createIntentFile for an accepted proposal', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('writes the file and it parses back the same', () => {
    const d = mkdtempSync(join(tmpdir(), 'ig-accept-writer-'));
    dirs.push(d);
    mkdirSync(join(d, 'spec'), { recursive: true });
    const r = createIntentFile(join(d, 'spec'), { title: 'Writes: the report', parent: 'concept-c', today: TODAY, targetKinds: ['code_module'], body: 'Body here.', realizedBy: ANCHORS });
    if (!r.ok) throw new Error(r.reason);
    expect(readBack(readFileSync(r.file, 'utf8'))).toEqual({ title: 'Writes: the report', parent: 'concept-c', body: 'Body here.\n', anchors: ANCHORS });
  });
});
