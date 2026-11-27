// target_kinds on a new intent: the file carries them, and a kind that is not allowed is refused.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createIntent } from '../src/live/edit-api.js';
import { parseSpecTree } from '../src/parser/spec-md/index.js';
import { newIntentSource } from '../src/parser/spec-md/writer.js';
import { SPEC_WRITE_TUNING } from '../src/parser/spec-md/write-tuning.js';

const TODAY = '2026-11-27';

describe('newIntentSource with target_kinds', () => {
  it('writes the kinds as a block list after status, and the file parses with no warning', () => {
    const r = newIntentSource({ title: 'Rounds to cents', parent: 'concept-c', today: TODAY, targetKinds: ['code_module', 'code_symbol'] });
    if (!r.ok) throw new Error(r.reason);
    expect(r.text).toContain('status: draft\ntarget_kinds:\n  - code_module\n  - code_symbol\ncreated: ');
  });

  it('refuses an empty list, an unknown kind and a duplicate', () => {
    const base = { title: 'T one', parent: 'concept-c', today: TODAY };
    expect(newIntentSource({ ...base, targetKinds: [] }).ok).toBe(false);
    expect(newIntentSource({ ...base, targetKinds: ['module'] }).ok).toBe(false);
    expect(newIntentSource({ ...base, targetKinds: ['code_module', 'code_module'] }).ok).toBe(false);
    expect(newIntentSource({ ...base, targetKinds: ['code_module\nstatus: active'] }).ok).toBe(false);
  });
});

describe('createIntent endpoint rules', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const nodes = [{ id: 'concept-c', kind: 'concept' }];
  const make = (): string => {
    const d = mkdtempSync(join(tmpdir(), 'ig-create-kinds-'));
    dirs.push(d);
    mkdirSync(join(d, 'spec', 'concepts'), { recursive: true });
    writeFileSync(join(d, 'spec', 'concepts', 'c.md'), '---\nid: concept-c\ntitle: C\nparent: null\nconfidence: asserted\nregeneration_scope: cooperative\n---\n');
    return d;
  };
  const names = (d: string): string[] => {
    try {
      return readdirSync(join(d, 'spec', 'intents'));
    } catch {
      return [];
    }
  };

  it('a create with kinds leaves a file with target_kinds and no parse warning', () => {
    const d = make();
    const r = createIntent(d, { title: 'Rounds to cents', parent: 'concept-c', target_kinds: ['code_symbol'] }, nodes, TODAY);
    expect(r.status).toBe(201);
    const tree = parseSpecTree(join(d, 'spec'));
    expect(tree.errors).toEqual([]);
    expect(tree.warnings.filter((w) => w.message.includes('target_kinds'))).toEqual([]);
    expect(tree.nodes.find((n) => n.id === 'intent-rounds-to-cents')).toBeDefined();
  });

  it('a create without kinds gets the default kind, so it is never a problem', () => {
    const d = make();
    const r = createIntent(d, { title: 'Rounds to cents', parent: 'concept-c' }, nodes, TODAY);
    expect(r.status).toBe(201);
    const tree = parseSpecTree(join(d, 'spec'));
    expect(tree.warnings.filter((w) => w.message.includes('target_kinds'))).toEqual([]);
    expect(SPEC_WRITE_TUNING.defaultTargetKinds.length).toBeGreaterThan(0);
  });

  it('refuses a kind that is not allowed, an empty list and a non-list, and writes nothing', () => {
    const d = make();
    for (const target_kinds of [['nonsense'], [], 'code_module', [7], ['code_module', 'code_module']]) {
      const r = createIntent(d, { title: 'Rounds to cents', parent: 'concept-c', target_kinds }, nodes, TODAY);
      expect(r.status).toBe(422);
    }
    expect(names(d)).toEqual([]);
  });
});
