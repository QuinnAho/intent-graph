# Phase 2 L0 sign-off — agent-runnable items

> **Companion to** `PHASE2_L0_CHECKLIST.md`. The checklist is the canonical sign-off; this file records the agent-runnable subset of its items so the human only has to perform the browser-driven and teammate-driven items. Mark `p2-t10` complete in `automation/sessions/progress.json` only when **all** checklist items are checked, not just the ones below.
>
> **Date of agent run:** 2026-05-04
> **Repo HEAD at agent run:** `6d6aa7c` (after `9745eb0` p2-t13 spike + `cd17699` research docs + `5be9331` adr batch + this commit's postcss fix)
> **Session phase:** post-p2-t13, immediately before p2-t10 sign-off.

## Pre-flight (checklist §"Pre-flight")

| Check | Result | Evidence |
|---|---|---|
| Repo at p2-t09 or later, with p2-t05..t09 on `main` | ✓ | `git log --oneline -10` shows p2-t05 through p2-t14 plus the post-p2-t11 work landed |
| `automation/sessions/progress.json` lists p2-t01..t09 in `completed` | (n/a — file may not exist on this branch; the checklist defers final marking until human sign-off) | — |
| No other Vite/dev-server on default port 5173 | ✓ | confirmed before each build/seed run |
| Node ≥ 20.11.0 | ✓ | `node --version` → `v22.20.0` |
| pnpm ≥ 9.0.0 | ✓ | `pnpm --version` → `9.12.0` |
| `pnpm install --frozen-lockfile` exits 0 | ✓ | `Done in 8.6s`. One pre-existing harmless WARN ("Failed to create bin at packages/agent-skill/node_modules/.bin/intentgraph-skill") because `agent-skill`'s dist/index.js doesn't exist until first build. Not a regression. |
| `/intentgraph-verify` (typecheck + lint + test) green | ✓ | typecheck 6/6 packages clean; lint `--max-warnings=0` clean; 11 test files / 90 tests all passing |

## Item 1 — Build succeeds

| Check | Result | Evidence |
|---|---|---|
| `pnpm --filter @intentgraph/webview build` exits 0 | ✓ | `vite v6.4.2 ... ✓ built in 13.86s` |
| `dist/index.html` produced | ✓ | 0.40 kB |
| Hashed JS bundle produced | ✓ | `dist/assets/index-BZAXe7JJ.js` 1,795.41 kB / gzip 553.96 kB |
| Hashed CSS bundle produced | ✓ | `dist/assets/index-Ccc0b_Z9.css` 21.83 kB |
| No red errors in build output | ✓ | one yellow advisory only — see below |
| **No warnings mentioning IntentGraph source paths** | ✓ | the one prior IntentGraph-source-named warning (PostCSS `@import` ordering in `packages/webview/src/styles/index.css`) was fixed in commit `6d6aa7c`. Post-fix build is silent on IntentGraph paths. |

### Build advisories that remain (not blockers, both pre-existing)

1. **Chunk size advisory.** `dist/assets/index-*.js` is 1,795.41 kB after minification, over Vite's default 500 kB warning threshold. The warning text is generic (does not name an IntentGraph source path). Cause: React Flow + ELK + TipTap + their transitive deps land in the main chunk because the webview has not yet introduced `manualChunks` configuration. Real fix is `build.rollupOptions.output.manualChunks` plus dynamic import boundaries for the layout worker (when Phase 4 fixes the worker per `docs/spikes/elk-5k-results.md` §6) and the editor (TipTap is only mounted on focus per tech-spec §3.5 line 143, so a route-split is appropriate). **This is Phase 6 hardening territory** and is intentionally not in scope for L0.

## Item 2 — Static load works *(seed half)*

| Check | Result | Evidence |
|---|---|---|
| `pnpm tsx scripts/seed-dev-db.ts` exits cleanly | ✓ | exit 0; final line `[seed-dev-db] done.` |
| Reports node count > 100 | ✓ | `708 nodes (22 spec, 154 modules, 532 symbols), 548 edges` |
| `claudemap/` excluded from walk | ✓ | `node -e` cross-check: zero nodes contain `claudemap` in the body JSON |
| Writes `.intentgraph/graph.json` at repo root | ✓ | confirmed on disk |
| Writes `.intentgraph/dev.db` | ✓ | confirmed on disk |
| **Visual half** (Vite dev-server, Network 200 on `/graph.json`, no React error overlay, no `Failed to fetch`) | **NOT RUN — needs browser** | run `pnpm --filter @intentgraph/webview dev`, open the printed Local URL, check DevTools Console + Network tabs |

## Item 3 — graph.json is consumed *(count cross-check half)*

| Check | Result | Evidence |
|---|---|---|
| Seed summary node count matches `summary.nodes` in graph.json | ✓ | `708` matches the `[seed-dev-db]` line and `summary.nodes` in `.intentgraph/graph.json` |
| Per-kind breakdown sane | ✓ | 12 intent / 4 constraint / 6 concept / 154 code_module / 532 code_symbol / 0 skeleton_symbol |
| **Webview-rendered count** (visible + virtualized) matches summary | **NOT RUN — needs browser** | open the canvas, zoom out fully, compare against `708` |

## Items 4, 5, 6 — Visual checks

All three require DevTools inspection of the live canvas. Not agent-runnable.

| Item | What you check |
|---|---|
| **Item 4 — Intents are visible** | At least one IntentNode with the intent-kind border color renders. DevTools Elements: a `<div data-id="intent-..."` exists inside the React Flow root. With p2-t11 having shipped, you should now see 12 intents (was 2 fixtures pre-p2-t11). |
| **Item 5 — Code modules are visible** | At least one `kind='code_module'` node renders. Click it; detail panel shows `file://...` URI, language `typescript` or `javascript`, 64-char SHA-256 `file_hash`. |
| **Item 6 — Concept sub-flows render** | At least one `kind='concept'` node renders as a *bounding box* containing child nodes. Drag a child within the parent; it stays inside (verifies `extent: 'parent'` from p2-t09). With p2-t11, the dogfood payload includes 6 concepts (was 1 fixture). |

## Item 7 — Find-an-intent in 60 seconds *(NOW UNBLOCKED)*

p2-t11 has shipped: 12 real intents are authored under `/spec/intents/`. This item is no longer blocked.

Runbook (per checklist §Item 7):
1. Identify a teammate or someone who has not seen the canvas before.
2. Hand them the URL with the canvas already open. Do not pre-zoom or pre-select.
3. Tell them the title of one specific intent. Suggested target intents from the L0 dogfood payload (pick one): `intent-graph-state-survives-crashes`, `intent-monitor-gates-every-commit`, `intent-developers-stay-in-their-editor`, `intent-agent-runs-are-traceable`. Use the *human-readable title* from the markdown frontmatter, not the slug, e.g. "Find the intent titled 'Graph state survives crashes'".
4. Start a stopwatch. Stop when they click the correct node and it becomes selected.
5. Pass criterion: ≤60 seconds.

Failure modes to surface back to the architect track if the test fails: canvas too dense for visual scanning, intent labels too long at default zoom, find-by-name affordance (search/Cmd-K) absent. Tech-spec line 92 lists no search affordance for L0; if visual scan fails consistently, the right response is an ADR for a Phase 3 search/find primitive, not a checklist relaxation.

## Item 8 — Coverage Verifier output is informational

| Check | Result | Evidence |
|---|---|---|
| `pnpm --filter @intentgraph/skill test -- --run tests/verifier-coverage.test.ts` produces 15 passing tests | ✓ | `Test Files 1 passed (1)` / `Tests 15 passed (15)` in 1.15s |
| Coverage Verifier on the actual L0 graph: warnings only, never throws | (not exercised — the L0 webview path doesn't run the Coverage Verifier yet; tested only via the unit test. Phase 3's `verify.run` MCP tool is the user-facing path.) | — |

The unit-test pass is sufficient for the L0 gate per the checklist's resolution: the verifier scheduler and registry survived between p2-t07 and now. A red Coverage run on the L0 graph (orphan intents, constraints with no outgoing edges) is **expected and informational** at L0; only a *throw* would be a gate failure.

## What this leaves for the human

Sign-off on `PHASE2_L0_CHECKLIST.md` requires you (or a designated teammate) to perform:

1. **Item 2 visual half** — `pnpm --filter @intentgraph/webview dev`, open the URL, confirm Console + Network look right.
2. **Item 3 webview-count cross-check** — confirm rendered node count matches 708.
3. **Item 4** — find an IntentNode in DevTools Elements.
4. **Item 5** — click a code_module, confirm the detail-panel fields.
5. **Item 6** — find a concept sub-flow, drag-test the `extent: 'parent'` containment.
6. **Item 7** — stopwatch test with a teammate (60 seconds, named intent target).
7. **Sign the checklist** at the bottom once all items including the agent-runnable ones above are checked.

After that, mark `p2-t10` complete in `automation/sessions/progress.json` (or create the file if the workflow expects it) and Phase 2 closes. Phase 3 (MCP server + bidirectional markdown sync → L1) cannot start until the checklist is signed.

## Commits made during this run

| SHA | Subject |
|---|---|
| `5be9331` | adr(0017-0026): accept ten proposed adrs as a batch |
| `cd17699` | docs(research): land the ux research synthesis cited by adrs 0020-0025 |
| `9745eb0` | p2-t13: risk-c spike measurement + advisory recommendation |
| `6d6aa7c` | p2-t10: clear postcss @import-ordering warning in webview build |

## Outstanding from the original Phase 2 cleanup pass

| Item | Status |
|---|---|
| Phase-4 task list draft (`automation/tasks/phase-4-drift-detection/tasks.draft.json`) | deferred (per direction) |
| Phase-5 task list draft (`automation/tasks/phase-5-retrieval-eval/tasks.draft.json`) | deferred (per direction) |
| `automation/tasks/v1.1-parking-lot/` | deferred (per direction) |
| `automation/staging/PHASE2_L0_CHECKLIST.md` | **uncommitted but referenced from this file** — see "Outstanding files" below |

## Outstanding files at end of agent run

These three files are uncommitted but referenced by the work above. They should land before Phase 2 closes; the question is whether to commit each separately or together. Recommend reviewing each before committing — none are agent-authored except the new `PHASE2_L0_SIGNOFF.md` (this file).

- `automation/staging/PHASE2_L0_CHECKLIST.md` (untracked — written but never committed; this sign-off file references it)
- `automation/staging/PHASE2_L0_SIGNOFF.md` (this file)
- `automation/tasks/phase-4-drift-detection/tasks.draft.json` (deferred per direction)
- `automation/tasks/phase-5-retrieval-eval/tasks.draft.json` (deferred per direction)
- `automation/tasks/v1.1-parking-lot/` (deferred per direction)
