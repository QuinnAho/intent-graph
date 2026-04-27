# Phase 1 dev shell checklist

> **Purpose** — Human-run verification that `pnpm dev` opens the React Flow shell in the webview, per the Phase 1 gate (`tech-spec.md#phase-1--fork--cleanup`). The agent cannot drive a browser, so this checklist substitutes for the visual half of the gate. Run it on the workstation that owns the repo. Take ~5 minutes.
>
> **Scope** — Phase 1 only. The shell renders an *empty* React Flow canvas with the IntentGraph node-type and edge-type maps registered, the dotted-grid background, and the IntentGraph theme variables (loaded via `styles/index.css` → `tokens.css`). There is no graph data yet — that lands in Phase 2 (L0 dogfood gate). The goal of this gate is to confirm **React + React Flow v12** mount cleanly with the theme tokens applied and the dev server is reachable. The ELK worker and Zustand stores exist in the package but are not exercised by an empty shell — those gates live in Phase 2 once real graph data flows. A populated graph is **not** required here.
>
> **If anything below fails**, do **not** mark Phase 1 complete. File the failure against `p1-t05` in `automation/tasks/phase-1-fork-cleanup/tasks.json` and surface it via `/intentgraph-status` before proceeding.

## Pre-flight

- [ ] Repo is at the commit produced by Phase 1 task `p1-t05` (or later) — `git log --oneline -5` shows the task commit on `main`.
- [ ] No other Vite / Ralph / dev-server process is running on this machine. The default Vite port is 5173; nothing else should be holding it.
- [ ] Node ≥ 20.11.0 and pnpm ≥ 9.0.0 — confirm with `node --version` and `pnpm --version`. (See `package.json#engines`.)
- [ ] Dependencies are installed at the workspace root: `pnpm install --frozen-lockfile` exits 0.

## Run

- [ ] From the workspace root, run:

      pnpm dev

  This invokes `pnpm -r --parallel run dev`, which is the spec-language gate (`tech-spec.md#phase-1--fork--cleanup` says *"`pnpm dev` opens the React Flow shell in the webview"*). Sibling packages with no `dev` script are skipped silently; only the webview's Vite dev server should produce output that opens a browser-bound URL.

- [ ] Vite logs `VITE vX.Y.Z  ready in <N> ms` and prints a `Local:` URL (default `http://localhost:5173/`). No red errors before the ready line.
- [ ] **Sibling watch-mode builds are also clean.** Root `pnpm dev` is `pnpm -r --parallel run dev`, which starts `@intentgraph/extension` (`tsc -b -w`) and `@intentgraph/skill` (`tsup --watch`) alongside Vite. Scroll the terminal output: there should be no TypeScript errors from `@intentgraph/extension` and no tsup build errors from `@intentgraph/skill`. A failure in either is also a Phase 1 gate failure.

## Verify in the browser

- [ ] Open the printed `Local:` URL in Chrome, Edge, or Firefox.
- [ ] The page title is **IntentGraph** (matches `packages/webview/index.html`).
- [ ] The page body shows a **dotted-grid background covering the full viewport** — that is the `<Background>` from `@xyflow/react` rendered by `GraphCanvas`. The grid is the visual signal that React Flow mounted, even though no nodes are visible yet (Phase 1 has no graph data).
- [ ] Open the browser DevTools **Elements** tab. Inside `<div id="root">` you can see a `react-flow` class tree (e.g., `<div class="react-flow ...">`, `<div class="react-flow__renderer">`, `<svg class="react-flow__edges">`). Their presence confirms the v12 React Flow surface area mounted.
- [ ] Open the browser DevTools **Console** tab. There are **no red errors**. (A 404 on a missing favicon is acceptable; a `Failed to resolve module specifier`, a React error overlay, or a hydration error is *not*.)
- [ ] Pan and zoom on the empty canvas with mouse-drag and wheel/pinch. The dotted grid translates and scales smoothly. (This exercises the React Flow event surface; failures here mean the input handlers are not wired.)

## Optional sanity (skip if checklist already failed above)

- [ ] In a second terminal, run `pnpm --filter @intentgraph/webview build`. It exits 0 and writes `packages/webview/dist/index.html` plus a hashed JS bundle. (Confirms the production build path is clean. Do not open `dist/index.html` over `file://` — Vite's default `base: '/'` will 404 the hashed asset paths and the failure is unrelated to the Phase 1 gate. Production-bundle visual verification is a Phase 2 concern once the bundle is served from the extension host.)
- [ ] Run `pnpm --filter @intentgraph/webview typecheck`. Exits 0 (no `tsc` errors). Already enforced by `/intentgraph-verify`, but worth confirming end-to-end on the same checkout.

## Tear down

- [ ] Stop the dev server with `Ctrl+C`. Confirm the port is released (a second `pnpm dev` starts on `5173` again, not a fallback port).

## Sign-off

- [ ] All boxes above are checked.
- [ ] Recorder name: ____________________
- [ ] UTC date/time of run: ____________________
- [ ] Commit SHA verified against (`git rev-parse HEAD`): ____________________

When complete, attach this filled-in checklist (or a copy with notes) to the Phase 1 sign-off record. The dev-shell gate is satisfied only when every box is checked on the same checkout.
