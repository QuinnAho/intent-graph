// decides what an intentgraph.open message from the page may open (ADR 0032).
// no vscode import here, so the rules run in plain unit tests. the page is a
// local server's page, still it is treated as untrusted input: only a relative
// path with forward slashes that stays inside the workspace gets through.

export type OpenDecision =
  | { readonly ok: true; readonly segments: readonly string[]; readonly line: number }
  | { readonly ok: false; readonly reason: string };

const refuse = (reason: string): OpenDecision => ({ ok: false, reason });

export function decideOpen(msg: unknown): OpenDecision {
  if (msg === null || typeof msg !== 'object') return refuse('not an object');
  const m = msg as Record<string, unknown>;
  if (m['type'] !== 'intentgraph.open') return refuse('not an open message');
  const path = m['path'];
  if (typeof path !== 'string') return refuse('path is not a string');
  if (path.length === 0) return refuse('empty path');
  // backslashes and colons would let a windows drive, a unc share or a url slip past the checks below
  if (path.includes('\\') || path.includes(':') || path.includes('\0')) return refuse('path has a backslash, colon or nul');
  if (path.startsWith('/')) return refuse('absolute path');

  const segments: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (segments.length === 0) return refuse('path leaves the workspace');
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  if (segments.length === 0) return refuse('path names the workspace itself');

  const line = m['line'];
  if (line === undefined) return { ok: true, segments, line: 1 };
  if (typeof line !== 'number' || !Number.isInteger(line) || line < 1) return refuse('line is not a whole number from 1');
  return { ok: true, segments, line };
}

/** the editor column a file opens in, so it never covers the panel. columns count from 1. */
export function otherColumn(panelColumn: number | undefined): number {
  return panelColumn === 1 ? 2 : 1;
}
