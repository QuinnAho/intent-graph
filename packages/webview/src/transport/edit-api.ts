// talks to the live server's write side (packages/skill/src/live/edit-api.ts).
// the server puts { api, write, token } in the page it serves. without a token
// the page is read only, and the panel says why.

export interface EditConfig {
  /** base url of the api, or null when there is no live server */
  readonly api: string | null;
  readonly write: boolean;
  readonly token: string | null;
  /** why the panel is read only, null when it can write */
  readonly readOnlyReason: string | null;
}

export const NO_SERVER_REASON = 'Read only. This page is not connected to a live server.';
export const NO_WRITE_REASON = 'Read only. The server was started without --write.';

export function readEditConfig(flag: unknown): EditConfig {
  const f = flag && typeof flag === 'object' ? (flag as Record<string, unknown>) : null;
  if (!f || typeof f['graph'] !== 'string') return { api: null, write: false, token: null, readOnlyReason: NO_SERVER_REASON };
  const api = typeof f['api'] === 'string' ? f['api'] : '/api';
  const token = typeof f['token'] === 'string' && f['token'].length > 0 ? f['token'] : null;
  const write = f['write'] === true && token !== null;
  return { api, write, token, readOnlyReason: write ? null : NO_WRITE_REASON };
}

export interface EditableNode {
  readonly id: string;
  readonly kind: string;
  readonly file: string;
  readonly title: string;
  readonly body: string;
  readonly hash: string;
  readonly writable: boolean;
  readonly realized_by: ReadonlyArray<string>;
  readonly verified_by: ReadonlyArray<string>;
}

export type ApiResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string; readonly message: string };

/** the plain sentence shown on screen for a refused request */
export function editErrorMessage(status: number, body: unknown): { error: string; message: string } {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const error = typeof b['error'] === 'string' ? b['error'] : `http-${status}`;
  const given = typeof b['message'] === 'string' && b['message'].trim().length > 0 ? b['message'].trim() : null;
  if (error === 'read-only') return { error, message: 'This server is read only. Start it with --write to edit. Nothing was saved.' };
  if (error === 'conflict') return { error, message: given ?? 'The file changed on disk since you opened it. Nothing was saved.' };
  if (given) return { error, message: `${given.charAt(0).toUpperCase()}${given.slice(1)}${/[.!?]$/.test(given) ? '' : '.'} Nothing was saved.` };
  return { error, message: `The server refused the request (HTTP ${status}). Nothing was saved.` };
}

const UNREACHABLE = { ok: false as const, error: 'network', message: 'Could not reach the server. Nothing was saved.' };

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', ...init });
  } catch {
    return UNREACHABLE;
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) return { ok: false, ...editErrorMessage(res.status, body) };
  return { ok: true, value: body as T };
}

const writeInit = (config: EditConfig, body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-intentgraph-token': config.token ?? '' },
  body: JSON.stringify(body),
});

export function fetchEditableNode(config: EditConfig, id: string): Promise<ApiResult<EditableNode>> {
  if (!config.api) return Promise.resolve({ ok: false, error: 'no-server', message: NO_SERVER_REASON });
  return call<EditableNode>(`${config.api}/node?id=${encodeURIComponent(id)}`);
}

export function saveNode(config: EditConfig, id: string, edit: { title: string; body: string; hash: string }): Promise<ApiResult<{ hash: string; changed: boolean }>> {
  if (!config.api || !config.write) return Promise.resolve({ ok: false, error: 'read-only', message: config.readOnlyReason ?? NO_WRITE_REASON });
  return call(`${config.api}/node?id=${encodeURIComponent(id)}`, writeInit(config, edit));
}

export function createIntent(config: EditConfig, parent: string, title: string): Promise<ApiResult<{ id: string; file: string }>> {
  if (!config.api || !config.write) return Promise.resolve({ ok: false, error: 'read-only', message: config.readOnlyReason ?? NO_WRITE_REASON });
  return call(`${config.api}/intents`, writeInit(config, { parent, title }));
}
