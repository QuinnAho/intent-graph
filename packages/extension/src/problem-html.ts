// the panel's message page for when the graph cannot be shown (lane 16 fixes).
// no vscode import, so it is tested in plain node. it is the webview's own html,
// so the --vscode-* colours work. no script, no handler, nothing framed.

import { PROBLEM_LINES } from './tuning.js';

/** the command that builds the page, shown once in the missing page message */
export const BUILD_PAGE_COMMAND = 'pnpm --filter @intentgraph/webview build';

export type Problem =
  | { readonly kind: 'no-page' }
  | { readonly kind: 'no-node' }
  | { readonly kind: 'failed'; readonly lines: readonly string[] };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function body(p: Problem): { readonly title: string; readonly parts: readonly string[] } {
  const again = 'Then run IntentGraph: Open Graph again.';
  switch (p.kind) {
    case 'no-page':
      return {
        title: 'The graph page is not built',
        parts: ['<p>IntentGraph could not find its built page.</p>', '<p>Run this command in the IntentGraph folder:</p>', `<pre>${escapeHtml(BUILD_PAGE_COMMAND)}</pre>`, `<p>${again}</p>`],
      };
    case 'no-node':
      return {
        title: 'Node.js was not found',
        parts: ['<p>IntentGraph needs Node.js 20 or newer on the PATH, and none was found.</p>', '<p>Install Node.js 20 or newer and check that <code>node</code> runs in a terminal. Restart VS Code, then run IntentGraph: Open Graph again.</p>'],
      };
    case 'failed': {
      const tail = p.lines.slice(-PROBLEM_LINES);
      return {
        title: 'The live server did not start',
        parts: ['<p>The live server did not start. Its last output is below.</p>', `<pre>${tail.length ? escapeHtml(tail.join('\n')) : '(no output)'}</pre>`, '<p>Fix that, then run IntentGraph: Open Graph again.</p>'],
      };
    }
  }
}

export function buildProblemHtml(p: Problem): string {
  const { title, parts } = body(p);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;padding:24px;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);line-height:1.5}h1{font-size:1.3em;font-weight:600;margin:0 0 12px}pre,code{font-family:var(--vscode-editor-font-family,monospace);background:var(--vscode-textCodeBlock-background)}pre{padding:10px 12px;white-space:pre-wrap;overflow-wrap:anywhere}</style>
</head>
<body data-problem="${p.kind}">
<h1>${escapeHtml(title)}</h1>
${parts.join('\n')}
</body>
</html>
`;
}
