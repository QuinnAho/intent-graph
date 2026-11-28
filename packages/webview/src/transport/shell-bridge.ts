// the page's half of the editor panel bridge (ADR 0032). when the page sits in an
// iframe inside the VS Code panel it tells the shell once that the graph is laid
// out, and asks the shell to open files. in a plain browser tab there is no
// parent window and none of this does anything.

import { useGraphStore } from '../store/graph-slice.js';

type ShellMessage =
  | { readonly type: 'intentgraph.ready'; readonly nodes: number }
  | { readonly type: 'intentgraph.open'; readonly path: string; readonly line?: number };

function shellOf(win: Window): Window | null {
  try {
    const parent = win.parent;
    return parent && parent !== win ? parent : null;
  } catch {
    return null;
  }
}

function post(win: Window, msg: ShellMessage): boolean {
  const shell = shellOf(win);
  if (!shell) return false;
  // the shell's origin is a vscode-webview one we cannot know ahead. nothing secret is sent.
  shell.postMessage(msg, '*');
  return true;
}

/** starts the bridge, returns a function that stops it */
export function startShellBridge(win: Window = window): () => void {
  if (!shellOf(win)) return () => {};
  let sent = false;
  const check = (s: { readonly layoutReady: boolean; readonly nodes: ReadonlyArray<unknown> }): void => {
    if (sent || !s.layoutReady || s.nodes.length === 0) return;
    sent = true;
    post(win, { type: 'intentgraph.ready', nodes: s.nodes.length });
  };
  check(useGraphStore.getState());
  return useGraphStore.subscribe(check);
}

/** asks the editor to open a workspace file at a line from 1. false when there is no editor around the page. */
export function openInEditor(path: string, line?: number, win: Window = window): boolean {
  return post(win, line === undefined ? { type: 'intentgraph.open', path } : { type: 'intentgraph.open', path, line });
}
