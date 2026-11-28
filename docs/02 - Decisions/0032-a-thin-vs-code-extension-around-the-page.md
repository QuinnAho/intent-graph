# ADR 0032 — A thin VS Code extension around the page

## Status

Accepted. The owner said to go on with the extension on 2026-11-27.

Takes the VS Code extension host off the parked list of ADR 0029, and narrows it: a thin shell, not the May plan's extension. Follows ADR 0001 (a plugin, not our own IDE).

## Context

- The owner wants the tool as the main interface, inside the editor, with jumps between the graph and the code.
- The page and the live server already work in a browser. `packages/extension` holds only the May plan's file layout, no working code.
- The options: [[2026-11-27 Interface - Approaches]]. The research: [[2026-11-27 VS Code Extension - Recipe]].

## Decision

1. **The extension is a shell.** It starts the live server we have, shows the page we have in a panel, and adds editor commands around it. There stays one page and one server. The browser launcher keeps working.
2. **The panel holds an iframe to the local server**, with a small relay script, the shape the Draw.io extension uses. Not the built page loaded through `asWebviewUri`: that changes the page's origin, and the server's write check refuses it.
3. **Messages are the contract between the page and the shell.** Plain objects through `postMessage`, and every `type` starts with `intentgraph.`:
   - page to shell, `{ type: 'intentgraph.ready', nodes }`: the graph is laid out.
   - page to shell, `{ type: 'intentgraph.open', path, line }`: open this file. `path` runs from the workspace root with forward slashes. `line` starts at 1 and may be missing. The shell opens it beside the panel and refuses any path outside the workspace.
   - shell to page, reveal a node: first by loading the page with `?focus=<id>`, which the page already reads.
   - With no shell around it, in a browser, the page behaves as it does today.
4. **Nothing is installed in the owner's editor without a yes.** Until then the extension runs in a separate window with its own user data folder and its own extensions folder.
5. **Order.** The panel first. Then graph to code. Then code to graph: a line above a bound function that names its intent, which needs ADR 0030. Then one status bar item with the state.
6. **Every piece has a scripted check.** What a script cannot judge (how it looks, how the keys feel, a narrow panel) goes to the owner as frames.

## Consequences

- One page serves the browser and the editor. Every page lane now has to hold in a narrow panel, checked at 900 and 480 px.
- While the page has focus, VS Code's own shortcuts do not fire: a nested frame does not hand its keys to the editor (VS Code issue 180234). The page's own keys work. To be judged once the panel exists.
- Theme colours do not cross into the iframe. The page keeps its dark theme until a later lane passes the theme in.
- The server runs with `node --import tsx` from inside this repo. A packaged extension needs the server bundled first. That comes later.
- Remote workspaces are not supported in the first cut.

## Left out on purpose

The May plan's tree views, drift inbox, diff provider, diagnostics and MCP client. Each comes back only when it is missed in daily use, as its own lane.

## Alternatives considered

- **Stay in the browser with `vscode://` links.** One direction only: nothing in the editor points back at the graph.
- **The built page through `asWebviewUri` with a fetch shim**, the shape Nx Console uses. It needs a change to the page and to the server's write check.
- **A sidebar view.** Too narrow for a graph. Maybe later, for the state alone.

## Fallback

If an iframe in a webview cannot be made to work on the owner's machine, stay with the browser page and add `vscode://file/...` links. That would be a new ADR.
