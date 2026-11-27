// runs the tests named by verified_by in one vitest process with the json
// reporter. --globals lets fixture tests skip importing vitest, so a workspace
// outside this repo needs no node_modules of its own.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { TestReport } from './check-status.js';

export interface TestRunResult {
  readonly report: TestReport | null;
  readonly error?: string;
  readonly ms: number;
}

export interface TestRunHandle {
  readonly pid: number | undefined;
  readonly done: Promise<TestRunResult>;
  cancel(): void;
}

let runCounter = 0;

export function vitestEntry(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
}

/** kill a child and its children. only ever called on a child this module spawned. */
export function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
  else child.kill('SIGKILL');
}

export function runLinkedTests(root: string, files: ReadonlyArray<string>, timeoutMs: number): TestRunHandle {
  const t0 = Date.now();
  const present = files.filter((f) => existsSync(join(root, f)));
  if (present.length === 0) {
    return { pid: undefined, done: Promise.resolve({ report: { testResults: [] }, ms: 0 }), cancel: () => {} };
  }
  runCounter += 1;
  // the report lives outside the watched root so writing it does not trigger a rebuild
  const out = join(tmpdir(), `intentgraph-live-${process.pid}-${runCounter}.json`);
  const child = spawn(
    process.execPath,
    [vitestEntry(), 'run', '--root', root, '--globals', '--reporter=json', `--outputFile=${out}`, ...present],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, FORCE_COLOR: '0', CI: '1' } },
  );
  let stderr = '';
  child.stderr?.on('data', (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-2000);
  });
  child.stdout?.resume();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    killTree(child);
  }, timeoutMs);

  const done = new Promise<TestRunResult>((resolve) => {
    const finish = (error?: string): void => {
      clearTimeout(timer);
      const ms = Date.now() - t0;
      let report: TestReport | null = null;
      try {
        if (existsSync(out)) report = JSON.parse(readFileSync(out, 'utf8')) as TestReport;
      } catch {
        report = null;
      }
      rmSync(out, { force: true });
      if (timedOut) resolve({ report: null, error: `tests timed out after ${timeoutMs} ms`, ms });
      else if (!report) resolve({ report: null, error: error ?? `vitest wrote no report: ${stderr.trim().split('\n').slice(-3).join(' ')}`, ms });
      else resolve({ report, ms });
    };
    child.on('error', (e) => finish(e.message));
    child.on('close', () => finish());
  });

  return { pid: child.pid, done, cancel: () => killTree(child) };
}
