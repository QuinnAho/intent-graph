// the last writes the server made, newest last, so one can be taken back. undo restores
// bytes, not meaning: the file goes back to exactly what it was, or a created file goes
// away. if the file changed since the write, undo refuses rather than lose that change.

import { readFileSync, unlinkSync } from 'node:fs';

import { hashSpecSource, writeSpecFileAtomic } from '../parser/spec-md/writer.js';
import { apiError, isInsideSpec, type ApiReply } from './edit-api.js';
import { isInsideInfer } from './infer-reader.js';

export interface UndoEntry {
  readonly file: string;
  /** path from the workspace root, for messages and the watcher */
  readonly rel: string;
  /** bytes before the write, null when the write created the file */
  readonly before: Buffer | null;
  readonly afterHash: string;
  readonly label: string;
  /** where the file lives: a spec file, or the settled list under .runs/infer. left out means spec. */
  readonly area?: 'spec' | 'infer';
}

export class UndoLog {
  private readonly entries: UndoEntry[] = [];

  constructor(private readonly limit: number) {}

  push(entry: UndoEntry): void {
    this.entries.push(entry);
    while (this.entries.length > this.limit) this.entries.shift();
  }

  size(): number {
    return this.entries.length;
  }

  peek(): UndoEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  /** take back the newest write. a refused entry is dropped, it can never apply again. */
  undo(root: string): ApiReply & { readonly written?: string } {
    const e = this.entries.pop();
    if (!e) return apiError(409, 'conflict', 'Nothing to undo.');
    const inside = e.area === 'infer' ? isInsideInfer(root, e.file) : isInsideSpec(root, e.file);
    if (!inside) return apiError(409, 'conflict', `${e.rel} is gone, that change can no longer be undone.`);
    let now: Buffer;
    try {
      now = readFileSync(e.file);
    } catch {
      return apiError(409, 'conflict', `${e.rel} is gone, that change can no longer be undone.`);
    }
    if (hashSpecSource(now) !== e.afterHash) {
      return apiError(409, 'conflict', `${e.rel} changed since then, so the change was not undone and the file was left alone.`);
    }
    if (e.before === null) unlinkSync(e.file);
    else writeSpecFileAtomic(e.file, e.before);
    return { status: 200, body: { ok: true, undone: e.label, file: e.rel, left: this.entries.length }, written: e.rel };
  }
}
