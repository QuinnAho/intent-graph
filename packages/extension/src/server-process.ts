// the live server as a child of the extension host. no vscode import, so it can be
// tested in plain node. started with the system node (the host's own binary is
// electron), --import tsx from this repo, and an argument array, never a shell.
// it prints "live: <url>" once listening and stops on a "stop" line on stdin.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

import { SERVER_ERROR_LINES, SERVER_START_LIMIT_MS, SERVER_STOP_WAIT_MS } from './tuning.js';

export interface LiveAddress {
  /** the page's address, always ending in a slash */
  readonly url: string;
  /** scheme, host and port, for the panel's content policy */
  readonly origin: string;
  readonly port: number;
}

/** the address in a "live: <url>" line, or null. only http on 127.0.0.1 with an explicit port passes. */
export function parseLiveLine(line: string): LiveAddress | null {
  const m = /^live: (\S+)\s*$/.exec(line);
  if (!m?.[1]) return null;
  let u: URL;
  try {
    u = new URL(m[1]);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || u.username || u.password) return null;
  const port = Number(u.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { url: `${u.origin}/`, origin: u.origin, port };
}

export interface ServerCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

/** the folder with the built page. INTENTGRAPH_WEB_DIR points it elsewhere, for the end-to-end check. */
export function webDir(repo: string, env: NodeJS.ProcessEnv = process.env): string {
  return env['INTENTGRAPH_WEB_DIR'] || join(repo, 'packages', 'webview', 'dist');
}

export function serverCommand(opts: { readonly repo: string; readonly root: string; readonly write: boolean; readonly web?: string }): ServerCommand {
  const { repo } = opts;
  return {
    command: 'node',
    cwd: repo,
    args: [
      '--import', 'tsx',
      join(repo, 'packages', 'skill', 'src', 'live', 'cli.ts'),
      '--root', opts.root,
      '--port', '0',
      '--web', opts.web ?? webDir(repo),
      ...(opts.write ? ['--write'] : []),
    ],
  };
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
  else child.kill('SIGKILL');
}

/** why the server did not start: node missing, or anything else with the child's last lines */
export class ServerStartError extends Error {
  constructor(
    message: string,
    readonly kind: 'no-node' | 'failed',
    readonly lines: readonly string[],
  ) {
    super(message);
  }
}

export interface RunningServer {
  readonly address: LiveAddress;
  readonly pid: number;
  /** true while the child has not exited */
  alive(): boolean;
  stop(): Promise<void>;
}

/** starts the server and resolves once it printed its address */
export function startServer(cmd: ServerCommand, log: (line: string) => void = () => {}): Promise<RunningServer> {
  const env = { ...process.env };
  // the host runs as electron in node mode, the child is a plain node
  delete env['ELECTRON_RUN_AS_NODE'];
  const child = spawn(cmd.command, [...cmd.args], { cwd: cmd.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const errLines: string[] = [];

  let stopping: Promise<void> | null = null;
  const exited = new Promise<void>((done) => child.once('exit', () => done()));
  const stop = (): Promise<void> => {
    if (stopping) return stopping;
    stopping = (async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      try {
        child.stdin?.write('stop\n');
      } catch {
        // a closed stdin means the child is on its way out, the tree kill below covers a hang
      }
      let timer: NodeJS.Timeout | undefined;
      const late = new Promise<'late'>((done) => { timer = setTimeout(() => done('late'), SERVER_STOP_WAIT_MS); });
      const r = await Promise.race([exited.then(() => 'exited' as const), late]);
      clearTimeout(timer);
      if (r === 'late') killTree(child);
    })();
    return stopping;
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (err: Error | null, value?: RunningServer): void => {
      if (settled) return;
      settled = true;
      clearTimeout(limit);
      if (err) {
        void stop();
        reject(err);
      } else if (value) resolve(value);
    };
    const limit = setTimeout(() => settle(new ServerStartError(`the live server printed no address within ${SERVER_START_LIMIT_MS / 1000} s. ${errLines.join(' | ')}`, 'failed', [...errLines])), SERVER_START_LIMIT_MS);

    let buf = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (d: string) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) {
        log(line);
        if (line.trim()) {
          errLines.push(line);
          if (errLines.length > SERVER_ERROR_LINES) errLines.shift();
        }
        const address = parseLiveLine(line);
        if (address && child.pid !== undefined) {
          const pid = child.pid;
          settle(null, { address, pid, alive: () => child.exitCode === null && child.signalCode === null, stop });
        }
      }
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (d: string) => {
      for (const line of d.split(/\r?\n/)) {
        if (!line.trim()) continue;
        log(line);
        errLines.push(line);
        if (errLines.length > SERVER_ERROR_LINES) errLines.shift();
      }
    });
    child.once('error', (e) => settle(new ServerStartError(`the live server did not start: ${e.message}`, (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'no-node' : 'failed', [e.message])));
    child.once('exit', (code) => settle(new ServerStartError(`the live server exited with ${code ?? 'a signal'} before it printed an address. ${errLines.join(' | ')}`, 'failed', [...errLines])));
  });
}
