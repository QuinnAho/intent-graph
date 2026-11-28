// VS Code extension entry (ADR 0032). a thin shell: it starts the live server we
// have, shows the page we have in a panel, and opens files the page asks for.
// the rules live in plain modules: open-file.ts, panel-html.ts, server-process.ts.

import { writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import * as vscode from 'vscode';

import { decideOpen, otherColumn } from './open-file.js';
import { GraphPanel } from './panel.js';
import { serverCommand, startServer, type RunningServer } from './server-process.js';

let output: vscode.OutputChannel | null = null;
let server: Promise<RunningServer> | null = null;
let panel: GraphPanel | null = null;

// what the end-to-end check reads. only written when INTENTGRAPH_E2E_FILE is set.
const e2e = { url: null as string | null, pid: null as number | null, received: [] as unknown[], opened: [] as unknown[], refused: [] as unknown[], stopped: false };
function record(): void {
  const file = process.env['INTENTGRAPH_E2E_FILE'];
  if (!file) return;
  try {
    writeFileSync(file, JSON.stringify(e2e, null, 2));
  } catch {
    // the check notices a missing record, the editor must not break over it
  }
}

function log(line: string): void {
  output?.appendLine(line);
}

function workspaceRoot(): vscode.Uri | null {
  return vscode.workspace.workspaceFolders?.[0]?.uri ?? null;
}

function ensureServer(repo: string, root: vscode.Uri): Promise<RunningServer> {
  const start = (): Promise<RunningServer> => {
    const write = vscode.workspace.getConfiguration('intentgraph').get<boolean>('write', false);
    log(`starting the live server, ${write ? 'editing on' : 'read only'}`);
    return startServer(serverCommand({ repo, root: root.fsPath, write }), log).then((s) => {
      e2e.url = s.address.url;
      e2e.pid = s.pid;
      record();
      return s;
    });
  };
  // one server per window: a starting one is shared, one that died is started again
  server = server ? server.then((s) => (s.alive() ? s : start()), () => start()) : start();
  return server;
}

async function openFile(msg: unknown): Promise<void> {
  const root = workspaceRoot();
  const d = decideOpen(msg);
  if (!d.ok || !root) {
    const reason = d.ok ? 'no workspace folder' : d.reason;
    log(`refused to open a file: ${reason}`);
    e2e.refused.push({ msg, reason });
    record();
    return;
  }
  const uri = vscode.Uri.joinPath(root, ...d.segments);
  // second guard: the joined path must still sit under the workspace folder
  if (!resolve(uri.fsPath).startsWith(resolve(root.fsPath) + sep)) {
    e2e.refused.push({ msg, reason: 'outside the workspace after joining' });
    record();
    return;
  }
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const line = Math.min(d.line, doc.lineCount) - 1;
    const at = new vscode.Range(line, 0, line, 0);
    await vscode.window.showTextDocument(doc, { viewColumn: otherColumn(panel?.viewColumn), selection: at, preserveFocus: false });
    e2e.opened.push({ path: d.segments.join('/'), line: d.line });
  } catch (err) {
    log(`could not open ${d.segments.join('/')}: ${(err as Error).message}`);
    e2e.refused.push({ msg, reason: 'could not open' });
  }
  record();
}

function onMessage(msg: unknown): void {
  if (!msg || typeof msg !== 'object') return;
  const type = (msg as { type?: unknown }).type;
  e2e.received.push(msg);
  record();
  if (type === 'intentgraph.ready') log(`the page is ready: ${String((msg as { nodes?: unknown }).nodes)} nodes`);
  else if (type === 'intentgraph.open') void openFile(msg);
}

async function openGraph(repo: string, focus: string | null): Promise<void> {
  const root = workspaceRoot();
  if (!root) {
    void vscode.window.showErrorMessage('IntentGraph: open a folder first.');
    return;
  }
  let s: RunningServer;
  try {
    s = await ensureServer(repo, root);
  } catch (err) {
    log((err as Error).message);
    void vscode.window.showErrorMessage(`IntentGraph: ${(err as Error).message}`);
    return;
  }
  if (!panel) {
    panel = GraphPanel.create(s.address, focus, onMessage, () => {
      panel = null;
    });
    return;
  }
  if (focus !== null || panel.address.url !== s.address.url) panel.load(focus, s.address);
  panel.show();
}

export function activate(context: vscode.ExtensionContext): void {
  // the extension folder is packages/extension, the repo two folders up
  const repo = resolve(context.extensionPath, '..', '..');
  output = vscode.window.createOutputChannel('IntentGraph');
  context.subscriptions.push(output);

  context.subscriptions.push(
    vscode.commands.registerCommand('intentgraph.openGraph', () => openGraph(repo, null)),
    vscode.commands.registerCommand('intentgraph.reveal', (id: unknown) => (typeof id === 'string' && id.length > 0 ? openGraph(repo, id) : undefined)),
  );

  if (vscode.workspace.getConfiguration('intentgraph').get<boolean>('openOnStart', false)) void openGraph(repo, null);
}

export async function deactivate(): Promise<void> {
  panel?.dispose();
  panel = null;
  const s = server;
  server = null;
  if (!s) return;
  try {
    await (await s).stop();
  } catch {
    // a server that never started has nothing to stop
  }
  e2e.stopped = true;
  record();
}
