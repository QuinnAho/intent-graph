// shared by play.mjs, play-vscode.mjs and e2e-extension.mjs.
// pageIsStale: the built page is older than its sources, so a launcher rebuilds it.
// the rest starts the machine's VS Code as a separate instance: its own user data
// and extensions folders, every installed extension off, this repo's extension
// loaded for that window only. nothing is installed in the owner's editor.
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';

/** true when the page has no build or a file under packages/webview/src is newer than the built index.html */
export function pageIsStale(repo) {
  const built = join(repo, 'packages', 'webview', 'dist', 'index.html');
  if (!existsSync(built)) return true;
  const builtAt = statSync(built).mtimeMs;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory() ? walk(p) : statSync(p).mtimeMs > builtAt) return true;
    }
    return false;
  };
  return walk(join(repo, 'packages', 'webview', 'src'));
}

/** the VS Code program behind the `code` command on the PATH, or null */
export function findCode() {
  const names = process.platform === 'win32' ? ['code.cmd'] : ['code'];
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    for (const n of names) {
      const cli = join(dir, n);
      if (!existsSync(cli)) continue;
      // the command sits in <install>/bin, the program one folder up
      const install = dirname(dirname(realpathSync(cli)));
      const exe = process.platform === 'win32' ? join(install, 'Code.exe') : process.platform === 'darwin' ? join(install, '..', 'MacOS', 'Electron') : join(install, 'code');
      if (existsSync(exe)) return { cli, exe: resolve(exe) };
    }
  }
  return null;
}

const inside = (dir, parent) => {
  const r = relative(parent, dir);
  return r !== '' && !r.startsWith('..') && !isAbsolute(r);
};

/** throws unless both folders are absolute and live under the repo's .runs or the temp folder, never VS Code's own */
export function assertOwnFolders(repo, userDataDir, extensionsDir) {
  const allowed = [join(repo, '.runs'), tmpdir()];
  const own = [
    join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Code'),
    join(homedir(), '.vscode'),
    join(homedir(), '.config', 'Code'),
    join(homedir(), 'Library', 'Application Support', 'Code'),
  ];
  for (const [name, dir] of [['user data', userDataDir], ['extensions', extensionsDir]]) {
    if (typeof dir !== 'string' || !dir || !isAbsolute(dir)) throw new Error(`refusing to start VS Code without its own ${name} folder`);
    if (!allowed.some((a) => inside(resolve(dir), a))) throw new Error(`refusing a ${name} folder outside .runs and the temp folder: ${dir}`);
    if (own.some((o) => resolve(dir) === o || inside(resolve(dir), o))) throw new Error(`refusing VS Code's own ${name} folder`);
  }
}

/** writes the separate instance's settings: the panel opens by itself, no welcome, no update check, no telemetry */
export function writeUserSettings(userDataDir, { write }) {
  const dir = join(userDataDir, 'User');
  mkdirSync(dir, { recursive: true });
  const settings = {
    'intentgraph.openOnStart': true,
    'intentgraph.write': Boolean(write),
    'security.workspace.trust.enabled': false,
    'workbench.startupEditor': 'none',
    'workbench.tips.enabled': false,
    'workbench.enableExperiments': false,
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    'chat.disableAIFeatures': true,
    'update.mode': 'none',
    'update.showReleaseNotes': false,
    'extensions.autoCheckUpdates': false,
    'extensions.autoUpdate': false,
    'extensions.ignoreRecommendations': true,
    'telemetry.telemetryLevel': 'off',
    'git.openRepositoryInParentFolders': 'never',
  };
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings, null, 2));
}

/** the program and arguments for a separate VS Code window on folder, with this repo's extension loaded */
export function vscodeCommand({ repo, folder, userDataDir, extensionsDir, exe }) {
  assertOwnFolders(repo, userDataDir, extensionsDir);
  return {
    exe,
    args: [
      '--new-window',
      `--user-data-dir=${userDataDir}`,
      `--extensions-dir=${extensionsDir}`,
      '--disable-extensions',
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      `--extensionDevelopmentPath=${join(repo, 'packages', 'extension')}`,
      folder,
    ],
  };
}

/** the environment for that window: nothing that would hand the launch to a running VS Code */
export function vscodeEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const k of Object.keys(env)) if (k.startsWith('VSCODE_') || k === 'ELECTRON_RUN_AS_NODE' || k === 'ELECTRON_NO_ATTACH_CONSOLE') delete env[k];
  return env;
}
