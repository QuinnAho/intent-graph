// the live server's write path: off without --write, only with the page's token from
// 127.0.0.1, only inside spec/, and a stale save is a conflict, never an overwrite.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseSpecTree } from '../src/parser/spec-md/index.js';
import { checkWriteRequest, isInsideSpec, localDate } from '../src/live/edit-api.js';
import { startLiveServer, type LiveServer } from '../src/live/server.js';

const TODAY = '2026-11-27';
const INTENT = [
  '---',
  'id: intent-a',
  '# a comment the save must keep',
  'title: First title',
  'parent: concept-c',
  'confidence: inferred',
  '---',
  '',
  '# First title',
  '',
  'Some body.',
  '',
].join('\r\n');

function workspace(): string {
  const d = mkdtempSync(join(tmpdir(), 'ig-edit-server-'));
  mkdirSync(join(d, 'spec', 'concepts'), { recursive: true });
  mkdirSync(join(d, 'spec', 'intents'), { recursive: true });
  mkdirSync(join(d, 'web'), { recursive: true });
  writeFileSync(join(d, 'spec', 'concepts', 'c.md'), '---\nid: concept-c\ntitle: C\nparent: null\nconfidence: asserted\nregeneration_scope: cooperative\n---\n');
  writeFileSync(join(d, 'spec', 'intents', 'a.md'), INTENT);
  writeFileSync(join(d, 'web', 'index.html'), '<html><head></head><body></body></html>');
  return d;
}

const flagOf = (html: string): Record<string, unknown> => JSON.parse(/__INTENTGRAPH_LIVE__ = (\{.*?\});/.exec(html)![1]!) as Record<string, unknown>;

async function waitFor(check: () => Promise<boolean>, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

describe('live server with --write', () => {
  let dir = '';
  let server: LiveServer;
  let token = '';
  const post = (path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
    fetch(`${server.url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-intentgraph-token': token, ...headers }, body: JSON.stringify(body) });
  const file = (): string => readFileSync(join(dir, 'spec', 'intents', 'a.md'), 'utf8');

  beforeAll(async () => {
    dir = workspace();
    server = await startLiveServer({ root: dir, port: 0, webDir: join(dir, 'web'), write: true, today: () => TODAY });
    const flag = flagOf(await (await fetch(server.url)).text());
    expect(flag['write']).toBe(true);
    token = String(flag['token']);
    expect(token.length).toBeGreaterThan(20);
  });
  afterAll(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads a node with its body without the heading, and its hash', async () => {
    const r = (await (await fetch(`${server.url}api/node?id=intent-a`)).json()) as Record<string, unknown>;
    expect(r).toMatchObject({ id: 'intent-a', kind: 'intent', file: 'spec/intents/a.md', title: 'First title', body: 'Some body.\n', writable: true });
    expect(typeof r['hash']).toBe('string');
  });

  it('refuses a save without the token, with a wrong token, or from another origin, and writes nothing', async () => {
    const { hash } = (await (await fetch(`${server.url}api/node?id=intent-a`)).json()) as { hash: string };
    const body = { title: 'Hacked', hash };
    expect((await post('api/node?id=intent-a', body, { 'x-intentgraph-token': '' })).status).toBe(403);
    expect((await post('api/node?id=intent-a', body, { 'x-intentgraph-token': 'f'.repeat(48) })).status).toBe(403);
    expect((await post('api/node?id=intent-a', body, { origin: 'http://evil.example' })).status).toBe(403);
    expect((await post('api/node?id=intent-a', body, { 'content-type': 'text/plain' })).status).toBe(415);
    expect(file()).toBe(INTENT);
  });

  it('saves a title edit, keeps every other byte, and the graph shows it', async () => {
    const { hash } = (await (await fetch(`${server.url}api/node?id=intent-a`)).json()) as { hash: string };
    const r = await post('api/node?id=intent-a', { title: 'Second title', body: 'Some body.\n', hash });
    expect(r.status).toBe(200);
    expect(file()).toBe(INTENT.replace('title: First title', 'title: Second title').replace('---\r\n\r\n# First title', `updated: ${TODAY}\r\n---\r\n\r\n# Second title`));
    const seen = await waitFor(async () => (await (await fetch(`${server.url}graph.json`)).text()).includes('"Second title"'), 5000);
    expect(seen).toBe(true);
  });

  it('reports a stale hash as a conflict and leaves the file alone', async () => {
    const before = file();
    const r = await post('api/node?id=intent-a', { title: 'Third title', hash: 'stale' });
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toBe('conflict');
    expect(file()).toBe(before);
  });

  it('refuses an empty title on save', async () => {
    const { hash } = (await (await fetch(`${server.url}api/node?id=intent-a`)).json()) as { hash: string };
    const before = file();
    const r = await post('api/node?id=intent-a', { title: '  ', hash });
    expect(r.status).toBe(422);
    expect(file()).toBe(before);
  });

  it('creates an intent under a concept, then refuses the same slug and an empty title', async () => {
    const r = await post('api/intents', { parent: 'concept-c', title: 'Divides safely' });
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ id: 'intent-divides-safely', file: 'spec/intents/divides-safely.md' });
    const tree = parseSpecTree(join(dir, 'spec'));
    expect(tree.errors).toEqual([]);
    expect(tree.nodes.find((n) => n.id === 'intent-divides-safely')).toMatchObject({ parentId: 'concept-c', confidence: 'asserted' });
    const names = readdirSync(join(dir, 'spec', 'intents')).sort();
    const dup = await post('api/intents', { parent: 'concept-c', title: 'Divides  safely!' });
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { error: string }).error).toBe('duplicate');
    expect((await post('api/intents', { parent: 'concept-c', title: '' })).status).toBe(422);
    expect((await post('api/intents', { parent: 'intent-a', title: 'Not under an intent' })).status).toBe(422);
    expect(readdirSync(join(dir, 'spec', 'intents')).sort()).toEqual(names);
  });
});

