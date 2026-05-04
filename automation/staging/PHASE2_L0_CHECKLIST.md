# Phase 2 L0 dogfood checklist

> **Purpose** — Human-run verification that the L0 dogfooding gate (`tech-spec.md#phase-2--static-graph-build--l0`, lines 444–445) is met: `pnpm build && open app/dist/index.html` shows IntentGraph's own intents and code modules, and a new team member finds an intent visually within 60 seconds. The agent cannot drive a browser, so this checklist substitutes for the visual half of the gate. Run on the workstation that owns the repo. Take ~10–15 minutes (item 7 adds 60 seconds plus stopwatch fumbling).
>
> **Scope** — Phase 2 only. The webview reads `graph.json` from disk (the file produced by `pnpm tsx scripts/seed-dev-db.ts`). The MCP path is Phase 3 — do not expect bidirectional editing here. The graph contains intents from `/spec/`, code modules + symbols from the tree-sitter walk over `packages/*/src/**`, and `realizes` edges from spec frontmatter `parent` fields. There is no drift detection, no AgentRunner, no monitor LLM at L0.
>
> **If anything below fails**, do **not** mark Phase 2 complete. File the failure against `p2-t10` in `automation/tasks/phase-2-static-graph/tasks.json` and surface it via `/intentgraph-status` before starting Phase 3.

## Pre-flight

- [ ] Repo is at the commit produced by Phase 2 task `p2-t09` (or later) — `git log --oneline -10` shows `p2-t05` through `p2-t09` on `main`.
- [ ] `automation/sessions/progress.json` lists `p2-t01` through `p2-t09` in `completed`.
- [ ] No other Vite / dev-server process is running (default Vite port 5173 is free).
- [ ] Node ≥ 20.11.0 and pnpm ≥ 9.0.0 — confirm with `node --version` and `pnpm --version`.
- [ ] Dependencies installed at the workspace root: `pnpm install --frozen-lockfile` exits 0.
- [ ] `/intentgraph-verify` (or the equivalent `pnpm typecheck && pnpm lint && pnpm test`) is green. The pre-existing `lint-rule.test.ts` failure on `main` is the only acceptable miss; if any *other* test fails, stop and fix before continuing.

## Item 1 — Build succeeds

- [ ] From the workspace root:

      pnpm --filter @intentgraph/webview build

  Exits 0 and writes `packages/webview/dist/index.html` plus a hashed JS bundle.

- [ ] No red errors during the Vite build (warnings are acceptable; investigate any that mention IntentGraph source paths).

## Item 2 — Static load works

