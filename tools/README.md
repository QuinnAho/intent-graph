# tools

Two scripts, Node builtins only. Run from any worktree, each uses its own copy of the repo.

## verify.mjs

    node tools/verify.mjs check   # typecheck, lint, test
    node tools/verify.mjs build   # pnpm build, then checks dist exists
    node tools/verify.mjs all     # check, then build

One line per step, then `PASS|FAIL <verb> (time) - note`. Exit 0 only on PASS.
A pass needs every step exit 0, a readable vitest report with more than zero tests
and none failed, no crash strings in the log, and a non-empty dist per built package.
Logs: `.runs/verify/<timestamp>/`. Machine result: `.runs/verify/latest.json`.

## frames.mjs

    node tools/frames.mjs [--out <dir>] [--timeout <sec>]

Seeds `.intentgraph/graph.json`, starts the webview vite server on a free port,
opens it in headless Chromium, waits for graph nodes, saves JPEG frames
(1280 wide, quality 82): `01-fit.jpg` and `02-zoomed.jpg`. `--out` also copies them.
A pass needs nodes rendered, zero console errors, and every frame present and over 5 KB.
It stops only the vite process tree it started. Frames: `.runs/frames/<timestamp>/`,
result in `.runs/frames/latest.json`.

First time on a machine: `pnpm exec playwright install chromium`.
