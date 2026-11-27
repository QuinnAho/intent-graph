// accept and dismiss on the live server: an accept writes a real intent file, a dismiss
// writes only .runs/infer/settled.json, undo takes either back byte for byte, and a
// read only server writes nothing.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { InferProposalRow } from '@intentgraph/shared/schemas';

import { readAnchors } from '../src/parser/spec-md/anchors.js';
import { parseFrontmatter } from '../src/parser/spec-md/frontmatter.js';
import { readSpecForEdit } from '../src/parser/spec-md/writer.js';
import { startLiveServer, type LiveServer } from '../src/live/server.js';

const TODAY = '2026-11-27';
const ANCHORS = ['src/run.ts#runAll', 'src/cli.ts'];
const row = (id: string, over: Partial<InferProposalRow> = {}): InferProposalRow => ({
  id, folder: 'src', title: `Title ${id}`, body: `Body of ${id}.`, anchors: ANCHORS,
  belongs_under: 'concept-c', restates: null, confidence: 'inferred', planned: false, code_hash: 'h1', ...over,
});

function workspace(): string {
  const d = mkdtempSync(join(tmpdir(), 'ig-infer-server-'));
  mkdirSync(join(d, 'spec', 'concepts'), { recursive: true });
  mkdirSync(join(d, 'spec', 'intents'), { recursive: true });
  mkdirSync(join(d, 'src'), { recursive: true });
  mkdirSync(join(d, 'web'), { recursive: true });
  mkdirSync(join(d, '.runs', 'infer', 'r1'), { recursive: true });
  writeFileSync(join(d, 'spec', 'concepts', 'c.md'), '---\nid: concept-c\ntitle: C\nparent: null\nconfidence: asserted\nregeneration_scope: cooperative\n---\n');
  writeFileSync(join(d, 'src', 'run.ts'), 'export function runAll(): number {\n  return 1;\n}\n');
  writeFileSync(join(d, 'src', 'cli.ts'), 'export const cli = 1;\n');
  writeFileSync(join(d, 'web', 'index.html'), '<html><head></head><body></body></html>');
  writeFileSync(join(d, '.runs', 'infer', 'r1', 'report.json'), JSON.stringify({ result: 'PASS', report: { proposals: [row('inf-1'), row('inf-2', { belongs_under: null }), row('inf-3')] } }));
  writeFileSync(join(d, '.runs', 'infer', 'latest.json'), JSON.stringify({ result: 'PASS', report: '.runs/infer/r1/report.json' }));
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

interface GNode { id: string; parent_id: string | null; inferred?: Record<string, unknown> }
const ids = async (server: LiveServer): Promise<string[]> => ((await (await fetch(`${server.url}graph.json`)).json()) as { nodes: GNode[] }).nodes.map((n) => n.id);
const specFiles = (d: string): string[] => readdirSync(join(d, 'spec', 'intents')).sort();

describe('inferred proposals on a --write server', () => {
  let dir = '';
  let server: LiveServer;
  let token = '';
  const post = (path: string, body: unknown): Promise<Response> =>
    fetch(`${server.url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-intentgraph-token': token }, body: JSON.stringify(body) });

  beforeAll(async () => {
    dir = workspace();
    server = await startLiveServer({ root: dir, port: 0, webDir: join(dir, 'web'), write: true, today: () => TODAY });
    token = String(flagOf(await (await fetch(server.url)).text())['token']);
  });
  afterAll(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('shows each proposal as an inferred node', async () => {
    const g = (await (await fetch(`${server.url}graph.json`)).json()) as { nodes: GNode[] };
    const one = g.nodes.find((n) => n.id === 'inferred:inf-1');
    expect(one?.parent_id).toBe('concept-c');
    expect(one?.inferred?.['proposal_id']).toBe('inf-1');
    expect(g.nodes.find((n) => n.id === 'inferred:inf-2')?.parent_id).toBeNull();
  });

  it('accepts a proposal into a file that reads back the same, and undo removes it', async () => {
    const r = await post('api/inferred/accept?id=inferred:inf-1', {});
    expect(r.status).toBe(201);
    const body = (await r.json()) as { id: string; file: string };
    expect(body).toMatchObject({ id: 'intent-title-inf-1', file: 'spec/intents/title-inf-1.md' });
    const text = readFileSync(join(dir, body.file), 'utf8');
    const parsed = parseFrontmatter('x.md', text);
    expect(parsed.minimum).toMatchObject({ title: 'Title inf-1', parent: 'concept-c' });
    expect(readSpecForEdit('x.md', text).body).toBe('Body of inf-1.\n');
    expect(readAnchors(parsed.raw).realizedBy.map((a) => a.raw)).toEqual(ANCHORS);
    expect(text).toContain('target_kinds:\n  - code_module\n');
    expect(await waitFor(async () => { const n = await ids(server); return n.includes('intent-title-inf-1') && !n.includes('inferred:inf-1'); }, 5000)).toBe(true);
    // the spec was not touched outside the new file, and settled.json is tool state under .runs
    expect(existsSync(join(dir, '.runs', 'infer', 'settled.json'))).toBe(true);

    const u = await post('api/undo', {});
    expect(u.status).toBe(200);
    expect(existsSync(join(dir, body.file))).toBe(false);
    expect(await waitFor(async () => { const n = await ids(server); return !n.includes('intent-title-inf-1') && n.includes('inferred:inf-1'); }, 5000)).toBe(true);
  });

  it('accepts under a new title and a proposal with no concept at the top', async () => {
    const r = await post('api/inferred/accept?id=inferred:inf-2', { title: 'Renamed: first' });
    expect(r.status).toBe(201);
    const { file } = (await r.json()) as { file: string };
    expect(file).toBe('spec/intents/renamed-first.md');
    const parsed = parseFrontmatter('x.md', readFileSync(join(dir, file), 'utf8'));
    expect(parsed.minimum).toMatchObject({ title: 'Renamed: first', parent: null });
    expect((await post('api/undo', {})).status).toBe(200);
    expect(existsSync(join(dir, file))).toBe(false);
  });

  it('dismisses into .runs/infer only, and undo puts the bytes back', async () => {
    const spec = specFiles(dir);
    const settled = join(dir, '.runs', 'infer', 'settled.json');
    const before = readFileSync(settled);
    const r = await post('api/inferred/dismiss?id=inferred:inf-3', {});
    expect(r.status).toBe(200);
    expect(specFiles(dir)).toEqual(spec);
    expect(JSON.parse(readFileSync(settled, 'utf8')).dismissed).toContainEqual({ id: 'inf-3', code_hash: 'h1' });
    expect(await waitFor(async () => !(await ids(server)).includes('inferred:inf-3'), 5000)).toBe(true);
    expect((await post('api/undo', {})).status).toBe(200);
    expect(readFileSync(settled).equals(before)).toBe(true);
    expect(await waitFor(async () => (await ids(server)).includes('inferred:inf-3'), 5000)).toBe(true);
  });

  it('keeps a dismissed id hidden on a new report with the same code', async () => {
    expect((await post('api/inferred/dismiss?id=inferred:inf-3', {})).status).toBe(200);
    writeFileSync(join(dir, '.runs', 'infer', 'r1', 'report.json'), JSON.stringify({ result: 'PASS', report: { proposals: [row('inf-1'), row('inf-2', { belongs_under: null }), row('inf-3'), row('inf-4')] } }));
    expect(await waitFor(async () => (await ids(server)).includes('inferred:inf-4'), 5000)).toBe(true);
    expect(await ids(server)).not.toContain('inferred:inf-3');
    expect((await post('api/undo', {})).status).toBe(200);
  });

  it('takes one of two accepts of the same proposal sent together, and writes one file', async () => {
    const before = specFiles(dir);
    const [a, b] = await Promise.all([post('api/inferred/accept?id=inferred:inf-1', {}), post('api/inferred/accept?id=inferred:inf-1', {})]);
    expect([a.status, b.status].filter((s) => s === 201)).toHaveLength(1);
    expect([a.status, b.status].filter((s) => s >= 400)).toHaveLength(1);
    expect(specFiles(dir)).toEqual([...before, 'title-inf-1.md'].sort());
    expect((await post('api/undo', {})).status).toBe(200);
    expect(specFiles(dir)).toEqual(before);
  });

  it('refuses an unknown proposal and a bad title without writing', async () => {
    const before = specFiles(dir);
    expect((await post('api/inferred/accept?id=inferred:nope', {})).status).toBe(404);
    expect((await post('api/inferred/dismiss?id=intent-x', {})).status).toBe(404);
    expect((await post('api/inferred/accept?id=inferred:inf-1', { title: 5 })).status).toBe(400);
    expect((await post('api/inferred/accept?id=inferred:inf-1', { title: 'a\nb' })).status).toBe(422);
    expect(specFiles(dir)).toEqual(before);
  });
});

describe('inferred proposals on a read only server', () => {
  let dir = '';
  let server: LiveServer;
  beforeAll(async () => {
    dir = workspace();
    server = await startLiveServer({ root: dir, port: 0, webDir: join(dir, 'web'), write: false, today: () => TODAY });
  });
  afterAll(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('shows the proposals and refuses accept and dismiss', async () => {
    expect(await ids(server)).toContain('inferred:inf-1');
    for (const path of ['api/inferred/accept?id=inferred:inf-1', 'api/inferred/dismiss?id=inferred:inf-1']) {
      const r = await fetch(`${server.url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      expect(r.status).toBe(403);
    }
    expect(specFiles(dir)).toEqual([]);
    expect(existsSync(join(dir, '.runs', 'infer', 'settled.json'))).toBe(false);
  });
});
