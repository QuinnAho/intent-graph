// live graph server: builds the graph with the static builder, serves it as
// json, watches spec and source files, rebuilds and tells the page over
// server-sent events. node http only, chokidar for watching.

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, relative, resolve, sep } from 'node:path';

import { watch, type FSWatcher } from 'chokidar';

import { build, type BuildGraphResult } from '../build-graph.js';
import { readSpecAnchors, type NodeAnchors } from '../parser/spec-md/anchors.js';
import { ChangeBatcher, ContentHashGate } from './change-gate.js';
import { needsTestRun, type LinkedFiles, type TestReport } from './check-status.js';
import { composeLiveGraph, type LiveGraph } from './compose.js';
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
// tells the page it is talking to a live server, see webview transport/live-source.ts
const LIVE_FLAG = '<script>window.__INTENTGRAPH_LIVE__ = { graph: "/graph.json", events: "/events" };</script>';

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

  let version = 0;
  let result: BuildGraphResult | null = null;
  let anchors: ReadonlyMap<string, NodeAnchors> = new Map();
  let linked: LinkedFiles = { tests: new Set(), realized: new Set() };
  let report: TestReport | null = null;
  let graph: LiveGraph | null = null;
  let graphText = '';
  let testRun: TestRunHandle | null = null;
  let testsAgain = false;
  let closed = false;
  const clients = new Set<ServerResponse>();

  const publish = (): void => {
    if (!result) return;
    graph = composeLiveGraph(result, anchors, report, root);
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
  watcher.on('unlink', (p) => batcher.add(rel(p)));
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
      if (extname(file) === '.html') body = body.toString('utf8').replace('</head>', `${LIVE_FLAG}</head>`);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  }

  const keepAlive = setInterval(() => {
    for (const c of clients) c.write(': ping\n\n');
  }, tuning.keepAliveMs);

  const host = opts.host ?? '127.0.0.1';
  await new Promise<void>((ok, bad) => {
    server.once('error', bad);
    server.listen(opts.port, host, () => ok());
  });
  const port = (server.address() as AddressInfo).port;

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
