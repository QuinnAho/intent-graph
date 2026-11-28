// the write side of the live server: who may write, and what a save or a create does.
// writes are off unless the server was started with --write. a write needs the token
// the server put in the page it served, a 127.0.0.1 or localhost host and origin, and
// json, so another site in the browser cannot post here. files are only ever written
// inside the workspace's spec/ folder.

import { mkdirSync, readFileSync, readdirSync, realpathSync, type Dirent } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

import type { InferProposalRow } from '@intentgraph/shared/schemas';

import { SPEC_WRITE_TUNING } from '../parser/spec-md/write-tuning.js';
import {
  checkTargetKinds,
  createIntentFile,
  editSpecSource,
  hashSpecSource,
  readSpecForEdit,
  slugFromTitle,
  writeSpecFileAtomic,
} from '../parser/spec-md/writer.js';
import { missingAnchors } from './compose.js';
import { addDismissed, settledText, type Settled } from './infer-marks.js';
import { settledPath } from './infer-reader.js';
import { checkParentChange, type ParentNode } from './parent-rules.js';

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

export interface ParentInput {
  /** the new parent id, or null to take the node out of its parent */
  readonly parent?: unknown;
  /** the parent the page saw, so a move on a stale graph is a conflict */
  readonly from?: unknown;
}

/** set or remove parent in a spec file, after the parent table and the loop check say yes */
export function setParent(
  root: string,
  target: EditTarget | null,
  childId: string,
  input: ParentInput,
  nodes: ReadonlyArray<ParentNode>,
  today: string,
): ApiReply & { readonly written?: string } {
  if (input.parent !== null && typeof input.parent !== 'string') return apiError(400, 'bad-request', 'parent must be a node id or null');
  if (input.from !== undefined && input.from !== null && typeof input.from !== 'string') return apiError(400, 'bad-request', 'from must be a node id or null');
  const no = checkParentChange(nodes, childId, input.parent);
  if (no) return apiError(no.status, no.error, no.message);
  if (!target || !isInsideSpec(root, target.file)) return apiError(422, 'invalid', `${childId} has no spec file to write`);
  let bytes: Buffer;
  try {
    bytes = readFileSync(target.file);
  } catch {
    return apiError(409, 'conflict', `${relPath(root, target.file)} was removed on disk`);
  }
  const source = bytes.toString('utf8');
  let current: string | null;
  try {
    current = readSpecForEdit(target.file, source).raw['parent'] as string | null;
  } catch (err) {
    return apiError(422, 'rejected', (err as Error).message);
  }
  if (input.from !== undefined && (input.from ?? null) !== (current ?? null)) {
    return apiError(409, 'conflict', `${childId} moved on disk since the graph was drawn. Nothing was written.`);
  }
  const edit = editSpecSource(target.file, source, { parent: input.parent }, today);
  if (!edit.ok) return apiError(422, edit.code === 'invalid' ? 'invalid' : 'rejected', edit.reason);
  if (!edit.changed) return { status: 200, body: { ok: true, changed: false } };
  writeSpecFileAtomic(target.file, edit.text);
  return { status: 200, body: { ok: true, changed: true, parent: input.parent, was: current ?? null }, written: relPath(root, target.file) };
}

export interface CreateInput {
  readonly title?: unknown;
  readonly parent?: unknown;
  readonly target_kinds?: unknown;
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
  const targetKinds = input.target_kinds === undefined ? [...SPEC_WRITE_TUNING.defaultTargetKinds] : input.target_kinds;
  const badKinds = checkTargetKinds(targetKinds);
  if (badKinds) return apiError(422, 'invalid', badKinds);
  const r = createIntentFile(resolve(root, 'spec'), { title: input.title, parent: parent.id, today, targetKinds: targetKinds as string[] });
  if (!r.ok) return apiError(r.code === 'duplicate' ? 409 : 422, r.code, r.reason);
  return { status: 201, body: { ok: true, id: r.id, file: relPath(root, r.file) }, written: relPath(root, r.file) };
}

/** id -> parent as the spec files hold them right now, read from disk. a file that does not parse is skipped. */
export function parentsOnDisk(root: string): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const walk = (dir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        try {
          const spec = readSpecForEdit(p, readFileSync(p, 'utf8'));
          const parent = spec.raw['parent'];
          out.set(spec.id, typeof parent === 'string' ? parent : null);
        } catch {
          // not a spec node, the build reports it
        }
      }
    }
  };
  walk(resolve(root, 'spec'));
  return out;
}

/** the cached nodes with each spec node's parent taken from the files, so the loop check sees what is on disk */
export function withParentsFromDisk(nodes: ReadonlyArray<ParentNode>, disk: ReadonlyMap<string, string | null>): ParentNode[] {
  return nodes.map((n) => (disk.has(n.id) ? { ...n, parent_id: disk.get(n.id) ?? null } : n));
}

export interface AcceptInput {
  /** a new title from the rename field, or left out to keep the proposal's own */
  readonly title?: unknown;
}

/** an accepted proposal becomes spec/intents/<slug>.md: its title, body, concept as parent and anchors as realized_by */
export function acceptProposal(
  root: string,
  proposal: InferProposalRow | null,
  input: AcceptInput,
  nodes: ReadonlyArray<{ readonly id: string; readonly kind: string }>,
  today: string,
): ApiReply & { readonly written?: string; readonly intent?: string } {
  if (!proposal) return apiError(404, 'not-found', 'that proposal is not open any more, the graph will catch up');
  if (input.title !== undefined && typeof input.title !== 'string') return apiError(400, 'bad-request', 'title must be text');
  const title = typeof input.title === 'string' ? input.title : proposal.title;
  if (title.trim().length === 0) return apiError(422, 'invalid', 'Give the intent a title.');
  const slug = slugFromTitle(title);
  if (slug && nodes.some((n) => n.id === `intent-${slug}`)) {
    return apiError(409, 'duplicate', `an intent with id intent-${slug} already exists, pick another title`);
  }
  // a concept the graph does not have would leave the file with a dangling parent, so it goes to the top
  const parent = proposal.belongs_under !== null && nodes.some((n) => n.id === proposal.belongs_under && n.kind === 'concept') ? proposal.belongs_under : null;
  const r = createIntentFile(resolve(root, 'spec'), {
    title,
    parent,
    today,
    targetKinds: [...SPEC_WRITE_TUNING.defaultTargetKinds],
    body: proposal.body,
    realizedBy: proposal.anchors,
  });
  if (!r.ok) return apiError(r.code === 'duplicate' ? 409 : 422, r.code, r.reason);
  // still written: a bad anchor is a warning in this tool, never a refusal. the reply says which ones.
  const missing = missingAnchors(proposal.anchors, nodes);
  return { status: 201, body: { ok: true, id: r.id, file: relPath(root, r.file), proposal: proposal.id, missing_anchors: missing }, written: relPath(root, r.file), intent: r.id };
}

/** write the settled list with one more dismissed proposal. only ever under .runs/infer, never spec/. */
export function dismissProposal(root: string, proposal: InferProposalRow | null, settled: Settled): ApiReply & { readonly written?: string } {
  if (!proposal) return apiError(404, 'not-found', 'that proposal is not open any more, the graph will catch up');
  const next = addDismissed(settled, proposal);
  if (next === settled) return apiError(409, 'conflict', 'that proposal is already dismissed');
  const file = settledPath(root);
  mkdirSync(dirname(file), { recursive: true });
  writeSpecFileAtomic(file, settledText(next));
  return { status: 200, body: { ok: true, dismissed: proposal.id }, written: relPath(root, file) };
}
