// the write side of the live server: who may write, and what a save or a create does.
// writes are off unless the server was started with --write. a write needs the token
// the server put in the page it served, a 127.0.0.1 or localhost host and origin, and
// json, so another site in the browser cannot post here. files are only ever written
// inside the workspace's spec/ folder.

import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

import {
  createIntentFile,
  editSpecSource,
  hashSpecSource,
  readSpecForEdit,
  slugFromTitle,
  writeSpecFileAtomic,
} from '../parser/spec-md/writer.js';

export type EditErrorCode =
  | 'read-only'
  | 'forbidden'
  | 'bad-request'
  | 'not-found'
  | 'conflict'
  | 'duplicate'
  | 'invalid'
  | 'rejected'
  | 'too-large';

export interface ApiReply {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export const apiError = (status: number, error: EditErrorCode, message: string): ApiReply => ({ status, body: { error, message } });

export interface WriteGate {
  readonly write: boolean;
  readonly token: string | null;
  readonly port: number;
}

export interface WriteRequest {
  readonly method: string;
  readonly host: string | undefined;
  readonly origin: string | undefined;
  readonly token: string | undefined;
  readonly contentType: string | undefined;
}

export const TOKEN_HEADER = 'x-intentgraph-token';

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** null when the request may write, otherwise the reply that refuses it */
export function checkWriteRequest(req: WriteRequest, gate: WriteGate): ApiReply | null {
  if (req.method !== 'POST') return apiError(405, 'bad-request', 'use POST to write');
  if (!gate.write || !gate.token) return apiError(403, 'read-only', 'this server is read only, start it with --write to edit');
  const hosts = [`127.0.0.1:${gate.port}`, `localhost:${gate.port}`];
  if (!req.host || !hosts.includes(req.host.toLowerCase())) return apiError(403, 'forbidden', 'writes are only taken on 127.0.0.1');
  if (req.origin !== undefined && !hosts.map((h) => `http://${h}`).includes(req.origin.toLowerCase())) {
    return apiError(403, 'forbidden', 'writes are only taken from the page this server served');
  }
  if (!req.token || !sameToken(req.token, gate.token)) return apiError(403, 'forbidden', 'missing or wrong edit token, reload the page');
  if (!req.contentType || !/^application\/json\b/i.test(req.contentType)) return apiError(415, 'bad-request', 'send json');
  return null;
}

/** yyyy-mm-dd in local time, the way people write created and updated by hand */
export function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** true only for a .md file under <root>/spec, after following links */
export function isInsideSpec(root: string, file: string): boolean {
  let spec: string;
  let target: string;
  try {
    spec = realpathSync(resolve(root, 'spec'));
    target = realpathSync(resolve(file));
  } catch {
    return false;
  }
  const rel = relative(spec, target);
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel) && target.toLowerCase().endsWith('.md');
}

function anchorStrings(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map((v) => String(v));
}

const relPath = (root: string, file: string): string => relative(root, file).split(sep).join('/');

export interface EditTarget {
  readonly id: string;
  readonly kind: string;
  readonly file: string;
}

/** what the panel loads: title, body without the mirrored heading, the hash it saves against */
export function loadForEdit(root: string, target: EditTarget, writable: boolean): ApiReply {
  if (!isInsideSpec(root, target.file)) return apiError(404, 'not-found', `${target.id} has no spec file`);
  let bytes: Buffer;
  try {
    bytes = readFileSync(target.file);
  } catch {
    return apiError(404, 'not-found', `${relPath(root, target.file)} is gone`);
  }
  try {
    const spec = readSpecForEdit(target.file, bytes.toString('utf8'));
    return {
      status: 200,
      body: {
        id: target.id,
        kind: target.kind,
        file: relPath(root, target.file),
        title: spec.title,
        body: spec.body,
        hash: hashSpecSource(bytes),
        writable,
        realized_by: anchorStrings(spec.raw['realized_by']),
        verified_by: anchorStrings(spec.raw['verified_by']),
      },
    };
  } catch (err) {
    return apiError(422, 'rejected', (err as Error).message);
  }
}

export interface SaveInput {
  readonly title?: unknown;
  readonly body?: unknown;
  readonly hash?: unknown;
}

/** save a title or body edit, unless the file changed on disk since the panel loaded it */
export function saveEdit(root: string, target: EditTarget, input: SaveInput, today: string): ApiReply & { readonly written?: string } {
  if (typeof input.hash !== 'string') return apiError(400, 'bad-request', 'a save needs the hash the panel loaded');
  if (input.title !== undefined && typeof input.title !== 'string') return apiError(400, 'bad-request', 'title must be text');
  if (input.body !== undefined && typeof input.body !== 'string') return apiError(400, 'bad-request', 'body must be text');
  if (!isInsideSpec(root, target.file)) return apiError(403, 'forbidden', 'that file is not inside spec/');
  let bytes: Buffer;
  try {
    bytes = readFileSync(target.file);
  } catch {
    return apiError(409, 'conflict', `${relPath(root, target.file)} was removed on disk`);
  }
  if (hashSpecSource(bytes) !== input.hash) {
    return apiError(409, 'conflict', 'The file changed on disk since you opened it. Nothing was saved. Cancel or Esc loads the version on disk.');
  }
  const edit = editSpecSource(target.file, bytes.toString('utf8'), {
    ...(typeof input.title === 'string' ? { title: input.title } : {}),
    ...(typeof input.body === 'string' ? { body: input.body } : {}),
  }, today);
  if (!edit.ok) return apiError(422, edit.code === 'invalid' ? 'invalid' : 'rejected', edit.reason);
  if (!edit.changed) return { status: 200, body: { ok: true, changed: false, hash: input.hash } };
  writeSpecFileAtomic(target.file, edit.text);
  return { status: 200, body: { ok: true, changed: true, hash: hashSpecSource(edit.text) }, written: relPath(root, target.file) };
}

export interface CreateInput {
  readonly title?: unknown;
  readonly parent?: unknown;
}

/** make spec/intents/<slug>.md under a concept. refuses a slug or id that is taken. */
export function createIntent(
  root: string,
  input: CreateInput,
  nodes: ReadonlyArray<{ readonly id: string; readonly kind: string }>,
  today: string,
): ApiReply & { readonly written?: string } {
  if (typeof input.title !== 'string' || typeof input.parent !== 'string') return apiError(400, 'bad-request', 'a create needs a title and a parent');
  if (input.title.trim().length === 0) return apiError(422, 'invalid', 'Give the intent a title.');
  const parent = nodes.find((n) => n.id === input.parent);
  if (!parent || parent.kind !== 'concept') return apiError(422, 'invalid', `${input.parent} is not a concept in this graph`);
  // the file name may be free while a file elsewhere uses the id, so check the graph first
  const slug = slugFromTitle(input.title);
  if (slug && nodes.some((n) => n.id === `intent-${slug}`)) {
    return apiError(409, 'duplicate', `an intent with id intent-${slug} already exists, pick another title`);
  }
  const r = createIntentFile(resolve(root, 'spec'), { title: input.title, parent: parent.id, today });
  if (!r.ok) return apiError(r.code === 'duplicate' ? 409 : 422, r.code, r.reason);
  return { status: 201, body: { ok: true, id: r.id, file: relPath(root, r.file) }, written: relPath(root, r.file) };
}
