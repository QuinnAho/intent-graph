// Linking: changed files and symbols of one commit to the spec nodes whose
// `realized_by` targets them. Pure: the caller reads git and passes contents in.

import type { DriftTargetState } from '@intentgraph/shared/schemas';

import { listTopLevelSymbols, signatureOf, sigMatches } from '../parser/diff/signature-hash.js';
import type { Anchor } from './anchors.js';
import type { Hunk } from './unified-diff.js';

export interface FileChange {
  readonly path: string;
  /** git name-status letter: A, M, D, T. Renames are split into D + A upstream. */
  readonly status: string;
  readonly before: string | null;
  readonly after: string | null;
  readonly binary: boolean;
  readonly hunks: readonly Hunk[];
}

export interface SpecNode {
  readonly id: string;
  readonly title: string;
  /** Title plus markdown body, what the judge reads. */
  readonly text: string;
  readonly file: string;
  readonly realizedBy: readonly Anchor[];
}

export interface FileLink {
  readonly path: string;
  readonly status: string;
  readonly changedSymbols: string[];
  readonly linkedNodeIds: string[];
  /** Changed symbols that no anchor of any node covers (a whole-file anchor covers all). */
  readonly unlinkedSymbols: string[];
}

export interface PairHunk {
  readonly path: string;
  readonly hunk: Hunk;
}

export interface LinkedPair {
  readonly nodeId: string;
  readonly targets: DriftTargetState[];
  readonly hunks: PairHunk[];
  /** False when every touched target hashes the same (or back to its @sig). */
  readonly logicChanged: boolean;
}

export interface LinkResult {
  readonly files: FileLink[];
  /** Changed files no node binds to. Reported, never dropped. */
  readonly noLinkedIntent: string[];
  readonly pairs: LinkedPair[];
}

function symbolHashes(path: string, content: string | null): Map<string, { hash: string; start: number; end: number }> {
  const out = new Map<string, { hash: string; start: number; end: number }>();
  if (content === null) return out;
  for (const s of listTopLevelSymbols(path, content)) {
    out.set(s.name, { hash: signatureOf(path, content, s.name).hash, start: s.startLine, end: s.endLine });
  }
  return out;
}

/** Symbols whose normalised hash moved, in after-order, then removed ones in before-order. */
export function changedSymbols(path: string, before: string | null, after: string | null): string[] {
  const b = symbolHashes(path, before);
  const a = symbolHashes(path, after);
  const out: string[] = [];
  for (const [name, s] of a) if (b.get(name)?.hash !== s.hash) out.push(name);
  for (const name of b.keys()) if (!a.has(name)) out.push(name);
  return out;
}

/** Line numbers of removed lines (old side) and added lines (new side). Context lines do not count. */
function changedLines(h: Hunk): { removed: number[]; added: number[] } {
  const removed: number[] = [];
  const added: number[] = [];
  let o = h.oldStart;
  let n = h.newStart;
  for (const line of h.text.split('\n').slice(1)) {
    if (line.startsWith('-')) removed.push(o++);
    else if (line.startsWith('+')) added.push(n++);
    else if (line.startsWith(' ')) {
      o += 1;
      n += 1;
    }
  }
  return { removed, added };
}

function overlaps(h: Hunk, oldRange: [number, number] | null, newRange: [number, number] | null): boolean {
  const { removed, added } = changedLines(h);
  const inRange = (r: [number, number] | null, l: number): boolean => r !== null && l >= r[0] && l <= r[1];
  return removed.some((l) => inRange(oldRange, l)) || added.some((l) => inRange(newRange, l));
}

interface TargetEval {
  readonly state: DriftTargetState;
  readonly hunks: Hunk[];
  readonly touched: boolean;
}

function evalTarget(anchor: Anchor, ch: FileChange): TargetEval {
  if (anchor.symbol === null) {
    const bh = ch.before === null ? null : signatureOf(ch.path, ch.before).hash;
    const ah = ch.after === null ? null : signatureOf(ch.path, ch.after).hash;
    const confirmed = anchor.sig !== null && ah !== null && sigMatches(anchor.sig, ah);
    return {
      state: { anchor: anchor.raw, path: ch.path, symbol: null, before_hash: bh, after_hash: ah, changed: bh !== ah && !confirmed, missing: ah === null },
      hunks: [...ch.hunks],
      touched: true,
    };
  }
  const sym = anchor.symbol;
  const b = ch.before === null ? null : symbolHashes(ch.path, ch.before).get(sym) ?? null;
  const a = ch.after === null ? null : symbolHashes(ch.path, ch.after).get(sym) ?? null;
  const bh = b?.hash ?? null;
  const ah = a?.hash ?? null;
  if (b === null && a === null) {
    // the anchor names a symbol this commit neither had nor has: a stale anchor, not this change
    return {
      state: { anchor: anchor.raw, path: ch.path, symbol: sym, before_hash: null, after_hash: null, changed: false, missing: true },
      hunks: [],
      touched: false,
    };
  }
  const confirmed = anchor.sig !== null && ah !== null && sigMatches(anchor.sig, ah);
  const changed = bh !== ah && !confirmed;
  // a vanished symbol may have been renamed or moved, so show the judge the whole file diff
  const hunks = a === null
    ? [...ch.hunks]
    : ch.hunks.filter((h) => overlaps(h, b ? [b.start, b.end] : null, [a.start, a.end]));
  return {
    state: { anchor: anchor.raw, path: ch.path, symbol: sym, before_hash: bh, after_hash: ah, changed, missing: a === null },
    hunks,
    touched: changed || hunks.length > 0,
  };
}

export function linkChanges(changes: readonly FileChange[], nodes: readonly SpecNode[]): LinkResult {
  const files: FileLink[] = [];
  const noLinkedIntent: string[] = [];
  const pairs = new Map<string, { targets: DriftTargetState[]; hunks: PairHunk[] }>();

  for (const ch of changes) {
    const syms = ch.binary ? [] : changedSymbols(ch.path, ch.before, ch.after);
    const linked: string[] = [];
    const covered = new Set<string>();
    let wholeFile = false;

    for (const node of nodes) {
      for (const anchor of node.realizedBy) {
        if (anchor.path !== ch.path) continue;
        if (!linked.includes(node.id)) linked.push(node.id);
        if (anchor.symbol === null) wholeFile = true;
        else covered.add(anchor.symbol);
        const t = evalTarget(anchor, ch);
        if (!t.touched) continue;
        const entry = pairs.get(node.id) ?? { targets: [], hunks: [] };
        entry.targets.push(t.state);
        for (const h of t.hunks) {
          if (!entry.hunks.some((x) => x.path === ch.path && x.hunk === h)) entry.hunks.push({ path: ch.path, hunk: h });
        }
        pairs.set(node.id, entry);
      }
    }

    if (linked.length === 0) noLinkedIntent.push(ch.path);
    files.push({
      path: ch.path,
      status: ch.status,
      changedSymbols: syms,
      linkedNodeIds: linked,
      unlinkedSymbols: wholeFile ? [] : syms.filter((s) => !covered.has(s)),
    });
  }

  return {
    files,
    noLinkedIntent,
    pairs: [...pairs.entries()].map(([nodeId, e]) => ({
      nodeId,
      targets: e.targets,
      hunks: e.hunks,
      logicChanged: e.targets.some((t) => t.changed),
    })),
  };
}
