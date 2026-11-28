#!/usr/bin/env node
// opens this repo in a separate VS Code window with the graph in a panel (ADR 0032).
// usage: node tools/play-vscode.mjs [--write] [--no-build] [--root <dir>] [--print]
// builds the extension, rebuilds the page when it is older than its sources, writes the separate
// window's settings, and starts the machine's VS Code with its own user data and extensions folders
// under .runs/vscode/, every installed extension off, and this repo's extension loaded for that
// window only. nothing is installed in the owner's editor. the server stops when that window closes.
// --write turns editing on. --print prints the command and exits.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findCode, pageIsStale, vscodeCommand, vscodeEnv, writeUserSettings } from './vscode-launch.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const rootAt = args.indexOf('--root');
const folder = rootAt >= 0 && args[rootAt + 1] ? resolve(args[rootAt + 1]) : repo;
const write = flag('--write');
const userDataDir = join(repo, '.runs', 'vscode', 'user-data');
const extensionsDir = join(repo, '.runs', 'vscode', 'extensions');

function fail(message) {
  console.error(`play-vscode: ${message}`);
  process.exit(1);
}

const code = findCode();
if (!code) fail('no `code` command on the PATH, install VS Code or add it to the PATH');
let cmd;
try {
  cmd = vscodeCommand({ repo, folder, userDataDir, extensionsDir, exe: code.exe });
} catch (e) {
  fail(e.message);
}
const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

if (flag('--print')) {
  console.log([cmd.exe, ...cmd.args].map(quote).join(' '));
  console.log(`settings: ${join(userDataDir, 'User', 'settings.json')} (${write ? 'editing on' : 'read only'})`);
  process.exit(0);
}

if (!flag('--no-build')) {
  console.log('building the extension');
  const b = spawnSync('pnpm --filter @intentgraph/extension build', { cwd: repo, shell: true, stdio: 'inherit' });
  if (b.status !== 0) fail('the extension build failed, see the lines above');
  if (pageIsStale(repo)) {
    console.log('building the page, this takes a minute the first time');
    const p = spawnSync('pnpm --filter @intentgraph/webview build', { cwd: repo, shell: true, stdio: 'inherit' });
    if (p.status !== 0) fail('the page build failed, see the lines above');
  }
}

writeUserSettings(userDataDir, { write });
const child = spawn(cmd.exe, cmd.args, { cwd: repo, env: vscodeEnv(), stdio: 'ignore', detached: true });
child.on('error', (e) => fail(`VS Code did not start: ${e.message}`));
child.unref();
console.log(`${write ? 'Editing is on.' : 'Read only.'} A separate VS Code window opens with the graph beside the code.`);
console.log('Close that window to stop the server.');
