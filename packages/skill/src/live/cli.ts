// usage: tsx packages/skill/src/live/cli.ts --root <dir> [--port <n>] [--host <h>] [--web <dir>|--no-web]
// prints "live: <url>" once it is listening. stops on ctrl+c, sigterm, or a "stop" line on stdin.

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startLiveServer } from './server.js';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const rootArg = opt('--root');
if (!rootArg) {
  out('usage: --root <dir> [--port <n>] [--host <h>] [--web <dir>|--no-web]');
  process.exit(2);
}
const port = Number(opt('--port') ?? '0');
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  out(`bad --port ${opt('--port') ?? ''}`);
  process.exit(2);
}
const defaultWeb = resolve(dirname(fileURLToPath(import.meta.url)), '../../../webview/dist');
const webDir = args.includes('--no-web') ? null : resolve(opt('--web') ?? defaultWeb);
if (webDir && !existsSync(resolve(webDir, 'index.html'))) {
  out(`no webview build at ${webDir}, run: pnpm --filter @intentgraph/webview build`);
}

const server = await startLiveServer({
  root: resolve(rootArg),
  port,
  host: opt('--host') ?? '127.0.0.1',
  webDir,
  log: out,
});
out(`live: ${server.url}`);

let stopping = false;
async function stop(why: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  out(`stopping (${why})`);
  await server.close();
  out('stopped');
  process.exit(0);
}
process.on('SIGINT', () => void stop('SIGINT'));
process.on('SIGTERM', () => void stop('SIGTERM'));
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d: string) => {
  if (d.split(/\r?\n/).some((l) => l.trim() === 'stop')) void stop('stdin');
});
