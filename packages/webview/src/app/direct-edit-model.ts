// rules behind direct editing: what a key does, what the right-click menu offers,
// where it opens and how a rename ends. pure, so each state can be tested.

import { SPEC_KINDS } from '../transport/live-source.js';
import { MENU_TUNING } from './direct-edit-tuning.js';
import { titleProblem } from './edit-model.js';

export type MenuItemId = 'add-intent' | 'rename' | 'edit-details' | 'fit-view' | 'delete-wire';

export interface MenuItem {
  readonly id: MenuItemId;
  readonly label: string;
  readonly disabled: boolean;
  /** why it is disabled, shown on the item */
  readonly reason: string | null;
}

export interface CanWrite {
  readonly write: boolean;
  readonly reason: string | null;
}

const READ_ONLY_SHORT = 'Read only';

/** entries for a right click. kind null is the empty canvas. a node that is not a spec node gets none. */
export function menuItems(kind: string | null, can: CanWrite, wireRefusal: string | null = null): MenuItem[] {
  const edit = (id: MenuItemId, label: string): MenuItem => ({ id, label, disabled: !can.write, reason: can.write ? null : can.reason ?? READ_ONLY_SHORT });
  // a wire's menu: a parent wire can be deleted, any other wire says why not
  if (kind === 'wire') return [wireRefusal && can.write ? { id: 'delete-wire', label: 'Delete wire', disabled: true, reason: wireRefusal } : edit('delete-wire', 'Delete wire')];
  if (kind === null) return [{ id: 'fit-view', label: 'Fit view', disabled: false, reason: null }];
  if (!SPEC_KINDS.has(kind)) return [];
  const items = [edit('rename', 'Rename'), edit('edit-details', 'Edit details')];
  return kind === 'concept' ? [edit('add-intent', 'Add intent here'), ...items] : items;
}

/** top left of a menu opened at (x, y), moved so the whole box stays inside the window */
export function clampMenu(at: { x: number; y: number }, size: { width: number; height: number }, win: { width: number; height: number }): { x: number; y: number } {
  const m = MENU_TUNING.margin;
  const x = Math.max(m, Math.min(at.x, win.width - size.width - m));
  const y = Math.max(m, Math.min(at.y, win.height - size.height - m));
  return { x, y };
}

export function menuHeight(count: number): number {
  return count * MENU_TUNING.itemHeight + 2 * MENU_TUNING.padding;
}

/** the next enabled entry up or down, wrapping. null when none is enabled. */
export function stepMenu(items: ReadonlyArray<MenuItem>, from: number, dir: 1 | -1): number | null {
  const n = items.length;
  for (let i = 1; i <= n; i++) {
    const at = (((from + dir * i) % n) + n) % n;
    if (!items[at]!.disabled) return at;
  }
  return null;
}

export interface KeyState {
  /** focus sits in a field, a button or the menu, which own their keys */
  readonly typing: boolean;
  readonly menuOpen: boolean;
  readonly renameOpen: boolean;
  /** kind of the one selected spec node, null when none */
  readonly selectedKind: string | null;
  readonly write: boolean;
}

export interface KeyLike {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
}

export type KeyAction = 'rename' | 'details' | 'menu' | null;

/** what a key does on the canvas, outside a field */
export function directKey(s: KeyState, e: KeyLike): KeyAction {
  if (s.typing || s.menuOpen || s.renameOpen) return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey === true)) return 'menu';
  if (s.selectedKind === null || e.shiftKey === true) return null;
  if (e.key === 'F2') return s.write ? 'rename' : null;
  if (e.key === 'Enter') return s.write ? 'details' : null;
  return null;
}

export interface EscapeState {
  readonly menuOpen: boolean;
  readonly renameOpen: boolean;
  readonly createOpen: boolean;
  readonly panelOpen: boolean;
  readonly panelDirty: boolean;
}

export type EscapeLayer = 'menu' | 'rename' | 'create' | 'panel-revert' | 'panel-close' | null;

/** the one thing Esc closes: the menu first, then the rename field, then the form or panel */
export function escapeLayer(s: EscapeState): EscapeLayer {
  if (s.menuOpen) return 'menu';
  if (s.renameOpen) return 'rename';
  if (s.createOpen) return 'create';
  if (!s.panelOpen) return null;
  return s.panelDirty ? 'panel-revert' : 'panel-close';
}

/** a rename goes to the panel's title field when the panel holds unsaved text for that node */
export function renameTarget(panelDirtyId: string | null, id: string): 'panel' | 'field' {
  return panelDirtyId === id ? 'panel' : 'field';
}

export type RenameEnd = 'enter' | 'blur' | 'escape';
export type RenameOutcome = { readonly kind: 'cancel' } | { readonly kind: 'save'; readonly title: string } | { readonly kind: 'problem'; readonly message: string };

/** how a rename ends: unchanged text and Esc write nothing, a bad title stays open on Enter */
export function renameOutcome(original: string, typed: string, end: RenameEnd): RenameOutcome {
  if (end === 'escape') return { kind: 'cancel' };
  const title = typed.trim();
  if (title === original.trim()) return { kind: 'cancel' };
  const problem = titleProblem(typed);
  if (problem) return end === 'enter' ? { kind: 'problem', message: problem } : { kind: 'cancel' };
  return { kind: 'save', title };
}
