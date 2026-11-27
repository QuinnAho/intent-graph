// wiring on the graph writes parent into a person's spec file, so these tests pin which
// pairs may be wired, that every refusal writes nothing, and that undo restores the bytes.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PARENT_KINDS, checkParentChange } from '../src/live/parent-rules.js';
import { UndoLog } from '../src/live/undo-log.js';
import { hashSpecSource } from '../src/parser/spec-md/writer.js';
import { startLiveServer, type LiveServer } from '../src/live/server.js';

const TODAY = '2026-11-27';

const node = (id: string, kind: string, parent_id: string | null = null) => ({ id, kind, parent_id });
const NODES = [
  node('concept-top', 'concept'),
  node('concept-mid', 'concept', 'concept-top'),
  node('concept-low', 'concept', 'concept-mid'),
  node('concept-other', 'concept'),
  node('intent-a', 'intent', 'concept-top'),
  node('constraint-k', 'constraint', null),
  node('decision-d', 'decision', 'intent-a'),
  node('fn-add', 'function', null),
];

describe('parent rules', () => {
  it('names a parent kind for each spec kind and none for code', () => {
    expect(PARENT_KINDS).toEqual({ intent: ['concept'], constraint: ['intent', 'concept'], decision: ['intent', 'concept'], concept: ['concept'] });
  });

  it('takes the pairs the table allows, and a removal', () => {
    expect(checkParentChange(NODES, 'intent-a', 'concept-other')).toBeNull();
    expect(checkParentChange(NODES, 'constraint-k', 'intent-a')).toBeNull();
    expect(checkParentChange(NODES, 'constraint-k', 'concept-low')).toBeNull();
    expect(checkParentChange(NODES, 'decision-d', 'concept-top')).toBeNull();
    expect(checkParentChange(NODES, 'concept-other', 'concept-low')).toBeNull();
    expect(checkParentChange(NODES, 'intent-a', null)).toBeNull();
  });

  it('refuses a missing node, a missing target, the node itself, code nodes, wrong pairs and loops', () => {
    const status = (child: string, parent: string | null): number | undefined => checkParentChange(NODES, child, parent)?.status;
    expect(status('intent-gone', 'concept-top')).toBe(404);
    expect(status('intent-a', 'concept-gone')).toBe(422);
    expect(status('intent-a', 'intent-a')).toBe(422);
    expect(status('fn-add', 'concept-top')).toBe(422);
    expect(status('constraint-k', 'fn-add')).toBe(422);
    expect(status('intent-a', 'constraint-k')).toBe(422);
    expect(status('concept-top', 'intent-a')).toBe(422);
    expect(status('concept-top', 'concept-low')).toBe(422);
    expect(status('concept-top', 'concept-mid')).toBe(422);
    for (const [c, p] of [['intent-gone', 'concept-top'], ['intent-a', 'intent-a'], ['concept-top', 'concept-low'], ['fn-add', 'concept-top']] as const) {
      expect(checkParentChange(NODES, c, p)?.message).toMatch(/\w/);
    }
  });
});

describe('undo log', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ig-undo-'));
    mkdirSync(join(dir, 'spec'), { recursive: true });
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps only the newest entries up to its limit', () => {
    const log = new UndoLog(3);
    for (let i = 0; i < 5; i++) log.push({ file: join(dir, 'spec', `${i}.md`), rel: `spec/${i}.md`, before: null, afterHash: 'x', label: `w${i}` });
    expect(log.size()).toBe(3);
    expect(log.peek()?.label).toBe('w4');
  });

  it('restores a file byte for byte, removes a created one, and refuses when a file moved on', () => {
    const log = new UndoLog(20);
    const f = join(dir, 'spec', 'a.md');
    const before = Buffer.from('---\r\nid: a\r\n---\r\n# A\r\n');
    writeFileSync(f, 'after');
    log.push({ file: f, rel: 'spec/a.md', before, afterHash: hashSpecSource('after'), label: 'save a' });
    const made = join(dir, 'spec', 'made.md');
    writeFileSync(made, 'made');
    log.push({ file: made, rel: 'spec/made.md', before: null, afterHash: hashSpecSource('made'), label: 'create made' });
    const g = join(dir, 'spec', 'g.md');
    writeFileSync(g, 'changed by hand');
    log.push({ file: g, rel: 'spec/g.md', before: Buffer.from('old'), afterHash: hashSpecSource('written'), label: 'save g' });

    const refused = log.undo(dir);
    expect(refused.status).toBe(409);
    expect(String(refused.body['message'])).toMatch(/changed/);
    expect(readFileSync(g, 'utf8')).toBe('changed by hand');

    const r1 = log.undo(dir);
    expect(r1.status).toBe(200);
    expect(existsSync(made)).toBe(false);
    const r2 = log.undo(dir);
    expect(r2.status).toBe(200);
    expect(readFileSync(f).equals(before)).toBe(true);
    expect(log.undo(dir).status).toBe(409);
  });
});

