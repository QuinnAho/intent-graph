// two filters in front of a rebuild: skip a save whose content did not change,
// and batch saves so a burst rebuilds once. pattern borrowed from codegraph's
// adaptive debounce (MIT): short window for a lone save, longer for a burst.

import { createHash } from 'node:crypto';

export class ContentHashGate {
  private readonly hashes = new Map<string, string>();

  prime(path: string, content: string | Buffer): void {
    this.hashes.set(path, digest(content));
  }

  /** true when the content differs from the last seen content for this path */
  changed(path: string, content: string | Buffer): boolean {
    const h = digest(content);
    if (this.hashes.get(path) === h) return false;
    this.hashes.set(path, h);
    return true;
  }

  /** true the first time a known path is reported gone */
  removed(path: string): boolean {
    return this.hashes.delete(path);
  }
}

function digest(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export interface BatchTuning {
  readonly quietMs: number;
  readonly burstMs: number;
  readonly burstFiles: number;
}

export function pickWindow(pending: number, t: BatchTuning): number {
  return pending > t.burstFiles ? t.burstMs : t.quietMs;
}

export class ChangeBatcher {
  private pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly tuning: BatchTuning,
    private readonly flush: (paths: ReadonlySet<string>) => void,
  ) {}

  add(path: string): void {
    this.pending.add(path);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      const batch = this.pending;
      this.pending = new Set();
      this.flush(batch);
    }, pickWindow(this.pending.size, this.tuning));
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
  }
}
