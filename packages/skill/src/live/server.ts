// live graph server: builds the graph with the static builder, serves it as
// json, watches spec and source files, rebuilds and tells the page over
// server-sent events. node http only, chokidar for watching.
// with --write it also takes title and body saves and new intents, see edit-api.ts.

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, relative, resolve, sep } from 'node:path';

import { watch, type FSWatcher } from 'chokidar';

import { build, type BuildGraphResult } from '../build-graph.js';
import { readSpecAnchors, type NodeAnchors } from '../parser/spec-md/anchors.js';
import { ChangeBatcher, ContentHashGate, isWatchedFile } from './change-gate.js';
import { needsTestRun, type LinkedFiles, type TestReport } from './check-status.js';
import { TOKEN_HEADER, apiError, checkWriteRequest, createIntent, loadForEdit, localDate, saveEdit, type ApiReply, type EditTarget } from './edit-api.js';
import { composeLiveGraph, diffProblems, type LiveGraph, type LiveProblem } from './compose.js';
import { runLinkedTests, type TestRunHandle } from './test-runner.js';
import { LIVE_TUNING, type LiveTuning } from './tuning.js';

export interface LiveServerOptions {
  readonly root: string;
  /** 0 picks a free port */
  readonly port: number;
  readonly host?: string;
  /** built webview to serve at /, or null to serve only the api */
  readonly webDir?: string | null;
  readonly tuning?: LiveTuning;
  readonly log?: (line: string) => void;
  /** take saves and creates from the served page. only on 127.0.0.1. */
  readonly write?: boolean;
  /** test seam for the created and updated dates */
  readonly today?: () => string;
}

export interface LiveServer {
  readonly url: string;
  readonly port: number;
  version(): number;
  close(): Promise<void>;
}

// tested against the path inside root, so a root that itself sits under .wt still works
const IGNORED_DIRS = /[\\/](node_modules|\.git|dist|\.vite|\.intentgraph|\.runs|\.wt|claudemap)([\\/]|$)/;
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};
// tells the page it is talking to a live server, see webview transport/live-source.ts.
// the edit token rides along only when writes are on, so only this page can write.
function liveFlag(token: string | null): string {
  const flag = { graph: '/graph.json', events: '/events', api: '/api', write: token !== null, ...(token ? { token } : {}) };
  return `<script>window.__INTENTGRAPH_LIVE__ = ${JSON.stringify(flag)};</script>`;
}
const SPEC_NODE_KINDS = new Set(['intent', 'constraint', 'decision', 'concept']);

function sendJson(res: ServerResponse, reply: ApiReply): void {
  res.writeHead(reply.status, { 'content-type': MIME['.json']!, 'cache-control': 'no-store' });
  res.end(JSON.stringify(reply.body));
}

function readJsonBody(req: IncomingMessage, limit: number): Promise<{ readonly value: Record<string, unknown> } | { readonly reply: ApiReply }> {
  return new Promise((done) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) over = true;
      else chunks.push(c);
    });
    req.on('end', () => {
      if (over) return done({ reply: apiError(413, 'too-large', `the request is over ${limit} bytes`) });
      try {
        const v: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        done(v && typeof v === 'object' && !Array.isArray(v) ? { value: v as Record<string, unknown> } : { reply: apiError(400, 'bad-request', 'send a json object') });
      } catch {
        done({ reply: apiError(400, 'bad-request', 'the body is not json') });
      }
    });
    req.on('error', () => done({ reply: apiError(400, 'bad-request', 'the request broke off') }));
  });
}

export function linkedFiles(anchors: ReadonlyMap<string, NodeAnchors>): LinkedFiles {
  const tests = new Set<string>();
  const realized = new Set<string>();
  for (const a of anchors.values()) {
    for (const v of a.verifiedBy) tests.add(v.path);
    for (const r of a.realizedBy) realized.add(r.path);
  }
  return { tests, realized };
}

