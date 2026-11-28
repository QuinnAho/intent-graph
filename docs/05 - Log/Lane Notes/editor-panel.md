---
lane: editor-panel
branch: editor-panel
worktree: .wt/editor-panel
status: ready
go: owner, 2026-11-27
---
# Lane 16: the graph in an editor panel

## The ask

The owner, paraphrased: this will be the main interface, so it should be a VS Code plugin and feel like one IDE. The owner said to go on with the extension on 2026-11-27.

The decision is [[0032-a-thin-vs-code-extension-around-the-page]]. The recipe is [[2026-11-27 VS Code Extension - Recipe]]: read all of it first, it is 87 lines.

This lane is the smallest first step. The page we have shows in a panel of VS Code, started by one launcher, with nothing installed in the owner's editor. It also builds the shell's half of "graph to code".

## What exists (read these, not the whole tree)

- `packages/extension` is the May plan's layout only: 11 stub files, 61 lines. Its `package.json` already declares the command `intentgraph.openGraph` and `main: ./dist/extension.js`. Its `tsconfig.json` builds CommonJS to `dist` with the types `node` and `vscode`. It is in the pnpm workspace, so `node tools/verify.mjs all` type-checks, lints, tests and builds it.
- The server is `packages/skill/src/live/cli.ts`: `--root <dir> [--port <n>] [--web <dir>] [--write]`. Port 0 picks a free port. It prints `live: <url>` on stdout. A `stop` line on stdin stops it. `tools/play.mjs` (88 lines) starts it exactly this way and reads the address: copy that.
- The page reads `?focus=<id>` (`packages/webview/src/transport/live-source.ts:17,25`). It sends no message to a parent window today. Its entry file is `packages/webview/src/main.tsx`.
- The server's write check accepts only Host and Origin `127.0.0.1:<port>` or `localhost:<port>` (`checkWriteRequest` in `packages/skill/src/live/edit-api.ts`). An iframe to the server keeps both.
- `playwright` ^1.65 is a dev dependency at the repo root. The end-to-end scripts use `chromium.launch` (`tools/e2e-glance.mjs:161`). `_electron` comes with the same package.
- VS Code 1.113.0 is on the dev machine with `code` on the PATH. `@types/vscode` 1.116 is installed: keep `engines.vscode` at `^1.95` and use no newer API.
- `.vscode-test/`, `.wt/`, `.runs/` and `dist/` are ignored by git.
- `tools/play.mjs:30` builds the page only when there is no built page, so after a page change it serves the old one. See step 8.

## Scope

1. **The server child**, `packages/extension/src/server-process.ts`. Start the live server with the system `node`, `--import tsx`, the CLI, `--root <the first workspace folder>`, `--port 0`, `--web <the built page>`, and `--write` only when the setting `intentgraph.write` is true (default false). `spawn` with an argument array, never a shell. The repo root is two folders above the extension folder. Read the `live: <url>` line within 20 seconds. On dispose write `stop\n`, wait up to 8 seconds, then kill only that child's tree. One server per window, reused when the panel opens again.
2. **The panel**, `packages/extension/src/panel.ts`. `createWebviewPanel` beside the active editor, `enableScripts: true`, `retainContextWhenHidden: true`, `localResourceRoots: []`. The HTML is one full-size iframe to the address the server printed, and a relay script of about 15 lines. The content security policy: `default-src 'none'`, `frame-src` for that one address only, `script-src` with a nonce, `style-src 'unsafe-inline'`. The relay passes on only objects whose `type` starts with `intentgraph.`, and only from the iframe it made.
3. **The commands**, `packages/extension/src/extension.ts`. `intentgraph.openGraph` opens the panel and starts the server when needed. A second call shows the same panel. `intentgraph.reveal` takes a node id and loads the page with `focus=<id>`. The setting `intentgraph.openOnStart` (default false) opens the panel when the window is ready. `deactivate` stops the server.
4. **Opening a file**, `packages/extension/src/open-file.ts`, written test first, with no import of `vscode` in the part that decides. It handles `{ type: 'intentgraph.open', path, line }` as ADR 0032 defines it. It refuses an absolute path, a path that leaves the workspace through `..`, and anything that is not a string. A missing line means the top of the file. The file opens in the editor group that does not hold the panel, so the graph stays in sight.
5. **The page's half of the bridge**, a new file `packages/webview/src/transport/shell-bridge.ts`, and one line in `main.tsx` to start it. When the page has a parent window it posts `{ type: 'intentgraph.ready', nodes }` once the graph is laid out, and it exports `openInEditor(path, line)` for a later lane to call. With no parent window it does nothing. No other page file changes.
6. **The launcher**, `tools/play-vscode.mjs` with `open-in-vscode.cmd` and `open-in-vscode-edit.cmd` at the repo root, in the style of `tools/play.mjs`. It builds the extension, builds the page when step 8 says so, and starts `code --new-window` with its own `--user-data-dir` and `--extensions-dir` under `.runs/vscode/`, `--disable-extensions`, `--extensionDevelopmentPath` for this extension, and the folder to open. Before it starts it writes that user data folder's `settings.json`: `intentgraph.openOnStart` true, `intentgraph.write` by flag, workspace trust off, no welcome page, no update check, no telemetry. It must refuse to start without its own user data folder. `--print` prints the command and exits 0.
7. **The check**, `tools/e2e-extension.mjs`, in the style of the other end-to-end scripts: a PASS or FAIL line, an exit code, frames. It opens a temp copy of the example workspace in the machine's own VS Code through Playwright's `_electron.launch`, with temp user data and extensions folders, built by the same function the launcher uses. It proves, in order:
   - the panel opens by itself within 30 seconds: a tab named IntentGraph exists
   - the server answers: `/graph.json` holds the example's nodes (between 5 and 60)
   - the page loaded inside the panel: the extension received `intentgraph.ready` with the same node count. For this the extension writes its server address, the server's process id and what it received to the file named by the environment variable `INTENTGRAPH_E2E_FILE`, when that is set
   - an `intentgraph.open` message for `src/math.ts` line 3 makes that file the active editor at line 3, read from the window. Post it from inside the iframe when Playwright can reach it, otherwise through a command that exists only when the environment variable is set
   - a path outside the workspace and an absolute path open nothing
   - closing the window stops the server: its process is gone within 10 seconds and the port no longer answers
   - frames: `01-panel.png` with the graph beside a code file, `02-open-file.png`, `03-narrow.png` with the window 900 px wide
   It prints one line first that says a VS Code window will show for about 30 seconds. It kills only the process tree it started.
