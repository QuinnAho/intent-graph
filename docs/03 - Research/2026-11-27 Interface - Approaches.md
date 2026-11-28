---
status: waiting for the owner's pick
date: 2026-11-27
---
# The interface: a VS Code extension, three linked layers, one memory

The owner's thought, paraphrased: this will be the main interface, so it should probably be a VS Code plugin and feel like one IDE. The three abstractions (intent, architecture, code) should link to each other: code to the architecture layer, and an intent to any function it names. And it should connect to the one memory system the sessions already use.

## Where the tool is today (checked on this machine, 2026-11-27)

- The page is a web page. The live server serves `/graph.json` over HTTP and the page reads it (`packages/webview/src/transport/`). It opens in a browser from `open-graph.cmd`.
- `packages/extension` is the May plan's layout for a VS Code extension: 11 source files, 61 lines, names only. No working code.
- ADR 0001 (May 2026, accepted) already says the product is a plugin for VS Code and not its own IDE. ADR 0029 deferred the extension host and says it is not extended without a new ADR.
- The spec already holds an intent named `developers-stay-in-their-editor`.
- Code nodes know their file. Spec nodes know their parent. No spec node of this repo is bound to code: the anchor format (ADR 0030) is still proposed. So on a real intent there is nothing to jump to yet.
- The middle layer does not exist. See [[2026-11-27 Layers - Approaches]].

## What others do (from memory, not looked up today)

- Nx Console: one graph app. The command line opens it in a browser, and the editor extension shows the same app in a panel.
- GitLens, Draw.io, Excalidraw: a web view inside the editor with editor commands around it.
- CodeLens: a line above a function, drawn by an extension. The usual way to say "this code serves X" and jump from it.
- Editors forked from VS Code run the same extensions, and the Claude Code extension sits in the same window.

A research pass checks these against the official docs before anything is built.

## Options

- **A. Stay in the browser, add "open in editor" links.** A click on a code node opens its file through a `vscode://file/...` link. No install. One direction only: nothing in the editor points back at the graph.
- **B. A thin extension around the page we have.** A panel shows the same page, fed by the same server. A click on a node opens the code beside it. A line above a bound function names its intent and shows it on the graph. The state bar's counts sit in the status bar. The browser launcher keeps working.
- **C. The May plan's full extension.** Tree views, a drift inbox, a diff provider, diagnostics, its own process management.
- **D. Its own app.** Rejected by ADR 0001.

## Read on each

- A is small and proves whether the jump is useful. It fits inside lane 13, where code first shows under an intent.
- B is the right home. It stays small because the page and the server do not change. It touches no page file, so it can be built while a page lane runs. It needs the owner's yes twice: a new ADR to take the extension off the parked list, and an install in the owner's editor.
- C is where B grows, one piece at a time, when a piece is missed in daily use. Built whole it is the plumbing ADR 0029 parked.
- The extension does not make the links. With no intent bound to code it is the same page in another window.

## The three links

1. **Code to architecture.** Files and modules are linked today by the tree-sitter walk. A drawn architecture layer above them is the middle layer of the layers note.
2. **Intent to code, by name.** When an intent's text names a file or a function in backticks, a script matches the name against the symbols the graph already has. No model, no cost. A name can match two things, so a match is drawn dashed as a proposed anchor and one key confirms it, the same as an inferred intent.
3. **Intent to architecture.** Needs the middle layer. Experiment C in the layers note.

Measured on this repo's spec: 27 files hold 66 different backticked names. 6 are paths that exist. 26 look like identifiers, and most of those are field names such as `id` and `created`, not functions. So link 2 is cheap and thin here: the May intents talk about ideas, not code. It will carry more as intents get written next to code, and a model's proposals (the inference script) fill the rest.

All three rest on the anchor format. Calls 3 and 4 on the [[Board]] unlock them.

## One memory

- Three stores exist: the owner's private notes on how they work (across projects), this vault (decisions, board, log), and the graph (spec and code).
- Link them, never merge them. One fact, one place. The private notes stay out of this public repo.
- For a person: a decision record shows as a node that opens its file, lanes show as agents on the graph (lane 14), and the state bar says where the project stands.
- For an agent: the Claude Code plugin already on the Board (a skill, hooks, a small MCP server). Before a change, an agent asks which intents and constraints cover the files it is about to touch, the way a session start already tells it which project notes to read.

## Recommendation

1. Finish the page lanes that have a go (12 to 15). A goes into lane 13.
2. Answer calls 3 and 4. Then one lane proposes anchors, by name first and by model second, and this repo gets its first real links.
3. B as its own lane after a research pass writes the recipe. It can run beside a page lane.
4. The Claude Code plugin after B, so people and agents read the same graph.

## What it needs from the owner

- Yes or no on B, and when: beside the page lanes, or after lane 15.
- Calls 3 and 4 on the Board.
- A yes before anything is installed in the owner's editor.

## Risks

- A panel beside code is narrow. The page has been checked down to 900 px only.
- A web view has its own rules for loading scripts and reaching a local server. Not looked up yet.
- Two ways to open the page are two things to keep working. The end-to-end scripts cover the browser only.