export async function startLiveServer(opts: LiveServerOptions): Promise<LiveServer> {
  const root = resolve(opts.root);
  const tuning = opts.tuning ?? LIVE_TUNING;
  const log = opts.log ?? (() => {});
  const webDir = opts.webDir === undefined || opts.webDir === null ? null : resolve(opts.webDir);
  const host = opts.host ?? '127.0.0.1';
  const write = opts.write === true;
  if (write && host !== '127.0.0.1') throw new Error('--write only listens on 127.0.0.1');
  const token = write ? randomBytes(24).toString('hex') : null;
  const today = opts.today ?? (() => localDate(new Date()));
  let port = 0;

  let version = 0;
  let result: BuildGraphResult | null = null;
  let anchors: ReadonlyMap<string, NodeAnchors & { readonly file: string }> = new Map();
  let linked: LinkedFiles = { tests: new Set(), realized: new Set() };
  let report: TestReport | null = null;
  let graph: LiveGraph | null = null;
  let graphText = '';
  let problems: LiveProblem[] = [];
  let testRun: TestRunHandle | null = null;
  let testsAgain = false;
  let closed = false;
  const clients = new Set<ServerResponse>();

  const publish = (): void => {
    if (!result) return;
    graph = composeLiveGraph(result, anchors, report, root);
    // one log line per new problem and per fixed file, not one per rebuild
    const changes = diffProblems(problems, graph.problems);
    for (const p of changes.added) log(`spec ${p.severity}: ${p.file}: ${p.message}`);
    for (const file of changes.fixed) log(`spec fixed: ${file}`);
    problems = graph.problems;
    version += 1;
    graph['_live_version'] = version;
    graphText = JSON.stringify(graph);
    for (const c of clients) c.write(`event: graph\ndata: ${JSON.stringify({ version })}\n\n`);
  };

  const rebuild = (why: string): void => {
    const t0 = Date.now();
    try {
      result = build({ repoRoot: root });
      anchors = readSpecAnchors(join(root, 'spec'));
    } catch (err) {
      // keep the last good graph, a half-saved file should not blank the page
      log(`rebuild failed (${why}): ${(err as Error).message}`);
      return;
    }
    publish();
    log(`rebuild v${version}: ${result.summary.nodes} nodes in ${Date.now() - t0} ms (${why})`);
  };

  const runTests = (): void => {
    if (closed) return;
    if (testRun) {
      testsAgain = true;
      return;
    }
    const files = [...linked.tests];
    const run = runLinkedTests(root, files, tuning.testTimeoutMs);
    testRun = run;
    if (run.pid !== undefined) log(`tests started pid ${run.pid}: ${files.length} linked files`);
    void run.done.then((r) => {
      testRun = null;
      if (closed) return;
      if (r.error) log(`tests: ${r.error}`);
      report = r.report;
      publish();
      const counts = { verified: 0, failed: 0, pending: 0 };
      for (const n of graph?.nodes ?? []) if (n.status) counts[n.status] += 1;
      log(`tests done v${version} in ${r.ms} ms: ${counts.verified} verified, ${counts.failed} failed, ${counts.pending} pending`);
      if (testsAgain) {
        testsAgain = false;
        runTests();
      }
    });
  };

  rebuild('start');
  linked = linkedFiles(anchors);
  runTests();

  const gate = new ContentHashGate();
  let ready = false;
  // the hash check runs when the batch flushes, so a truncate-then-write save
  // that ends with the same bytes is skipped
  const batcher = new ChangeBatcher(tuning, (queued) => {
    if (closed) return;
    const paths = new Set<string>();
    for (const p of queued) {
      let content: Buffer | null = null;
      try {
        content = readFileSync(join(root, p));
      } catch {
        content = null;
      }
      if (content === null ? gate.removed(p) : gate.changed(p, content)) paths.add(p);
    }
    if (paths.size === 0) return;
    const before = linked;
    rebuild([...paths].slice(0, 3).join(', ') + (paths.size > 3 ? ` and ${paths.size - 3} more` : ''));
    linked = linkedFiles(anchors);
    if (needsTestRun(paths, before, linked)) runTests();
  });
  const rel = (p: string): string => relative(root, p).split(sep).join('/');
  const onFile = (p: string): void => {
    if (!isWatchedFile(rel(p))) return;
    if (ready) {
      batcher.add(rel(p));
      return;
    }
    try {
      gate.prime(rel(p), readFileSync(p));
    } catch {
      // gone already, nothing to prime
    }
  };
  const watcher: FSWatcher = watch(root, { ignored: (p) => IGNORED_DIRS.test(sep + relative(root, p)), ignoreInitial: false, persistent: true });
  watcher.on('add', onFile);
  watcher.on('change', onFile);
  watcher.on('unlink', (p) => {
    if (isWatchedFile(rel(p))) batcher.add(rel(p));
  });
  watcher.on('error', (e) => log(`watcher error: ${(e as Error).message}`));
  await new Promise<void>((ok) => watcher.once('ready', () => ok()));
  ready = true;

  const server = createServer((req, res) => {
    void handle(req, res);
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/graph.json') {
      res.writeHead(200, { 'content-type': MIME['.json']!, 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      res.end(graphText);
      return;
    }
    if (url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'access-control-allow-origin': '*' });
      res.write(`retry: ${tuning.retryMs}\n\n`);
      res.write(`event: graph\ndata: ${JSON.stringify({ version })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (url.pathname === '/api/node' || url.pathname === '/api/intents') {
      await handleApi(req, res, url);
      return;
    }
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': MIME['.json']! });
      res.end(JSON.stringify({ version, testsRunning: testRun !== null, testPid: testRun?.pid ?? null }));
      return;
    }
    if (!webDir) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('no webview, start with --web <dir>');
      return;
    }
    const wanted = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = resolve(webDir, '.' + wanted);
    if (file !== webDir && !file.startsWith(webDir + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      let body: Buffer | string = await readFile(file);
      if (extname(file) === '.html') body = body.toString('utf8').replace('</head>', `${liveFlag(token)}</head>`);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  }

  const editTarget = (id: string | null): EditTarget | null => {
    const node = id ? graph?.nodes.find((n) => n.id === id) : undefined;
    const a = id ? anchors.get(id) : undefined;
    if (!node || !a || !SPEC_NODE_KINDS.has(node.kind)) return null;
    return { id: node.id, kind: node.kind, file: a.file };
  };

  async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    if (url.pathname === '/api/node' && req.method === 'GET') {
      const target = editTarget(url.searchParams.get('id'));
      sendJson(res, target ? loadForEdit(root, target, write) : apiError(404, 'not-found', 'no spec node with that id'));
      return;
    }
    const header = (name: string): string | undefined => {
      const v = req.headers[name];
      return Array.isArray(v) ? v[0] : v;
    };
    const refused = checkWriteRequest(
      { method: req.method ?? '', host: header('host'), origin: header('origin'), token: header(TOKEN_HEADER), contentType: header('content-type') },
      { write, token, port },
    );
    if (refused) {
      req.resume();
      sendJson(res, refused);
      return;
    }
    const read = await readJsonBody(req, tuning.maxRequestBytes);
    if ('reply' in read) {
      sendJson(res, read.reply);
      return;
    }
    const input = read.value;
    let reply: ApiReply & { readonly written?: string };
    if (url.pathname === '/api/node') {
      const target = editTarget(url.searchParams.get('id'));
      reply = target ? saveEdit(root, target, input, today()) : apiError(404, 'not-found', 'no spec node with that id');
    } else {
      reply = createIntent(root, input, graph?.nodes ?? [], today());
    }
    if (reply.written) {
      log(`wrote ${reply.written}`);
      // the watcher would catch it too, this just starts the quiet window now
      batcher.add(reply.written);
    } else if (reply.status >= 400) {
      log(`write refused (${reply.status}): ${String(reply.body['message'])}`);
    }
    sendJson(res, reply);
  }

  const keepAlive = setInterval(() => {
    for (const c of clients) c.write(': ping\n\n');
  }, tuning.keepAliveMs);

  await new Promise<void>((ok, bad) => {
    server.once('error', bad);
    server.listen(opts.port, host, () => ok());
  });
  port = (server.address() as AddressInfo).port;

  return {
    url: `http://${host}:${port}/`,
    port,
    version: () => version,
    close: async () => {
      if (closed) return;
      closed = true;
      batcher.stop();
      clearInterval(keepAlive);
      testRun?.cancel();
      await watcher.close();
      for (const c of clients) c.end();
      clients.clear();
      await new Promise<void>((ok) => {
        server.close(() => ok());
        server.closeAllConnections();
      });
    },
  };
}
