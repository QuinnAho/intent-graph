// Minimal unified-diff reader: git diff text to hunks per file, keyed by the new path
// (or the old path for a deleted file).

export interface Hunk {
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  /** The `@@ ... @@` line plus every body line, joined with \n. */
  readonly text: string;
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function stripPrefix(p: string): string | null {
  const t = p.trim();
  if (t === '/dev/null') return null;
  return t.replace(/^[ab]\//, '');
}

export function parseUnifiedDiff(diff: string): Map<string, Hunk[]> {
  const out = new Map<string, Hunk[]>();
  let oldPath: string | null = null;
  let current: Hunk[] | null = null;
  let hunk: { head: [number, number, number, number]; lines: string[] } | null = null;

  const flush = (): void => {
    if (hunk && current) {
      const [oldStart, oldLines, newStart, newLines] = hunk.head;
      current.push({ oldStart, oldLines, newStart, newLines, text: hunk.lines.join('\n') });
    }
    hunk = null;
  };

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      flush();
      current = null;
      oldPath = null;
      continue;
    }
    if (line.startsWith('--- ') && !hunk) {
      oldPath = stripPrefix(line.slice(4));
      continue;
    }
    if (line.startsWith('+++ ') && !hunk) {
      const key = stripPrefix(line.slice(4)) ?? oldPath;
      if (key) {
        current = out.get(key) ?? [];
        out.set(key, current);
      }
      continue;
    }
    const m = HUNK_RE.exec(line);
    if (m) {
      flush();
      hunk = {
        head: [Number(m[1]), m[2] === undefined ? 1 : Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])],
        lines: [line],
      };
      continue;
    }
    if (hunk && (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-') || line.startsWith('\\'))) {
      hunk.lines.push(line);
      continue;
    }
    // anything else (blank tail, index lines) ends the hunk
    flush();
  }
  flush();
  return out;
}
