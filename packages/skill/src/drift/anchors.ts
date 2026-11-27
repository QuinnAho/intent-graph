// ADR-0030 anchor targets: `path[#Name][@sig]`. Syntax borrowed from Fiberplane Drift.
// Proposed ADR, so only fixture specs carry anchors for now.

export interface Anchor {
  readonly raw: string;
  /** Repo-relative, forward slashes, no leading `./`. */
  readonly path: string;
  /** Exported symbol, `Class.member`, or null for the whole file. */
  readonly symbol: string | null;
  /** Eight or more hex chars of the last human-confirmed normalised hash. */
  readonly sig: string | null;
}

const ANCHOR_RE = /^([^#]+?)(?:#(.+?))?(?:@([0-9a-f]{8,}))?$/;

/** Parse one target string. Returns null for anything that is not a safe repo-relative path. */
export function parseAnchor(raw: string): Anchor | null {
  const trimmed = raw.trim();
  const m = ANCHOR_RE.exec(trimmed);
  if (!m) return null;
  let path = (m[1] ?? '').trim();
  if (path.startsWith('./')) path = path.slice(2);
  // a target must stay inside the repo: no absolute, drive, backslash or parent paths
  if (!path || path.startsWith('/') || /^[a-zA-Z]:/.test(path) || path.includes('\\')) return null;
  if (path.split('/').includes('..')) return null;
  const symbol = m[2]?.trim() || null;
  return { raw: trimmed, path, symbol, sig: m[3] ?? null };
}