8. **A fresh page.** One helper decides whether the built page is stale: any file under `packages/webview/src` is newer than the built `index.html`. Both launchers use it. `tools/play.mjs` changes by five lines at most.
9. **Unit tests** in `packages/extension/tests`: the rules of step 4, the HTML of step 2 (the policy names the one port, has a nonce, holds no inline handler), reading the `live:` line. In `packages/webview/tests/shell-bridge.test.ts`: the bridge does nothing with no parent window.

## Files the builder may touch

- `packages/extension/**`. No new dependency, and the other stub files stay as they are.
- `packages/webview/src/transport/shell-bridge.ts` (new), one line in `packages/webview/src/main.tsx`, `packages/webview/tests/shell-bridge.test.ts` (new)
- `tools/e2e-extension.mjs`, `tools/play-vscode.mjs` and a helper beside them (new), `open-in-vscode.cmd`, `open-in-vscode-edit.cmd` (new)
- `tools/play.mjs`, five lines at most, for step 8
- `tools/verify.mjs`, only the list of what a green build must leave behind (near line 64)
- `eslint.config.mjs`, only if the extension needs an entry, with the reason in the report
- this note: the reuse record and the builder notes

If the work needs a file outside this list, change it and name the file and the reason in the report. Another lane is changing the page at the same time: touch no page file besides the two named here.

## Acceptance checks

1. `node tools/verify.mjs all` ends with a `PASS all` line, 535 tests or more.
2. `node tools/e2e-extension.mjs` passes three times in a row.
3. The other end-to-end scripts still pass: `e2e-glance`, `e2e-agents`, `e2e-edit`, `e2e-inferred`, `e2e-live`, `e2e-drift-marks`, `e2e-wires`.
4. `node tools/play-vscode.mjs --print` prints the command and exits 0.
5. No dependency and no lockfile change. Nothing downloaded.
6. The frames of step 7 exist under `.runs/e2e-extension/`.

## Not in this lane

- Wiring a click on a node to `openInEditor`. That is a page lane.
- The line above a function, the status bar item, passing the theme in, a packaged `.vsix`, remote workspaces, bringing the panel back after a restart.
- Installing anything in the owner's editor. `@vscode/test-electron`, which downloads its own copy of VS Code.

## Stop clause

Stop and report after 90 minutes, or if the gate cannot be made green in two tries. Stop at once and report what you saw if:

- `--extensionDevelopmentPath` with its own user data folder does not load the extension on 1.113.0
- Playwright cannot start the machine's VS Code at all
- the iframe stays blank inside the panel after two tries: report what the panel's console says
- a step would need an install or a download
- a VS Code window that the script did not start would have to be closed

If time runs short, finish and commit whole scope steps in order and list the ones left undone. Steps 1 to 4 and 7 come first.

## Reuse record

- **Draw.io integration** (GPL-3.0): borrowed the idea only, an iframe in a webview with a relay script. No code copied, the relay is our own 12 lines.
- **Nx Console** (MIT): borrowed the idea of checking that a path from the graph stays inside the workspace before opening it. Our check is our own and stricter: no backslash, no colon, no `..` that climbs out, then a second check on the joined path.
- **Playwright** `_electron` (Apache-2.0, already a dev dependency): adopted to drive the machine's own VS Code in the check.
- **`tools/play.mjs`** (this repo): copied its way of starting the server, reading the `live:` line and ending a tree with `taskkill /t`.
- Skipped: `@vscode/test-electron` and `@vscode/test-cli` (they download VS Code), `vscode-messenger` (plain `postMessage` is enough for two message types), `portMapping` (not needed for 127.0.0.1 on the same machine).

