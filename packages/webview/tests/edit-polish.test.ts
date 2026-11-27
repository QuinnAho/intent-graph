// edit polish rules: the save keys, the target kind choices and what the form sends.
import { NodeKindSchema } from '@intentgraph/shared/schemas';
import { describe, expect, it } from 'vitest';

import { isSaveKey, kindsProblem, toggleKind } from '../src/app/edit-model.js';
import { CREATE_TUNING } from '../src/app/edit-tuning.js';

describe('isSaveKey', () => {
  const key = (k: string, mods: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }) => ({ key: k, ctrlKey: false, metaKey: false, ...mods });
  it('saves on ctrl+s and on cmd+s, in either case', () => {
    expect(isSaveKey(key('s', { ctrlKey: true }))).toBe(true);
    expect(isSaveKey(key('S', { ctrlKey: true }))).toBe(true);
    expect(isSaveKey(key('s', { metaKey: true }))).toBe(true);
  });
  it('does not save on a bare s or another chord', () => {
    expect(isSaveKey(key('s', {}))).toBe(false);
    expect(isSaveKey(key('a', { ctrlKey: true }))).toBe(false);
    expect(isSaveKey(key('s', { ctrlKey: true, altKey: true }))).toBe(false);
  });
});

describe('target kinds', () => {
  it('offers exactly the node kinds the shared schema allows', () => {
    expect([...CREATE_TUNING.targetKinds].sort()).toEqual([...NodeKindSchema.options].sort());
  });
  it('preselects one kind that is on the list', () => {
    expect(CREATE_TUNING.defaultTargetKinds.length).toBeGreaterThan(0);
    for (const k of CREATE_TUNING.defaultTargetKinds) expect(CREATE_TUNING.targetKinds).toContain(k);
  });
  it('toggles a kind and keeps the list order', () => {
    expect(toggleKind(['code_module'], 'intent')).toEqual(['intent', 'code_module']);
    expect(toggleKind(['intent', 'code_module'], 'intent')).toEqual(['code_module']);
  });
  it('asks for one when none is picked', () => {
    expect(kindsProblem([])).toMatch(/at least one/);
    expect(kindsProblem(['task'])).toBeNull();
  });
});
