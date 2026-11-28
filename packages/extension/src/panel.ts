// the graph panel: a webview beside the active editor that frames the live page.
// one panel per window. a second open shows the same one.

import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

import { buildPanelHtml, pageUrl } from './panel-html.js';
import type { LiveAddress } from './server-process.js';

function makeNonce(): string {
  return randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '').padEnd(16, '0');
}

export class GraphPanel {
  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private current: LiveAddress,
  ) {}

  get address(): LiveAddress {
    return this.current;
  }

  static create(address: LiveAddress, focus: string | null, onMessage: (msg: unknown) => void, onClose: () => void): GraphPanel {
    const panel = vscode.window.createWebviewPanel(
      'intentgraph.graph',
      'IntentGraph',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      // nothing local is loaded, the page comes from the server inside the iframe
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
    );
    const gp = new GraphPanel(panel, address);
    panel.webview.onDidReceiveMessage(onMessage);
    panel.onDidDispose(onClose);
    gp.load(focus);
    return gp;
  }

  get viewColumn(): number | undefined {
    return this.panel.viewColumn;
  }

  /** loads the page, focused on a node when one is given. a new address replaces the old one. */
  load(focus: string | null, address?: LiveAddress): void {
    if (address) this.current = address;
    this.panel.webview.html = buildPanelHtml({ address: this.current, src: pageUrl(this.current, focus), nonce: makeNonce() });
  }

  show(): void {
    this.panel.reveal(undefined, true);
  }

  dispose(): void {
    this.panel.dispose();
  }
}
