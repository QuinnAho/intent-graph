// rules behind direct editing: keys, the right-click menu, where it opens, how a rename ends.
import { describe, expect, it } from 'vitest';

import { clampMenu, directKey, escapeLayer, menuHeight, menuItems, renameOutcome, renameTarget, stepMenu, type KeyState } from '../src/app/direct-edit-model.js';
import { MENU_TUNING } from '../src/app/direct-edit-tuning.js';

const WRITE = { write: true, reason: null };
const READ = { write: false, reason: 'Read only. The server was started without --write.' };
const base: KeyState = { typing: false, menuOpen: false, renameOpen: false, selectedKind: 'intent', write: true };

describe('menuItems', () => {
  it('offers add intent, rename and details on a concept', () => {
    expect(menuItems('concept', WRITE).map((i) => i.label)).toEqual(['Add intent here', 'Rename', 'Edit details']);
  });
  it('offers rename and details on any other spec node', () => {
    expect(menuItems('constraint', WRITE).map((i) => i.id)).toEqual(['rename', 'edit-details']);
  });
  it('offers fit view on the empty canvas, also read only', () => {
    expect(menuItems(null, READ)).toEqual([{ id: 'fit-view', label: 'Fit view', disabled: false, reason: null }]);
  });
  it('offers nothing on a code node, so the browser menu shows', () => {
    expect(menuItems('code_module', WRITE)).toEqual([]);
  });
  it('shows edit entries disabled with the reason when read only', () => {
    const items = menuItems('concept', READ);
    expect(items.every((i) => i.disabled && i.reason === READ.reason)).toBe(true);
  });
});

describe('clampMenu', () => {
  const size = { width: MENU_TUNING.width, height: menuHeight(3) };
  const win = { width: 1280, height: 800 };
  it('keeps a menu opened mid window where the pointer is', () => {
    expect(clampMenu({ x: 300, y: 200 }, size, win)).toEqual({ x: 300, y: 200 });
  });
  it('moves a menu opened at the right and bottom edge back inside', () => {
    const at = clampMenu({ x: 1275, y: 795 }, size, win);
    expect(at.x + size.width).toBeLessThanOrEqual(win.width - MENU_TUNING.margin);
    expect(at.y + size.height).toBeLessThanOrEqual(win.height - MENU_TUNING.margin);
  });
  it('never goes past the top left', () => {
    expect(clampMenu({ x: -50, y: -9 }, size, win)).toEqual({ x: MENU_TUNING.margin, y: MENU_TUNING.margin });
  });
});

describe('stepMenu', () => {
  const items = menuItems('concept', WRITE);
  it('moves down and wraps', () => {
    expect(stepMenu(items, 0, 1)).toBe(1);
    expect(stepMenu(items, 2, 1)).toBe(0);
  });
  it('moves up and wraps', () => {
    expect(stepMenu(items, 0, -1)).toBe(2);
  });
  it('skips disabled entries and gives null when all are disabled', () => {
    const mixed = [{ ...items[0]!, disabled: true }, items[1]!, items[2]!];
    expect(stepMenu(mixed, 2, 1)).toBe(1);
    expect(stepMenu(menuItems('concept', READ), 0, 1)).toBeNull();
  });
});

describe('directKey', () => {
  it('F2 renames the selected node', () => {
    expect(directKey(base, { key: 'F2' })).toBe('rename');
  });
  it('Enter opens details of the selected node', () => {
    expect(directKey(base, { key: 'Enter' })).toBe('details');
  });
  it('the menu key and Shift+F10 open the menu', () => {
    expect(directKey(base, { key: 'ContextMenu' })).toBe('menu');
    expect(directKey(base, { key: 'F10', shiftKey: true })).toBe('menu');
    expect(directKey(base, { key: 'F10' })).toBeNull();
  });
  it('does nothing with nothing selected, except the menu key', () => {
    const none = { ...base, selectedKind: null };
    expect(directKey(none, { key: 'F2' })).toBeNull();
    expect(directKey(none, { key: 'Enter' })).toBeNull();
    expect(directKey(none, { key: 'ContextMenu' })).toBe('menu');
  });
  it('leaves keys alone while a field, the menu or the rename field has focus', () => {
    for (const s of [{ ...base, typing: true }, { ...base, menuOpen: true }, { ...base, renameOpen: true }]) {
      expect(directKey(s, { key: 'F2' })).toBeNull();
      expect(directKey(s, { key: 'Enter' })).toBeNull();
      expect(directKey(s, { key: 'ContextMenu' })).toBeNull();
    }
  });
  it('opens no editing from the keyboard when read only, the menu still opens', () => {
    const ro = { ...base, write: false };
    expect(directKey(ro, { key: 'F2' })).toBeNull();
    expect(directKey(ro, { key: 'Enter' })).toBeNull();
    expect(directKey(ro, { key: 'ContextMenu' })).toBe('menu');
  });
  it('ignores a key with ctrl, cmd or alt held', () => {
    expect(directKey(base, { key: 'F2', ctrlKey: true })).toBeNull();
    expect(directKey(base, { key: 'Enter', metaKey: true })).toBeNull();
  });
});

describe('escapeLayer', () => {
  const closed = { menuOpen: false, renameOpen: false, createOpen: false, panelOpen: true, panelDirty: false };
  it('closes the menu first, then the rename field, then the form, then the panel', () => {
    expect(escapeLayer({ ...closed, menuOpen: true, renameOpen: true })).toBe('menu');
    expect(escapeLayer({ ...closed, renameOpen: true })).toBe('rename');
    expect(escapeLayer({ ...closed, createOpen: true })).toBe('create');
    expect(escapeLayer(closed)).toBe('panel-close');
  });
  it('reverts a dirty panel before it closes it', () => {
    expect(escapeLayer({ ...closed, panelDirty: true })).toBe('panel-revert');
  });
  it('does nothing when nothing is open', () => {
    expect(escapeLayer({ ...closed, panelOpen: false })).toBeNull();
  });
});

describe('renameTarget', () => {
  it('uses the panel when it holds unsaved text for that node, the field otherwise', () => {
    expect(renameTarget('a', 'a')).toBe('panel');
    expect(renameTarget('b', 'a')).toBe('field');
    expect(renameTarget(null, 'a')).toBe('field');
  });
});

describe('renameOutcome', () => {
  it('saves a changed title on Enter and on blur, trimmed', () => {
    expect(renameOutcome('Old', '  New  ', 'enter')).toEqual({ kind: 'save', title: 'New' });
    expect(renameOutcome('Old', 'New', 'blur')).toEqual({ kind: 'save', title: 'New' });
  });
  it('writes nothing for Esc or an unchanged title', () => {
    expect(renameOutcome('Old', 'New', 'escape')).toEqual({ kind: 'cancel' });
    expect(renameOutcome('Old', ' Old ', 'enter')).toEqual({ kind: 'cancel' });
    expect(renameOutcome('Old', 'Old', 'blur')).toEqual({ kind: 'cancel' });
  });
  it('keeps the field open on Enter with a bad title and drops it on blur', () => {
    expect(renameOutcome('Old', '   ', 'enter').kind).toBe('problem');
    expect(renameOutcome('Old', '!!!', 'enter').kind).toBe('problem');
    expect(renameOutcome('Old', '   ', 'blur')).toEqual({ kind: 'cancel' });
  });
});