const INTENT = ['---', 'id: intent-a', '# keep me', 'title: A', 'parent: concept-c', 'confidence: inferred', 'updated: 2026-01-01', '---', '', '# A', ''].join('\r\n');
const CONSTRAINT = ['---', 'id: constraint-k', 'title: K', 'parent: null', 'confidence: asserted', '---', ''].join('\n');

function workspace(): string {
  const d = mkdtempSync(join(tmpdir(), 'ig-parent-server-'));
  for (const k of ['concepts', 'intents', 'constraints']) mkdirSync(join(d, 'spec', k), { recursive: true });
  mkdirSync(join(d, 'src'), { recursive: true });
  writeFileSync(join(d, 'spec', 'concepts', 'c.md'), '---\nid: concept-c\ntitle: C\nparent: null\nconfidence: asserted\n---\n');
  writeFileSync(join(d, 'spec', 'concepts', 'd.md'), '---\nid: concept-d\ntitle: D\nparent: concept-c\nconfidence: asserted\n---\n');
  writeFileSync(join(d, 'spec', 'intents', 'a.md'), INTENT);
  writeFileSync(join(d, 'spec', 'constraints', 'k.md'), CONSTRAINT);
  writeFileSync(join(d, 'src', 'add.ts'), 'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
  return d;
}

async function waitFor(check: () => Promise<boolean>, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

describe('live server parent edits and undo', () => {
  let dir = '';
  let server: LiveServer;
  let token = '';
  const post = (path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
    fetch(`${server.url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-intentgraph-token': token, ...headers }, body: JSON.stringify(body) });
  const read = (rel: string): string => readFileSync(join(dir, rel), 'utf8');
  const all = (): string[] => ['spec/intents/a.md', 'spec/constraints/k.md', 'spec/concepts/c.md', 'spec/concepts/d.md'].map(read);
  const graphHas = (needle: string): Promise<boolean> => waitFor(async () => (await (await fetch(`${server.url}graph.json`)).text()).includes(needle), 5000);

  beforeAll(async () => {
    dir = workspace();
    // the token rides in the served page, so read it the way the page would
    mkdirSync(join(dir, 'web'));
    writeFileSync(join(dir, 'web', 'index.html'), '<html><head></head><body></body></html>');
    server = await startLiveServer({ root: dir, port: 0, webDir: join(dir, 'web'), write: true, today: () => TODAY });
    token = String((JSON.parse(/__INTENTGRAPH_LIVE__ = (\{.*?\});/.exec(await (await fetch(server.url)).text())![1]!) as Record<string, unknown>)['token']);
  });
  afterAll(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses each bad request with a 4xx and a reason, and writes nothing', async () => {
    const before = all();
    const cases: Array<[string, unknown, number]> = [
      ['api/parent?id=constraint-k', { parent: 'intent-gone' }, 422],
      ['api/parent?id=intent-a', { parent: 'intent-a' }, 422],
      ['api/parent?id=intent-a', { parent: 'constraint-k' }, 422],
      ['api/parent?id=concept-c', { parent: 'concept-d' }, 422],
      ['api/parent?id=intent-gone', { parent: 'concept-c' }, 404],
      ['api/parent?id=intent-a', { parent: 42 }, 400],
      ['api/parent?id=intent-a', { parent: 'concept-d', from: 'concept-d' }, 409],
    ];
    const code = (JSON.parse(await (await fetch(`${server.url}graph.json`)).text()) as { nodes: Array<{ id: string; kind: string }> }).nodes.find((n) => !['intent', 'constraint', 'decision', 'concept'].includes(n.kind));
    expect(code).toBeDefined();
    cases.push([`api/parent?id=constraint-k`, { parent: code!.id }, 422], [`api/parent?id=${encodeURIComponent(code!.id)}`, { parent: 'concept-c' }, 422]);
    for (const [path, body, status] of cases) {
      const r = await post(path, body);
      expect([path, r.status]).toEqual([path, status]);
      expect(String(((await r.json()) as { message: string }).message).length).toBeGreaterThan(5);
    }
    expect((await post('api/parent?id=intent-a', { parent: 'concept-d' }, { 'x-intentgraph-token': '' })).status).toBe(403);
    expect((await post('api/parent?id=intent-a', { parent: 'concept-d' }, { origin: 'http://evil.example' })).status).toBe(403);
    expect((await post('api/undo', {}, { 'x-intentgraph-token': '' })).status).toBe(403);
    expect(all()).toEqual(before);
  });

  it('wires, moves and removes a parent, and undo puts each file back byte for byte', async () => {
    const k0 = read('spec/constraints/k.md');
    const a0 = read('spec/intents/a.md');
    const wired = await post('api/parent?id=constraint-k', { parent: 'intent-a', from: null });
    expect(wired.status).toBe(200);
    expect(read('spec/constraints/k.md')).toBe(k0.replace('parent: null', 'parent: intent-a').replace('confidence: asserted\n', `confidence: asserted\nupdated: ${TODAY}\n`));
    const moved = await post('api/parent?id=intent-a', { parent: 'concept-d', from: 'concept-c' });
    expect(moved.status).toBe(200);
    expect(read('spec/intents/a.md')).toBe(a0.replace('parent: concept-c', 'parent: concept-d').replace('updated: 2026-01-01', `updated: ${TODAY}`));
    expect(await graphHas('"parent_id":"concept-d"')).toBe(true);
    const cut = await post('api/parent?id=constraint-k', { parent: null, from: 'intent-a' });
    expect(cut.status).toBe(200);

    for (let i = 0; i < 3; i++) expect((await post('api/undo', {})).status).toBe(200);
    expect(read('spec/constraints/k.md')).toBe(k0);
    expect(read('spec/intents/a.md')).toBe(a0);
    const none = await post('api/undo', {});
    expect(none.status).toBe(409);
  });

  it('undoes a create by removing the file, and a save', async () => {
    const made = await post('api/intents', { parent: 'concept-c', title: 'Made here' });
    expect(made.status).toBe(201);
    expect(existsSync(join(dir, 'spec', 'intents', 'made-here.md'))).toBe(true);
    expect((await post('api/undo', {})).status).toBe(200);
    expect(existsSync(join(dir, 'spec', 'intents', 'made-here.md'))).toBe(false);

    await graphHas('"title":"A"');
    const a0 = read('spec/intents/a.md');
    const { hash } = (await (await fetch(`${server.url}api/node?id=intent-a`)).json()) as { hash: string };
    expect((await post('api/node?id=intent-a', { title: 'A two', hash })).status).toBe(200);
    expect((await post('api/undo', {})).status).toBe(200);
    expect(read('spec/intents/a.md')).toBe(a0);
  });

  it('refuses an undo when the file changed by hand since the write', async () => {
    await graphHas('"parent_id":"concept-c"');
    const r = await post('api/parent?id=intent-a', { parent: 'concept-d' });
    expect(r.status).toBe(200);
    const handEdit = read('spec/intents/a.md') + 'a line typed by hand\r\n';
    writeFileSync(join(dir, 'spec', 'intents', 'a.md'), handEdit);
    const u = await post('api/undo', {});
    expect(u.status).toBe(409);
    expect(read('spec/intents/a.md')).toBe(handEdit);
  });
});

const concept = (id: string, parent: string): string => `---\nid: ${id}\ntitle: ${id}\nparent: ${parent}\nconfidence: asserted\n---\n`;

describe('writes that arrive together', () => {
  let dir = '';
  let server: LiveServer;
  let token = '';
  const post = (path: string, body: unknown): Promise<Response> =>
    fetch(`${server.url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-intentgraph-token': token }, body: JSON.stringify(body) });

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ig-race-'));
    mkdirSync(join(dir, 'spec', 'concepts'), { recursive: true });
    mkdirSync(join(dir, 'web'));
    writeFileSync(join(dir, 'web', 'index.html'), '<html><head></head><body></body></html>');
    writeFileSync(join(dir, 'spec', 'concepts', 'c.md'), concept('concept-c', 'null'));
    writeFileSync(join(dir, 'spec', 'concepts', 'd.md'), concept('concept-d', 'null'));
    server = await startLiveServer({ root: dir, port: 0, webDir: join(dir, 'web'), write: true, today: () => TODAY });
    token = String((JSON.parse(/__INTENTGRAPH_LIVE__ = (\{.*?\});/.exec(await (await fetch(server.url)).text())![1]!) as Record<string, unknown>)['token']);
  });
  afterAll(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses the second of two requests that would make a loop, however fast it comes', async () => {
    const c0 = readFileSync(join(dir, 'spec', 'concepts', 'c.md'), 'utf8');
    const d0 = readFileSync(join(dir, 'spec', 'concepts', 'd.md'), 'utf8');
    for (let round = 0; round < 5; round++) {
      const [a, b] = await Promise.all([post('api/parent?id=concept-c', { parent: 'concept-d' }), post('api/parent?id=concept-d', { parent: 'concept-c' })]);
      expect([a.status, b.status]).toEqual([200, 422]);
      const c = readFileSync(join(dir, 'spec', 'concepts', 'c.md'), 'utf8');
      const d = readFileSync(join(dir, 'spec', 'concepts', 'd.md'), 'utf8');
      expect(c.includes('parent: concept-d') && d.includes('parent: concept-c')).toBe(false);
      expect(d).toBe(d0);
      expect((await post('api/undo', {})).status).toBe(200);
      expect(readFileSync(join(dir, 'spec', 'concepts', 'c.md'), 'utf8')).toBe(c0);
    }
  });

  it('keeps writes in the order they arrived', async () => {
    const replies = await Promise.all([
      post('api/parent?id=concept-c', { parent: 'concept-d' }),
      post('api/parent?id=concept-c', { parent: null }),
      post('api/parent?id=concept-c', { parent: 'concept-d' }),
    ]);
    expect(replies.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(readFileSync(join(dir, 'spec', 'concepts', 'c.md'), 'utf8')).toContain('parent: concept-d');
    for (let i = 0; i < 3; i++) expect((await post('api/undo', {})).status).toBe(200);
    expect(readFileSync(join(dir, 'spec', 'concepts', 'c.md'), 'utf8')).toBe(concept('concept-c', 'null'));
  });

  it('checks the loop against the files on disk, not the cached graph', async () => {
    // a hand edit the watcher may not have seen yet
    writeFileSync(join(dir, 'spec', 'concepts', 'd.md'), concept('concept-d', 'concept-c'));
    const r = await post('api/parent?id=concept-c', { parent: 'concept-d' });
    expect(r.status).toBe(422);
    expect(readFileSync(join(dir, 'spec', 'concepts', 'c.md'), 'utf8')).toBe(concept('concept-c', 'null'));
    writeFileSync(join(dir, 'spec', 'concepts', 'd.md'), concept('concept-d', 'null'));
  });
});

describe('a loop made by hand', () => {
  it('answers with one problem that names the files and does not hang', async () => {
    const d = mkdtempSync(join(tmpdir(), 'ig-loop-'));
    mkdirSync(join(d, 'spec', 'concepts'), { recursive: true });
    writeFileSync(join(d, 'spec', 'concepts', 'p.md'), concept('concept-p', 'concept-q'));
    writeFileSync(join(d, 'spec', 'concepts', 'q.md'), concept('concept-q', 'concept-p'));
    writeFileSync(join(d, 'spec', 'concepts', 'r.md'), concept('concept-r', 'concept-q'));
    const s = await startLiveServer({ root: d, port: 0, write: true, today: () => TODAY });
    try {
      const g = (await (await fetch(`${s.url}graph.json`, { signal: AbortSignal.timeout(5000) })).json()) as { problems: Array<{ severity: string; file: string; message: string }> };
      const loops = g.problems.filter((p) => /loop/i.test(p.message));
      expect(loops).toHaveLength(1);
      expect(loops[0]!.message).toContain('p.md');
      expect(loops[0]!.message).toContain('q.md');
      expect(loops[0]!.message).not.toContain('r.md');
    } finally {
      await s.close();
      rmSync(d, { recursive: true, force: true });
    }
  });
});
