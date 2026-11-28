// the panel's html: one full-size iframe to the live server and a small relay
// (ADR 0032). no vscode import, so the policy is tested in plain node. the page
// keeps its own origin inside the iframe, which the server's write check needs.

import type { LiveAddress } from './server-process.js';

/** the page's address, with the node to focus when there is one */
export function pageUrl(address: LiveAddress, focus: string | null): string {
  return focus ? `${address.url}?focus=${encodeURIComponent(focus)}` : address.url;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildPanelHtml(opts: { readonly address: LiveAddress; readonly src: string; readonly nonce: string }): string {
  const { address, src, nonce } = opts;
  if (!/^[A-Za-z0-9]{16,}$/.test(nonce)) throw new Error('the nonce must be 16 or more letters and digits');
  if (new URL(src).origin !== address.origin) throw new Error('the page must come from the server address');
  const policy = [
    "default-src 'none'",
    `frame-src ${address.origin}`,
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
  ].join('; ');
  // the origin came through parseLiveLine, so JSON.stringify is enough to quote it in the script
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy};">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#0b0e14}iframe{display:block;border:0;width:100%;height:100%}</style>
</head>
<body>
<iframe id="graph" title="IntentGraph" src="${escapeAttr(src)}"></iframe>
<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  const frame = document.getElementById('graph');
  const origin = ${JSON.stringify(address.origin)};
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow) return;
    if (e.origin !== origin) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || typeof d.type !== 'string' || !d.type.startsWith('intentgraph.')) return;
    vscode.postMessage(d);
  });
})();
</script>
</body>
</html>
`;
}
