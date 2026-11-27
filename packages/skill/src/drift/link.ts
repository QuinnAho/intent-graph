// Linking: changed files and symbols of one commit to the spec nodes whose
// `realized_by` targets them. Pure: the caller reads git and passes contents in.
// A file that cannot be parsed marks only its own pairs, it never throws out.

import type { DriftTargetState } from '@intentgraph/shared/schemas';

import { signatureOf, sigMatches, symbolSignatures, type ParseLimits } from '../parser/diff/signature-hash.js';
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
  /** Why symbols could not be listed (for example a file over the parse cap), else null. */
  readonly error: string | null;
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
  /** Targets that could not be parsed. A pair with errors is never sent to the judge. */
  readonly errors: string[];
}

export interface LinkResult {
  readonly files: FileLink[];
  /** Changed files no node binds to. Reported, never dropped. */
  readonly noLinkedIntent: string[];
  readonly pairs: LinkedPair[];
}

export interface LinkOptions {
  /** Files over this many bytes are not parsed. No cap when absent. */
  readonly maxParseBytes?: number;
}

function limitsOf(opts: LinkOptions): ParseLimits {
  return opts.maxParseBytes === undefined ? {} : { maxBytes: opts.maxParseBytes };
}

type SymMap = Map<string, { hash: string; start: number; end: number }>;

function symbolHashes(path: string, content: string | null, limits: ParseLimits): SymMap {
  const out: SymMap = new Map();
  if (content === null) return out;
  for (const s of symbolSignatures(path, content, limits)) {
    if (!out.has(s.name)) out.set(s.name, { hash: s.hash, start: s.startLine, end: s.endLine });
  }
  return out;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Symbols whose normalised hash moved, in after-order, then removed ones in before-order. */
export function changedSymbols(path: string, before: string | null, after: string | null, opts: LinkOptions = {}): string[] {
  const b = symbolHashes(path, before, limitsOf(opts));
  const a = symbolHashes(path, after, limitsOf(opts));
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
  readonly error: string | null;
}

function evalTarget(anchor: Anchor, ch: FileChange, limits: ParseLimits): TargetEval {
  if (anchor.symbol === null) {
    const bh = ch.before === null ? null : signatureOf(ch.path, ch.before, undefined, limits).hash;
    const ah = ch.after === null ? null : signatureOf(ch.path, ch.after, undefined, limits).hash;
    const confirmed = anchor.sig !== null && ah !== null && sigMatches(anchor.sig, ah);
    return {
      state: { anchor: anchor.raw, path: ch.path, symbol: null, before_hash: bh, after_hash: ah, changed: bh !== ah && !confirmed, missing: ah === null },
      hunks: [...ch.hunks],
      touched: true,
      error: null,
    };
  }
  const sym = anchor.symbol;
  const b = ch.before === null ? null : symbolHashes(ch.path, ch.before, limits).get(sym) ?? null;
  const a = ch.after === null ? null : symbolHashes(ch.path, ch.after, limits).get(sym) ?? null;
  const bh = b?.hash ?? null;
  const ah = a?.hash ?? null;
  if (b === null && a === null) {
    // a symbol this commit neither had nor has: reported once per run by findMissingTargets
    return {
      state: { anchor: anchor.raw, path: ch.path, symbol: sym, before_hash: null, after_hash: null, changed: false, missing: true },
      hunks: [],
      touched: false,
      error: null,
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
    error: null,
  };
}

function safeEvalTarget(anchor: Anchor, ch: FileChange, limits: ParseLimits): TargetEval {
  try {
    return evalTarget(anchor, ch, limits);
  } catch (e) {
    // the file changed but we cannot read its shape: a pair the judge must not guess at
    return {
      state: { anchor: anchor.raw, path: ch.path, symbol: anchor.symbol, before_hash: null, after_hash: null, changed: true, missing: false },
      hunks: [...ch.hunks],
      touched: true,
      error: `${anchor.raw}: ${errorText(e)}`,
    };
  }
}

export function linkChanges(changes: readonly FileChange[], nodes: readonly SpecNode[], opts: LinkOptions = {}): LinkResult {
  const limits = limitsOf(opts);
  const files: FileLink[] = [];
  const noLinkedIntent: string[] = [];
  const pairs = new Map<string, { targets: DriftTargetState[]; hunks: PairHunk[]; errors: string[] }>();

  for (const ch of changes) {
    let syms: string[] = [];
    let fileError: string | null = null;
    try {
      syms = ch.binary ? [] : changedSymbols(ch.path, ch.before, ch.after, opts);
    } catch (e) {
      fileError = errorText(e);
    }
    const linked: string[] = [];
    const covered = new Set<string>();
    let wholeFile = false;

    for (const node of nodes) {
      for (const anchor of node.realizedBy) {
        if (anchor.path !== ch.path) continue;
        if (!linked.includes(node.id)) linked.push(node.id);
        if (anchor.symbol === null) wholeFile = true;
        else covered.add(anchor.symbol);
        const t = safeEvalTarget(anchor, ch, limits);
        if (!t.touched) continue;
        const entry = pairs.get(node.id) ?? { targets: [], hunks: [], errors: [] };
        entry.targets.push(t.state);
        if (t.error) entry.errors.push(t.error);
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
      error: fileError,
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
      errors: e.errors,
    })),
  };
}

export interface MissingTarget {
  readonly nodeId: string;
  readonly anchor: string;
  /** `missing`: the file or symbol does not exist. `error`: it could not be checked. */
  readonly kind: 'missing' | 'error';
  readonly reason: string;
}

/**
 * Anchors whose file or symbol does not exist in the given tree (the end of the
 * range). `read` returns a file's content, or null when there is no such file.
 */
export function findMissingTargets(
  nodes: readonly SpecNode[],
  read: (path: string) => string | null,
  opts: LinkOptions = {},
): MissingTarget[] {
  const limits = limitsOf(opts);
  const out: MissingTarget[] = [];
  const contents = new Map<string, string | null>();
  for (const node of nodes) {
    for (const anchor of node.realizedBy) {
      if (!contents.has(anchor.path)) contents.set(anchor.path, read(anchor.path));
      const content = contents.get(anchor.path) ?? null;
      if (content === null) {
        out.push({ nodeId: node.id, anchor: anchor.raw, kind: 'missing', reason: `file ${anchor.path} does not exist` });
        continue;
      }
      if (anchor.symbol === null) continue;
      try {
        if (!symbolHashes(anchor.path, content, limits).has(anchor.symbol)) {
          out.push({ nodeId: node.id, anchor: anchor.raw, kind: 'missing', reason: `symbol ${anchor.symbol} is not in ${anchor.path}` });
        }
      } catch (e) {
        out.push({ nodeId: node.id, anchor: anchor.raw, kind: 'error', reason: `${anchor.raw} could not be checked: ${errorText(e)}` });
      }
    }
  }
  return out;
}