## Builder notes

- **Proved first, all on the first try on VS Code 1.113.0:** `--extensionDevelopmentPath` with its own `--user-data-dir` and `--extensions-dir` loads the extension (the title says "[Extension Development Host]"). Playwright `_electron.launch` starts `Code.exe` and can reach the iframe as a frame (`win.frames()` lists `http://127.0.0.1:<port>/`), so the check posts messages from inside the page, no test-only command was needed. The iframe shows inside the webview with `frame-src` naming only the one address.
- **The binary.** Both the launcher and the check start `Code.exe` directly, found next to the `code` command on the PATH, not `code.cmd`. The `.cmd` sets `ELECTRON_RUN_AS_NODE` and hands off to the same program, and Playwright needs the program itself. Every `VSCODE_*` variable is dropped from the child's environment so a launch from a VS Code terminal cannot join the owner's window. `assertOwnFolders` refuses any user data or extensions folder outside `.runs/` and the temp folder, and VS Code's own folders.
- **The ready count** is the number of nodes in the page's store once the layout is done. It equals `/graph.json` (11 on the example). The rendered React Flow node count is smaller (5), so the DOM was not used.
- **One line in `main.tsx`** is a dynamic import of the bridge, so the line both loads and starts it. Vite puts the bridge in its own small chunk.
- **Panel column.** With no editor open the panel lands in group 1 and files open in group 2. With an editor open it lands beside it, and files open in group 1. Either way the graph stays in sight.
- **Closing the window** runs `deactivate`, which sends `stop` and the server exits before the window is gone. The check saw the server process gone and the port closed at once.
- **Settings of the separate window:** panel on start, edit by flag, trust off, no welcome page, no update check, telemetry off, no secondary side bar, AI features off, git does not offer the parent repo.
- **Keys and focus, for the owner to judge.** Not tested by hand. From the VS Code source (see the recipe): while the page has focus, VS Code's own shortcuts such as Ctrl+P do not fire, and the page's own keys work. The page's right-click menu works, VS Code's does not. Click the code side to get the editor keys back.
- **Seen in the frames:** the page's "How to read the graph" legend opens on the first visit and covers much of a narrow panel. VS Code shows a toast that installed extensions are off. Both are expected. The legend at 900 px is a page lane matter.

## Results

Checked on `a3b6ec0`, 2026-11-28. Scope steps 1 to 9 done.

- `node tools/verify.mjs all`: exit 0, `PASS all`, 563 tests in 55 files.
- `node tools/e2e-extension.mjs` three times in a row: exit 0 each, panel in 7.9 to 9.4 s, 11 nodes, server gone when the window closed.
- `e2e-glance`, `e2e-agents`, `e2e-inferred`, `e2e-live`, `e2e-drift-marks`, `e2e-wires`: PASS. `e2e-edit` failed once on its 400 ms limit for a single click (438 ms, right after the other runs) and passed on the rerun (332 ms). The page code it times is unchanged by this lane.
- `node tools/play-vscode.mjs --print`: exit 0.
- No dependency or lockfile change, nothing downloaded. Frames under `.runs/e2e-extension/`.

## Builder notes, fixes after the verifier

- A missing built page now shows a message in the panel with the build command, and no server is started.
- No `node` on the PATH shows a Node.js 20 message. Any other start failure shows the child's last 5 lines, escaped.
- The message is the webview's own HTML (`problem-html.ts`, strict policy, no script), so the `--vscode-*` colours apply.
- `INTENTGRAPH_WEB_DIR` points the extension at another page folder. The check uses it for the missing page case.

## Orchestrator's check

Written on 2026-11-28.

- Built at `88396a9`. An independent verifier ran 17 held-back checks on the machine's own VS Code: 16 pass. The owner's own VS Code folders were the same before and after, a bystander window survived, and no process was left behind. The fail: with no built page the panel showed a faint "not found" and nothing about what to run.
- Fixed by a second agent at `5d7f4d7`: plain messages for a missing page, a missing `node` and a server that will not start.
- Gate on `5d7f4d7`, each with exit 0: `PASS all (57.9s) - 4 steps, 571 tests`, `PASS e2e-extension (20.8s)`, and PASS for `e2e-glance`, `e2e-agents`, `e2e-edit`, `e2e-inferred`, `e2e-live`, `e2e-drift-marks` and `e2e-wires`. `day-2` had not moved, so this is the tree that was merged. `e2e-extension` also passes in the main checkout after the merge.
- Frames with a verdict each: `docs/05 - Log/Frames/2026-11-28/README.md`.
- Left open: on the [[Board]] under Known.
