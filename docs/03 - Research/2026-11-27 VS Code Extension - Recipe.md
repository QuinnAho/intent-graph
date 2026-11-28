---
status: recipe
date: 2026-11-27
---
# VS Code extension: the recipe (option B of the interface note)

Research only. Nothing built, installed or started. Tags: [read] = read in official docs or source today. [machine] = checked on this machine today. [unsure] = from memory, not confirmed.

## Recommended recipe

Pick way (a): a webview that holds an iframe to the live server. The page and the server stay as they are. Way (b) means a fake server inside the extension and breaks the edit check (see 1).

1. `packages/extension/package.json`: keep it small. Add `esbuild` and `@vscode/test-cli` + `@vscode/test-electron` later, not now. Drop `vscode-messenger` and the MCP dependency for this first cut (they are in the old plan, not needed).
2. `packages/extension/src/server.ts`: start the server child. `spawn('node', ['--import','tsx', cli, '--root', ws, '--port','0','--web', webDir])`, read the first stdout line `live: <url>` (same as `tools/play.mjs`), return the port. On dispose write `stop\n` to stdin, kill the tree after 8 s.
3. `packages/extension/src/panel.ts`: `createWebviewPanel('intentgraph','IntentGraph',ViewColumn.Beside,{enableScripts:true,retainContextWhenHidden:true,portMapping:[{webviewPort:port,extensionHostPort:port}]})`. HTML: one full-size `<iframe src="http://127.0.0.1:PORT/">` plus a 15-line relay script (see 3). CSP: `default-src 'none'; script-src 'nonce-X'; style-src 'unsafe-inline'; frame-src http://127.0.0.1:*`.
4. `packages/extension/src/extension.ts`: one command `intentgraph.openGraph` (already in `package.json`). SMALLEST FIRST STEP = steps 2 to 4 only: the page shows in a panel. Prove it with the screenshot gate (7).
5. Then graph to code: the page must send one message on a node click (a 5-line page change, the page emits nothing today). The relay forwards it, the extension calls `showTextDocument(uri,{viewColumn:Beside,selection})`.
6. Then code to graph: a CodeLens provider and a "Reveal in graph" command that posts `{reveal:id}` to the page (or reloads the iframe with `?focus=<id>`, which the page already reads).
7. Then a status bar item with the state counts. One item only.
8. Package: esbuild bundle of `src/extension.ts` and of the server CLI, `vsce package --no-dependencies`.

## 1. Showing the page

