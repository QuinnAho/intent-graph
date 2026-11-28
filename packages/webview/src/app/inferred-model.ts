// rules for proposals a model inferred from the code (lane 10): what a key does on one,
// what its menu offers, how its rename ends, which one is next, and what the notices say.
// pure, so each state can be tested. the glue is inferred-actions.ts.

import type { Node } from '@xyflow/react';

import type { CanWrite, KeyLike, MenuItem, RenameEnd } from './direct-edit-model.js';
import { titleProblem } from './edit-model.js';

/** what the live graph carries on an inferred node, see LiveInferredSchema in packages/shared */
export interface InferredInfo {
  readonly proposal_id: string;
  readonly folder: string;
  readonly anchors: ReadonlyArray<string>;
  readonly confidence: 'inferred' | 'semantic';
  readonly planned: boolean;
  readonly restates: string | null;
  readonly restates_title: string | null;
  readonly belongs_under: string | null;
  readonly code_hash: string;
}

/** the menu kind an inferred node opens with, so its menu is its own */
export const INFERRED_MENU_KIND = 'inferred';

/** node ids the live server gives proposals, see packages/skill/src/live/infer-marks.ts */
export const isInferredId = (id: string): boolean => id.startsWith('inferred:');

export function inferredOf(node: Pick<Node, 'data'> | null | undefined): InferredInfo | null {
  const v = (node?.data as { inferred?: unknown } | undefined)?.inferred;
  return v && typeof v === 'object' ? (v as InferredInfo) : null;
}

export type InferredKeyAction = 'accept' | 'dismiss' | 'rename' | null;

export interface InferredKeyState {
  readonly typing: boolean;
  readonly menuOpen: boolean;
  readonly renameOpen: boolean;
  /** one inferred node is selected */
  readonly inferredSelected: boolean;
}

/** Enter accepts, Delete dismisses, F2 opens the title first. read only is refused by the glue with the reason. */
export function inferredKey(s: InferredKeyState, e: KeyLike): InferredKeyAction {
  if (!s.inferredSelected || s.typing || s.menuOpen || s.renameOpen) return null;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
  if (e.key === 'Enter') return 'accept';
  if (e.key === 'Delete' || e.key === 'Backspace') return 'dismiss';
  if (e.key === 'F2') return 'rename';
  return null;
}

/** the right-click menu of an inferred node. every entry says why when the page is read only. */
export function inferredMenuItems(can: CanWrite): MenuItem[] {
  const reason = can.write ? null : can.reason ?? 'Read only';
  return [
    { id: 'accept', label: 'Accept', disabled: !can.write, reason },
    { id: 'rename', label: 'Edit title, then accept', disabled: !can.write, reason },
    { id: 'dismiss', label: 'Dismiss', disabled: !can.write, reason },
  ];
}

export type InferredRenameOutcome = { readonly kind: 'cancel' } | { readonly kind: 'accept'; readonly title: string } | { readonly kind: 'problem'; readonly message: string };

/** Enter accepts under the typed title, even an unchanged one. Esc and a click away write nothing. */
export function inferredRenameOutcome(typed: string, end: RenameEnd): InferredRenameOutcome {
  if (end !== 'enter') return { kind: 'cancel' };
  const problem = titleProblem(typed);
  if (problem) return { kind: 'problem', message: problem };
  return { kind: 'accept', title: typed.trim() };
}

/** inferred nodes in reading order: by folder, then title, so going through them is stable across updates */
export function openInferred(nodes: ReadonlyArray<Node>): Node[] {
  return nodes
    .filter((n) => inferredOf(n) !== null)
    .sort((a, b) => {
      const fa = inferredOf(a)!.folder;
      const fb = inferredOf(b)!.folder;
      if (fa !== fb) return fa < fb ? -1 : 1;
      const ta = String((a.data as { label?: unknown }).label ?? '');
      const tb = String((b.data as { label?: unknown }).label ?? '');
      return ta < tb ? -1 : ta > tb ? 1 : a.id < b.id ? -1 : 1;
    });
}

/** the one to select next: after the selected one, wrapping, or the first. null when none is open. */
export function nextInferred(nodes: ReadonlyArray<Node>, selectedId: string | null): string | null {
  const list = openInferred(nodes);
  if (list.length === 0) return null;
  const at = selectedId === null ? -1 : list.findIndex((n) => n.id === selectedId);
  return list[(at + 1) % list.length]!.id;
}

export const inferredCountLabel = (count: number): string => `${count} inferred`;

/** missing is how many of its anchors point at code that is not in the graph. the file is written anyway. */
export function acceptedNotice(title: string, file: string, missing = 0): string {
  const base = `Accepted "${title}" as ${file}.`;
  if (missing <= 0) return base;
  return `${base} ${missing} of its anchors ${missing === 1 ? 'points' : 'point'} at code that is not there.`;
}

export function dismissedNotice(title: string): string {
  return `Dismissed "${title}". It stays hidden until its code changes.`;
}

/** the words on the node and in the panel, so it never reads by colour alone */
export function inferredWords(info: InferredInfo): string[] {
  return ['inferred', `confidence ${info.confidence}`, ...(info.planned ? ['planned'] : [])];
}

export function sameAsLabel(info: InferredInfo): string | null {
  if (info.restates === null) return null;
  return `same as ${info.restates_title ?? info.restates}`;
}