- [ ] Generate a fresh seed first:

      pnpm tsx scripts/seed-dev-db.ts

  Expected output ends with `[seed-dev-db] done.` and reports a node count well above 100 (the team's own intents + code modules + symbols from `packages/*/src/**`). The `claudemap/` subtree is excluded by default; if it appears in the count, the loader's deny-list regressed. The seed writes to `.intentgraph/graph.json` at the repo root.

- [ ] Serve the webview locally:

      pnpm --filter @intentgraph/webview dev

  Vite's `publicDir` points at `.intentgraph/` (set in `packages/webview/vite.config.ts`), so the dev server resolves `/graph.json` automatically against the seed file. **Do not** open `dist/index.html` over `file://` — Vite's default `base: '/'` will 404 the hashed asset paths and the failure is unrelated to the L0 gate.

- [ ] Open the printed `Local:` URL. The page title is **IntentGraph**.

- [ ] DevTools **Console** tab shows no red errors. A 404 on a missing favicon is acceptable; a `Failed to fetch /graph.json` or a React error overlay is **not**.

## Item 3 — graph.json is consumed

- [ ] DevTools **Network** tab shows a successful fetch of `/graph.json` (status 200).

- [ ] The number of rendered React Flow nodes (visible plus virtualized) matches the seed summary printed by `seed-dev-db.ts`. Cross-check by running:

      cat .intentgraph/graph.json | python -c "import json,sys; d=json.load(sys.stdin); print('nodes:', d['summary']['nodes'])"

  The webview's count should equal that number. (The `onlyRenderVisibleElements` flag means not all nodes are in the DOM at once; you can confirm the total by zooming all the way out via the React Flow controls or by checking the Zustand store via the DevTools React extension.)

- [ ] If the page shows the "**Failed to load graph.json**" error overlay instead of the canvas, the loader caught a schema mismatch. The error message names the failure (wrong `_format`, wrong `_version`, fetch failure). Fix the seed and re-run.

## Item 4 — Intents are visible

- [ ] Identify at least one node rendered with the IntentNode chrome. The visual signature is the intent-kind border color (per `packages/webview/src/graph/nodes/IntentNode.tsx` + `nodeChrome.tsx`) and the intent label as the title.

- [ ] Confirm via DevTools Elements that a `<div data-id="intent-..."` element exists somewhere inside the React Flow root. (Intents that p2-t04 parsed from `/spec/intents/*.md` carry `intent-` ID prefix per ADR-0009.)

- [ ] At L0, the only intents present are the two example fixtures (`intent-example-drift-is-detectable`, `intent-example-graph-is-source-of-truth`). The full dogfood payload lands in p2-t11; absence of broader intent coverage here is expected and is the reason item 7 below is blocked.

## Item 5 — Code modules are visible

- [ ] At least one node of `kind='code_module'` is rendered. The expected count is in the dozens or hundreds (a recent smoke run produced 141 modules across `packages/skill`, `packages/shared`, `packages/webview`, `packages/extension`).

- [ ] Click a code-module node. It opens the detail panel (or selection state, depending on the surface). The body should show the module's URI (`file://...`), `language` (`typescript` or `javascript`), and `file_hash` (a 64-char SHA-256 hex string).

## Item 6 — Concept sub-flows render

- [ ] At least one concept node (`kind='concept'`) is rendered as a *bounding box* containing child nodes — the React Flow sub-flow rendering from p2-t09. The example fixture `concept-example-spec-driven-loop` is the clearest test case: it should visually contain its child intents (`intent-example-drift-is-detectable`, `intent-example-graph-is-source-of-truth`).

- [ ] Drag a child node within the concept bounding box. It stays inside the parent — that is the `extent: 'parent'` constraint working. If the child can be dragged outside the parent's bounds, the loader failed to set `extent: 'parent'` correctly.

- [ ] If no concept node is visible (the spec corpus has no concept files yet), this item is **provisionally pass** — the data path is verified by the loader unit tests in `packages/webview/tests/graph-json-loader.test.ts`. Re-run this item after p2-t11 lands real concept content.

## Item 7 — Find-an-intent in 60 seconds *(BLOCKED ON p2-t11)*

> **Status: blocked.** This item requires real intents authored under `/spec/intents/` (the L0 dogfood payload that p2-t11 produces). The two example fixtures are not enough — the test is whether a new team member can locate an intent *they have never seen* by name within 60 seconds, and with only two fixtures the criterion degenerates to "open the canvas." Re-attempt this item after p2-t11 lands.
>
> When p2-t11 lands, the runbook is:
>
> 1. Identify a teammate or someone who has not seen the canvas before.
> 2. Hand them the URL with the canvas already open. Do not pre-zoom or pre-select.
> 3. Tell them the *title* of one specific intent (e.g., "Find the intent titled 'AI cannot produce a patch without traversing specific intent nodes'").
> 4. Start a stopwatch. Stop when they click the correct node and it becomes selected.
> 5. Pass criterion: ≤60 seconds.
>
> Failure modes worth surfacing back to the architect track: the canvas is too dense for visual scanning, the intent labels are too long to read at default zoom, or the find-by-name affordance (search? Cmd-K? canvas overlay?) is missing entirely. Phase 2 does not commit to a search affordance — the test is purely visual scanning. If the visual scan fails consistently, the right response is an ADR for a Phase 3 search/find primitive, not a checklist relaxation.

- [ ] *(after p2-t11)* New team member finds the named intent in ≤60 seconds.

## Item 8 — Coverage Verifier output is informational

- [ ] Run the Coverage Verifier against the seed graph. There is no CLI for this at L0 (the MCP `verify.run` tool lands in Phase 3); the way to exercise it today is via the unit test:

      pnpm --filter @intentgraph/skill test -- --run tests/verifier-coverage.test.ts

  Expected: 15 tests pass.

- [ ] Coverage warnings on the actual L0 graph (orphan intents, constraints with no outgoing edges) are **expected and informational**. Per p2-t07's task notes: "Coverage Verifier failures SURFACE AS WARNINGS in phase 2, NOT BLOCKERS for L0." A red Coverage run on the in-progress dogfood payload is expected and useful as triage; it does not gate this checklist.

- [ ] If the Coverage Verifier *throws* (rather than just emitting warnings), that **is** a gate failure — it means the verifier scheduler or registry broke between p2-t07 and now. Investigate before continuing.

## Sign-off

- [ ] Items 1, 2, 3, 4, 5, 6, 8 pass on this checkout.
- [ ] Item 7 is blocked on p2-t11 and is acknowledged as such — Phase 2 does not close until p2-t11 lands and item 7 passes.
- [ ] No `pnpm typecheck`, `pnpm lint`, or `pnpm test` regressions on `main` HEAD attributable to Phase 2 work. The pre-existing `lint-rule.test.ts` failure is the documented exception.

**Sign-off note.** With items 1–6 and 8 complete, Phase 2's substrate is verified. Phase 3 (MCP server + bidirectional markdown sync → L1) cannot start until item 7 also passes — that is the gate the dogfooding ladder names. Mark `p2-t10` complete in `automation/sessions/progress.json` only when *all eight items* are checked, not when seven are.

Signed off by: ____________________  Date: __________