describe('live server without --write', () => {
  it('serves no token and refuses every write', async () => {
    const dir = workspace();
    const server = await startLiveServer({ root: dir, port: 0, webDir: join(dir, 'web') });
    try {
      const flag = flagOf(await (await fetch(server.url)).text());
      expect(flag['write']).toBe(false);
      expect(flag['token']).toBeUndefined();
      const node = (await (await fetch(`${server.url}api/node?id=intent-a`)).json()) as { writable: boolean; hash: string };
      expect(node.writable).toBe(false);
      const r = await fetch(`${server.url}api/node?id=intent-a`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-intentgraph-token': 'x' }, body: JSON.stringify({ title: 'No', hash: node.hash }) });
      expect(r.status).toBe(403);
      expect(((await r.json()) as { error: string }).error).toBe('read-only');
      const c = await fetch(`${server.url}api/intents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ parent: 'concept-c', title: 'No' }) });
      expect(c.status).toBe(403);
      expect(readFileSync(join(dir, 'spec', 'intents', 'a.md'), 'utf8')).toBe(INTENT);
      expect(readdirSync(join(dir, 'spec', 'intents'))).toEqual(['a.md']);
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('will not start writes on a host other than 127.0.0.1', async () => {
    await expect(startLiveServer({ root: tmpdir(), port: 0, host: '0.0.0.0', write: true })).rejects.toThrow(/127\.0\.0\.1/);
  });
});

describe('edit-api rules', () => {
  const gate = { write: true, token: 'tok', port: 4000 };
  const ok = { method: 'POST', host: '127.0.0.1:4000', origin: undefined, token: 'tok', contentType: 'application/json' };
  it('takes a good request and refuses each bad part', () => {
    expect(checkWriteRequest(ok, gate)).toBeNull();
    expect(checkWriteRequest({ ...ok, host: 'localhost:4000', origin: 'http://localhost:4000' }, gate)).toBeNull();
    expect(checkWriteRequest(ok, { ...gate, write: false })?.body['error']).toBe('read-only');
    expect(checkWriteRequest({ ...ok, host: 'evil.example:4000' }, gate)?.status).toBe(403);
    expect(checkWriteRequest({ ...ok, host: '127.0.0.1:4001' }, gate)?.status).toBe(403);
    expect(checkWriteRequest({ ...ok, origin: 'http://evil.example' }, gate)?.status).toBe(403);
    expect(checkWriteRequest({ ...ok, token: 'to' }, gate)?.status).toBe(403);
    expect(checkWriteRequest({ ...ok, token: undefined }, gate)?.status).toBe(403);
    expect(checkWriteRequest({ ...ok, method: 'GET' }, gate)?.status).toBe(405);
    expect(checkWriteRequest({ ...ok, contentType: 'text/plain' }, gate)?.status).toBe(415);
  });

  it('only counts .md files under spec as writable', () => {
    const dir = workspace();
    try {
      expect(isInsideSpec(dir, join(dir, 'spec', 'intents', 'a.md'))).toBe(true);
      expect(isInsideSpec(dir, join(dir, 'web', 'index.html'))).toBe(false);
      expect(isInsideSpec(dir, join(dir, 'spec', '..', 'web', 'index.html'))).toBe(false);
      expect(isInsideSpec(dir, join(dir, 'spec'))).toBe(false);
      expect(isInsideSpec(dir, join(dir, 'spec', 'intents', 'missing.md'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes dates as yyyy-mm-dd in local time', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
