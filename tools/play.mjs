#!/usr/bin/env node
// opens the live graph of this repo in the browser. usage: node tools/play.mjs [--write] [--no-open] [--no-build] [--root <dir>]
// builds the page when it is missing, starts the live server on a free port, opens the browser
// at the address the server prints, and stops the server when this window closes or ctrl+c is hit.
// a "stop" line on stdin stops it too, which is how the check script ends it.
// --write turns editing on. --no-open only prints the address.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const rootAt = args.indexOf('--root');
const root = rootAt >= 0 && args[rootAt + 1] ? resolve(args[rootAt + 1]) : repo;
const write = flag('--write');

const cli = join(repo, 'packages', 'skill', 'src', 'live', 'cli.ts');
const webDir = join(repo, 'packages', 'webview', 'dist');
// how long a stopping server gets to exit before the whole process tree is ended, ms
const STOP_WAIT_MS = 8000;

function fail(message) {
  console.error(`play: ${message}`);
  process.exit(1);
}

// the page, built once when it is missing
if (!flag('--no-build') && !existsSync(join(webDir, 'index.html'))) {
  console.log('building the page, this takes a minute the first time');
  const b = spawnSync('pnpm --filter @intentgraph/webview build', { cwd: repo, shell: true, stdio: 'inherit' });
  if (b.status !== 0) fail('the page build failed, see the lines above');
}
if (!existsSync(join(webDir, 'index.html'))) fail('there is no built page, run without --no-build');

const server = spawn(process.execPath, ['--import', 'tsx', cli, '--root', root, '--port', '0', '--web', webDir, ...(write ? ['--write'] : [])], {
  cwd: repo,
  stdio: ['pipe', 'pipe', 'inherit'],
});

let stopping = false;
let opened = false;

function openBrowser(url) {
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
}

let buf = '';
server.stdout.on('data', (d) => {
  buf += d.toString();
  const lines = buf.split(/\r?\n/);
  buf = lines.pop();
  for (const line of lines) {
    console.log(line);
    const m = /^live: (\S+)/.exec(line);
    if (m && !opened) {
      opened = true;
      console.log(`\n${write ? 'Editing is on.' : 'Read only.'} Open ${m[1]}`);
      console.log('Close this window to stop the server.');
      if (!flag('--no-open')) openBrowser(m[1]);
    }
  }
});

server.on('exit', (code) => process.exit(stopping ? 0 : (code ?? 1)));

function stop() {
  if (stopping) return;
  stopping = true;
  if (server.exitCode !== null) process.exit(0);
  server.stdin.write('stop\n');
  // the server answers a stop line itself, the tree kill is only for one that hangs
  setTimeout(() => {
    if (server.exitCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
      else server.kill('SIGKILL');
    }
    process.exit(0);
  }, STOP_WAIT_MS).unref();
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, stop);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  if (d.split(/\r?\n/).some((l) => l.trim() === 'stop')) stop();
});
