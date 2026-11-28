import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { parseLiveLine, serverCommand } from '../src/server-process.js';

describe('parseLiveLine', () => {
  it('reads the address the server prints', () => {
    expect(parseLiveLine('live: http://127.0.0.1:53493/')).toEqual({ url: 'http://127.0.0.1:53493/', origin: 'http://127.0.0.1:53493', port: 53493 });
    expect(parseLiveLine('live: http://127.0.0.1:8080\r')).toEqual({ url: 'http://127.0.0.1:8080/', origin: 'http://127.0.0.1:8080', port: 8080 });
  });

  it('ignores other lines', () => {
    for (const line of ['', 'edits: off, start with --write to edit', 'not live: http://127.0.0.1:1/', 'live:http://127.0.0.1:1/']) {
      expect(parseLiveLine(line), line).toBeNull();
    }
  });

  it('refuses an address that is not this machine on a real port', () => {
    for (const line of ['live: http://example.com:80/', 'live: https://127.0.0.1:443/', 'live: http://127.0.0.1/', 'live: http://127.0.0.1:0/', 'live: http://127.0.0.1:70000/', 'live: http://user@127.0.0.1:80/']) {
      expect(parseLiveLine(line), line).toBeNull();
    }
  });
});

describe('serverCommand', () => {
  const repo = join('r', 'repo');
  it('starts the cli with tsx from the repo, on a free port, read only by default', () => {
    const c = serverCommand({ repo, root: join('w', 'ws'), write: false });
    expect(c.command).toBe('node');
    expect(c.cwd).toBe(repo);
    expect(c.args).toEqual([
      '--import', 'tsx',
      join(repo, 'packages', 'skill', 'src', 'live', 'cli.ts'),
      '--root', join('w', 'ws'),
      '--port', '0',
      '--web', join(repo, 'packages', 'webview', 'dist'),
    ]);
  });

  it('adds --write only when asked', () => {
    expect(serverCommand({ repo, root: 'ws', write: true }).args.at(-1)).toBe('--write');
    expect(serverCommand({ repo, root: 'ws', write: false }).args).not.toContain('--write');
  });
});
