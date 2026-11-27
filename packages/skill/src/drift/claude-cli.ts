// Glue: one judge call through the `claude` CLI in print mode. No model SDK is
// imported (the agent-runner lint rule stays intact). Each call runs from a fresh
// empty temp folder so no project files or CLAUDE.md load, with no tools, no MCP
// servers, no saved session and a hard budget cap. Print mode with no permission
// mode denies anything that would need approval.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

export interface ClaudeCallOptions {
  readonly model: string;
  readonly budgetUsd: number;
  readonly timeoutMs: number;
  readonly systemPrompt: string;
  readonly jsonSchema: object;
}

export interface ClaudeCallResult {
  /** structured_output when present, else the result text. */
  readonly reply: unknown;
  readonly costUsd: number;
  readonly seconds: number;
  readonly model: string | null;
  readonly error: string | null;
}

/** Find the claude executable. On Windows the npm shim is a .cmd, so look for the real .exe. */
export function resolveClaudeBin(env: NodeJS.ProcessEnv = process.env): string {
  if (env['DRIFT_CLAUDE_BIN']) return env['DRIFT_CLAUDE_BIN'];
  if (process.platform !== 'win32') return 'claude';
  for (const dir of (env['PATH'] ?? env['Path'] ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const c of [join(dir, 'claude.exe'), join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')]) {
      if (existsSync(c)) return c;
    }
  }
  return 'claude.exe';
}

export function judgeArgs(opts: ClaudeCallOptions): string[] {
  return [
    '-p',
    // safe mode skips every CLAUDE.md (user ~/.claude/CLAUDE.md included), auto memory, skills,
    // plugins, hooks, MCP servers and custom agents, while login and permissions work as normal.
    // --bare would skip them too, but it reads no OAuth login, so a logged-in PC could not sign in.
    '--safe-mode',
    '--model', opts.model,
    '--tools', '',
    '--output-format', 'json',
    '--max-budget-usd', String(opts.budgetUsd),
    '--no-session-persistence',
    '--strict-mcp-config',
    '--disable-slash-commands',
    // user settings could add hooks or plugins to the judge, so load project settings only (the folder is empty)
    '--setting-sources', 'project',
    '--permission-prompts', 'none',
    '--system-prompt', opts.systemPrompt,
    '--json-schema', JSON.stringify(opts.jsonSchema),
  ];
}

export function callClaude(prompt: string, opts: ClaudeCallOptions): Promise<ClaudeCallResult> {
  const dir = mkdtempSync(join(tmpdir(), 'drift-judge-'));
  const t0 = Date.now();
  return new Promise((resolve) => {
    const done = (r: Omit<ClaudeCallResult, 'seconds'>): void => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // a leftover empty temp folder is harmless
      }
      resolve({ ...r, seconds: Math.round((Date.now() - t0) / 100) / 10 });
    };
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(resolveClaudeBin(), judgeArgs(opts), { cwd: dir, windowsHide: true, env: { ...process.env } });
    } catch (e) {
      done({ reply: null, costUsd: 0, model: null, error: `spawn failed: ${(e as Error).message}` });
      return;
    }
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, opts.timeoutMs);
    child.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (err += d.toString('utf8')));
    child.on('error', (e: Error) => {
      clearTimeout(timer);
      done({ reply: null, costUsd: 0, model: null, error: `spawn error: ${e.message}` });
    });
    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      let j: Record<string, unknown>;
      try {
        j = JSON.parse(out) as Record<string, unknown>;
      } catch {
        done({ reply: null, costUsd: 0, model: null, error: `exit ${code}, unreadable output: ${(err || out).slice(0, 300)}` });
        return;
      }
      const cost = typeof j['total_cost_usd'] === 'number' ? j['total_cost_usd'] : 0;
      const usage = j['modelUsage'];
      const model = usage && typeof usage === 'object' ? Object.keys(usage)[0] ?? null : null;
      if (j['is_error'] === true || code !== 0) {
        done({ reply: null, costUsd: cost, model, error: `judge error (exit ${code}, ${String(j['subtype'])}): ${String(j['result'] ?? '').slice(0, 300)}` });
        return;
      }
      done({ reply: j['structured_output'] ?? j['result'] ?? null, costUsd: cost, model, error: null });
    });
    child.stdin.end(prompt, 'utf8');
  });
}