- **(a) iframe to the server.** Page, `/graph.json`, `/events` and `/api` keep working with no change: same origin, same Host check. The server sends no frame-blocking header (`server.ts` writeHead lines, [machine]). Draw.io does exactly this shape: an iframe in a webview, CSP `frame-src *`, a relay script ([DrawioClientFactory.ts](https://github.com/hediet/vscode-drawio/blob/main/src/DrawioClient/DrawioClientFactory.ts) lines 388-430) [read].
- **(b) built page via `asWebviewUri`.** Nx Console does this ([load-graph-base-html.ts](https://github.com/nrwl/nx-console/blob/master/libs/vscode/graph-base/src/load-graph-base-html.ts)) [read]: rewrites the asset links, shims fetch over `postMessage`. For us the page's origin would be `vscode-webview://`, and `checkWriteRequest` in `packages/skill/src/live/edit-api.ts` refuses writes unless Host and Origin are `127.0.0.1:<port>` or `localhost:<port>` [machine]. So (b) means a proxy in the extension or a server change. Also `live-source.ts` has the base-address hook, but `/api` has no such hook ([machine], not checked in `edit-api.ts` of the page past line 22).
- **CSP.** Docs: policy "implicitly disables inline scripts and styles"; start from `default-src 'none'` ([webview guide](https://code.visualstudio.com/api/extension-guides/webview)) [read]. `localResourceRoots`: set `[]` for (a), nothing local is loaded.
- **`portMapping`.** Type: `{webviewPort, extensionHostPort}`, "localhost inside the webview" ([@types/vscode 1.116 index.d.ts line 9887](https://code.visualstudio.com/api/references/vscode-api)) [machine]. Docs: it is the alternative to `asExternalUri` for remote, and not for the Codespaces browser ([remote extensions](https://code.visualstudio.com/api/advanced-topics/remote-extensions)) [read]. Remote: "`localhost` inside a webview will resolve to a developer's local machine" (same page) [read]. [unsure] whether the mapping covers a nested iframe; test it. Locally 127.0.0.1 just works.
- **`retainContextWhenHidden`.** "High memory overhead", use only when state tricks fail ([webview guide](https://code.visualstudio.com/api/extension-guides/webview)) [read]. The iframe reloads on hide otherwise and refetches the graph. For us the page is the state, so set it true. Hidden-panel messages: the guide says they can be sent with it; the d.ts contradicts itself (line 10001 yes, line 10077 no) [machine]. Do not rely on it.
- **Restart restore.** Register a `WebviewPanelSerializer`; the server must be started again inside `deserializeWebviewPanel` ([guide](https://code.visualstudio.com/api/extension-guides/webview)) [read]. The old port is dead, so rebuild the HTML.
- **Theme.** Body gets `vscode-light`/`vscode-dark`/`vscode-high-contrast`, and `--vscode-*` variables [read, guide]. In an iframe they do NOT cross into the page. Pass the theme with the relay (`postMessage`) or a query. The page needs to read it: a later page change.
- **Known trouble with an iframe in a webview.** The shell forwards keys only from the top frame; keys inside a nested frame are not forwarded to VS Code ([pre/index.html](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/webview/browser/pre/index.html), `hookupOnLoadHandlers`, `handleInnerKeydown`) [read]. So Ctrl+Z, Delete, F2, Enter, typing reach the page itself (the browser handles them); VS Code shortcuts like Ctrl+P do not work while the page has focus. Issues: [#180234](https://github.com/microsoft/vscode/issues/180234) keyboard and context-menu events from an iframe are dropped, [#129178](https://github.com/microsoft/vscode/issues/129178) macOS copy and paste (owner is on Windows). Right-click: the page's own menu works; the VS Code menu does not. Focus: a 250 ms poll decides focus ([same file](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/webview/browser/pre/index.html)) [read]. Remote workspaces: the server runs where the extension host runs, so port forwarding applies ([remote](https://code.visualstudio.com/api/advanced-topics/remote-extensions)) [read]. Not tested here [unsure].

## 2. Shipped extensions

- **Nx Console** (MIT, [nrwl/nx-console](https://github.com/nrwl/nx-console)). Way (b) plus its own graph server it spawns ([nx-graph-server.ts](https://github.com/nrwl/nx-console/blob/master/libs/vscode/graph-base/src/nx-graph-server.ts)). Graph clicks arrive as `{type,payload}`; [handle-graph-interaction-event.ts](https://github.com/nrwl/nx-console/blob/master/libs/vscode/graph-base/src/handle-graph-interaction-event.ts) opens a file with `commands.executeCommand('vscode.open', Uri.file(p))` after a check that the path stays inside the workspace. Cherry-pick: that path check and the managed-server start/stop with a generation counter.
- **Draw.io integration** (GPL-3.0, [hediet/vscode-drawio](https://github.com/hediet/vscode-drawio)). Way (a): iframe plus relay (above). Cherry-pick the relay idea only. GPL: read, do not copy code into an MIT repo.
- **Excalidraw** (MIT, [excalidraw-vscode](https://github.com/excalidraw/excalidraw-vscode)). Custom editor with `retainContextWhenHidden: true`, a Vite-built `webview/` folder loaded through `asWebviewUri` ([editor.ts](https://github.com/excalidraw/excalidraw-vscode/blob/master/src/editor.ts)) [read, grep level only]. Closest to way (b).
- **GitLens graph**: not looked at (time). [unsure]

## 3. Graph to code

- Relay in the shell page: `window.addEventListener('message', e => e.source===frame.contentWindow ? vscode.postMessage(e.data) : frame.contentWindow.postMessage(e.data,'*'))`; the page does `window.parent.postMessage({type:'open', file, line},'*')` (a page change, [machine]: the page has no such call today). In (b) the page is the webview top, so it calls `acquireVsCodeApi().postMessage` directly (once only, keep it private) [read, guide].
- Extension side: `showTextDocument(doc,{viewColumn:ViewColumn.Beside,selection:new Range(l,0,l,0),preserveFocus:false})` ([d.ts `TextDocumentShowOptions` line 829](https://code.visualstudio.com/api/references/vscode-api)) [machine]. Check the path stays inside the workspace like Nx does.
- Fallback with no extension: `vscode://file/{full path}:line:column`, example `vscode://file/c:/myProject/package.json:5:10`; Insiders uses `vscode-insiders://` ([command line docs](https://code.visualstudio.com/docs/editor/command-line)) [read]. CLI: `code --goto file:line[:col]` [read]. Whether a click in the iframe may open a `vscode://` link is [unsure].

## 4. Code to graph

- `languages.registerCodeLensProvider(selector, provider)`; `provideCodeLenses(doc, token)` returns `new CodeLens(range, command)`, range one line; `resolveCodeLens` for slow parts; `onDidChangeCodeLenses` to refresh ([d.ts line 2850-2908](https://code.visualstudio.com/api/references/vscode-api), [guide](https://code.visualstudio.com/api/language-extensions/programmatic-language-features)) [read].
- Anchor `path#Symbol`: match `path` to the document, then find the line. First choice: lines the graph data already holds (no language server needed). Fallback: `commands.executeCommand('vscode.executeDocumentSymbolProvider', uri)` returns `DocumentSymbol[]` with ranges [unsure: the command is not on the pages I fetched, from memory; it needs a language extension active for the file].
- Lens command `intentgraph.reveal` with the intent id. It opens the panel if closed and sets the iframe to `?focus=<id>` (the page reads `focus`, [machine] `App.tsx:217`).
- Status bar: `window.createStatusBarItem(id, alignment, priority)` ([d.ts line 11643](https://code.visualstudio.com/api/references/vscode-api)) [machine]. Guidelines: one item, short text, icons only when clear, no custom colours ([status bar UX](https://code.visualstudio.com/api/ux-guidelines/status-bar)) [read].

## 5. Server lifecycle

- The extension host is a Node.js runtime ([extension host](https://code.visualstudio.com/api/advanced-topics/extension-host)) [read]. Push the child and the panel into `context.subscriptions`; `deactivate()` returns a promise that sends `stop\n` and waits. Spawn once per window, share the port.
- Spawn a system `node` from PATH. [unsure] spawning VS Code's own binary as node needs `ELECTRON_RUN_AS_NODE=1`; avoid. `--import tsx` runs the `.ts` directly (no build), but only inside this repo with its `node_modules` ([machine]: `tsx@4.21.0` present). For a `.vsix`, bundle the CLI with esbuild first.
- Installed here [machine]: `@types/vscode` 1.116.0 (newer than the 1.113.0 editor; keep `engines.vscode` at `^1.95` and do not use newer API), `@vscode/vsce`, `vscode-messenger` 0.5.1, esbuild in the pnpm store. Not present: `@vscode/test-cli`, `@vscode/test-electron`.

## 6. Run with nothing installed

- `code --extensionDevelopmentPath=<dir> <folder>` loads the folder as an extension for that window only; nothing is installed. It is NOT listed in `code --help` on 1.113.0 [machine] nor on the command-line docs page [read]; it is the flag behind the F5 "Extension Development Host". [unsure] on the exact profile effect.
- Isolation flags, confirmed in `code --help` [machine]: `--user-data-dir <dir>`, `--extensions-dir <dir>`, `--profile <name>` (a new empty one is created if missing), `--disable-extensions`, `--new-window`. `--profile-temp` is in the testing docs [read] but I did not see it in the help text.
- Safe command (not run): `code --new-window --user-data-dir <tmp>/ud --extensions-dir <tmp>/ext --disable-extensions --extensionDevelopmentPath=<repo>/packages/extension <repo>`.

## 7. Testing

- `@vscode/test-cli` reads `.vscode-test.mjs`; `@vscode/test-electron` downloads and unzips VS Code into `.vscode-test/` (already gitignored here [machine]) ([testing docs](https://code.visualstudio.com/api/working-with-extensions/testing-extension)) [read]. Size: the Windows 1.113.0 zip is 199,102,113 bytes (HEAD request, [machine]). Pin `version: '1.113.0'`. Use `launchArgs: ['--disable-extensions','--user-data-dir=...']`.
- Tests run inside the extension host (Mocha). A webview is isolated: tests cannot read its DOM. So assert on what the extension knows: panel exists, server answered, the message arrived, `showTextDocument` opened the right file at the right line (active editor selection).
- To see inside the page: drive the window with Playwright `_electron.launch` against the Code binary and `window.screenshot()` ([Playwright docs](https://playwright.dev/docs/api/class-electron)) [read]; reaching into webview frames that way is how VS Code's own smoke tests work [unsure].
- A scripted gate CAN prove: server starts and stops, panel opens, the iframe URL answers `/graph.json`, a click message opens file:line, no process left behind. It CANNOT prove: it looks right, keys feel right, narrow-width layout. Those go to the owner as a screenshot.
- Screenshot on Windows from a script: Playwright above (window only), or PowerShell `System.Drawing` `CopyFromScreen` of the window rectangle [unsure, not run]. The owner's window must not be captured.

## 8. Packaging later

1. `esbuild src/extension.ts --bundle --platform=node --format=cjs --external:vscode --outfile=dist/extension.js` ([bundling](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)) [read]; `tsc --noEmit` for types.
2. `.vscodeignore` drops `src/`, `node_modules/`, maps.
3. `vsce package --no-dependencies` writes `<name>-<version>.vsix` in the folder ([publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)) [read]. A `publisher` is needed to publish; `package.json` has one.
4. `code --install-extension x.vsix` (or "Install from VSIX") copies it into the user's extensions folder. That touches the owner's editor: ask first.
5. The built page `packages/webview/dist` must ride inside the vsix, or the extension starts the server from a path setting.

## 9. Narrow panel

- UX guidelines say only: use webviews only when needed, make everything themeable, follow accessibility ([webview UX](https://code.visualstudio.com/api/ux-guidelines/webviews)) [read]. No width guidance exists on that page.
- Use `--vscode-editor-background`, `--vscode-editor-foreground`, `--vscode-font-size` as Nx does ([load-graph-base-html.ts](https://github.com/nrwl/nx-console/blob/master/libs/vscode/graph-base/src/load-graph-base-html.ts)) [read]. In an iframe these need passing in (see 1).
- A sidebar view (`WebviewView`) is the option for a truly narrow strip; not researched. The page's narrow layout is a page task, test at about 400 px.

Not verified: any behaviour at run time (nothing was started), `portMapping` inside a nested iframe, `vscode://` links from inside the iframe, the `executeDocumentSymbolProvider` doc text, GitLens, `--extensionDevelopmentPath` profile effects, Playwright reaching webview frames.
