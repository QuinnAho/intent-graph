// opening an intent in place to list the code it is bound to (lane 13). pure rules, no store.
// the live server sends the list on each declared spec node as `code`, one entry per anchor in the
// file's order. an intent with code carries data.nest, the count and whether it is open. the rows are
// part of the intent node, copies of a reference and never the code node itself.

import type { Node } from '@xyflow/react';

import type { MenuItem } from '../app/direct-edit-model.js';
import { inferredOf } from '../app/inferred-model.js';
import { NEST_TUNING } from './view-tuning.js';

/** one anchor as the live server sends it, see LiveCodeRef in the shared schemas */
export interface CodeRef {
  readonly raw: string;
  readonly path: string;
  readonly name?: string;
  readonly target: string | null;
  readonly line?: number;
  readonly symbol_missing: boolean;
}

export interface NestInfo {
  readonly count: number;
  readonly open: boolean;
}

export function codeOf(n: Pick<Node, 'data'> | null | undefined): CodeRef[] {
  const v = (n?.data as { code?: unknown } | undefined)?.code;
  return Array.isArray(v) ? (v as CodeRef[]) : [];
}

export function nestOf(n: Pick<Node, 'data'> | null | undefined): NestInfo | null {
  const v = (n?.data as { nest?: unknown } | undefined)?.nest;
  return v && typeof v === 'object' ? (v as NestInfo) : null;
}

// only a declared intent opens in this lane, a proposal shows what it cites in lane 15
const canNest = (n: Node): boolean => n.type === 'intent' && inferredOf(n) === null;

/** put the count and the open state on every intent with code. safe to run again on its own output. */
export function applyNest(nodes: ReadonlyArray<Node>, opened: ReadonlySet<string>): Node[] {
  return nodes.map((n) => {
    const count = canNest(n) ? codeOf(n).length : 0;
    const had = nestOf(n);
    if (count === 0 && had === null) return n;
    const open = count > 0 && opened.has(n.id);
    if (had !== null && had.count === count && had.open === open) return n;
    const data = { ...(n.data as Record<string, unknown>) };
    if (count === 0) delete data['nest'];
    else data['nest'] = { count, open } satisfies NestInfo;
    return { ...n, data };
  });
}

/** which intents have code and which are open, as one string to compare */
export function nestShape(nodes: ReadonlyArray<Node>): string {
  const out: string[] = [];
  for (const n of nodes) {
    const nest = nestOf(n);
    if (nest) out.push(`${n.id}:${nest.count}:${nest.open ? 1 : 0}`);
  }
  return out.sort().join('|');
}

/** the extra height an open intent needs under what it has closed. 0 when closed. */
export function nestFootPx(n: Node): number {
  const nest = nestOf(n);
  if (!nest || !nest.open) return 0;
  return nest.count * NEST_TUNING.rowPx + NEST_TUNING.padPx;
}

/** "2 code" closed, "hide 2 code" open, so the open count reads as the way to close (as the fold row does) */
export function nestCountLabel(count: number, open = false): string {
  return open ? `hide ${count} code` : `${count} code`;
}

/** the count's title. wires is how many realizes wires from the code block are not drawn, the meaning the old pin chip had. */
export function nestToggleTitle(count: number, open: boolean, wires = 0): string {
  const what = count === 1 ? 'the code' : `the ${count} pieces of code`;
  const base = open ? `Hide ${what} this intent is bound to. O closes it.` : `Show ${what} this intent is bound to. O opens it.`;
  if (wires === 0) return base;
  return `${base} ${wires} ${wires === 1 ? 'wire' : 'wires'} from the code block ${wires === 1 ? 'is' : 'are'} not drawn.`;
}

/** one count per node: an intent with code drops the code part of its pin chip, its count says it instead */
export function chipHidden(hidden: Readonly<Record<string, number>>, ownsCode: boolean): Record<string, number> {
  if (!ownsCode) return { ...hidden };
  const out = { ...hidden };
  delete out['code'];
  return out;
}

/** what a row shows: the symbol name, then the path. a note only when the code is not all there. */
export function codeRowText(r: CodeRef): { name: string | null; path: string; note: string | null } {
  const note = r.target === null ? 'code not found' : r.symbol_missing ? 'symbol not found, file linked' : null;
  return { name: r.name ?? null, path: r.path, note };
}

/** the full text of a row, and which of the two a click does: open the editor or select in the graph */
export function codeRowTitle(r: CodeRef, inEditor: boolean): string {
  const what = r.name !== undefined ? `${r.name} in ${r.path}` : r.path;
  if (r.target === null) return `${what}. Code not found: nothing in the graph matches ${r.raw}.`;
  const missing = r.symbol_missing ? ' The symbol was not found, the file is linked.' : '';
  if (inEditor) return `${what}.${missing} Click to open it in the editor${r.line !== undefined ? ` at line ${r.line}` : ''}.`;
  return `${what}.${missing} Click to select it in the graph.`;
}

export interface NestKeyState {
  /** focus sits in a field, a button or the menu, which own their keys */
  readonly typing: boolean;
  readonly menuOpen: boolean;
  readonly renameOpen: boolean;
  /** code count of the intent the key is for, null when the key is for no intent */
  readonly count: number | null;
}

/** O opens and closes the intent that has the focus or is selected. nothing with no code. */
export function nestKey(s: NestKeyState, e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }): 'toggle' | null {
  if (s.typing || s.menuOpen || s.renameOpen) return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key !== 'o' && e.key !== 'O') return null;
  return s.count !== null && s.count > 0 ? 'toggle' : null;
}

/** the menu entry on an intent. it only reads, so it works on a read-only page too. */
export function nestMenuItem(nest: NestInfo | null): MenuItem {
  if (!nest || nest.count === 0) return { id: 'toggle-code', label: 'Show code', disabled: true, reason: 'No code bound to it' };
  return { id: 'toggle-code', label: nest.open ? 'Hide code' : 'Show code', disabled: false, reason: null };
}
