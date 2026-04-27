# ADR 0011 — Test infrastructure layout

## Status

Accepted 2026-04-27. Retrospective ratification of the layout already shipped via vitest.workspace.ts.

## Context

This ADR is **retrospective**. The Vitest layout it describes already ships and is exercised by `pnpm test`, the CI pipeline (`.github/workflows/ci.yml`), and the autonomous workflow's per-package iteration model. No code change accompanies this ADR; the purpose is to record *why* the layout looks the way it does, so a future contributor cannot accidentally collapse it.

QA report 001 (`docs/qa/qa-report-001.md`), finding **F-VITEST-LAYOUT-UNRECORDED (minor)**, surfaced the gap: STRUCTURE.md describes the layout, but no ADR captures the rationale, and ADR-0006's "decisions made during the bootstrap" section does not enumerate test infrastructure. The decision is small but load-bearing — `pnpm test` from inside any package is part of the contract Ralph iterations rely on.

The layout as it stands:

- `vitest.workspace.ts` lists five Vitest projects:
  - `packages/shared/vitest.config.ts`
  - `packages/skill/vitest.config.ts`
  - `packages/extension/vitest.config.ts`
  - `packages/webview/vitest.config.ts`
  - `tests/integration/vitest.config.ts`
- Each per-package `vitest.config.ts` is a `defineProject({ test: { name: '<package>', include: ['tests/**/*.test.ts'], environment: 'node' } })`.
- `tests/integration/vitest.config.ts` adds `testTimeout: 30_000` and includes `suites/**/*.test.ts`.
- Per-package unit tests live under `packages/<name>/tests/`; cross-package end-to-end tests live under `tests/integration/suites/`.
- The root `pnpm test` script (`package.json:15`) runs `vitest run --passWithNoTests` — without a `--project` filter, this picks up the workspace and runs all five projects in one Vitest process. Per-package `pnpm test` runs only that one project via `vitest run --project <name>`.

Tech-Spec sections this touches: §6 (phase plan; tests gate L0–L3 dogfooding maturity, so the test runner has to work cleanly per-package and at the root from Phase 0 forward).

## Decision

Ratify the existing Vitest workspace layout: four package-local projects (`shared`, `skill`, `extension`, `webview`) plus one top-level `integration` project, composed via `vitest.workspace.ts`. The shape is load-bearing for four reasons:

- **Per-package projects mean each package's test command is identical.** `pnpm test` inside any of `packages/{shared,skill,extension,webview}/` works in isolation without workspace-aware tooling. This matters for the autonomous workflow described in ADR-0007 — Ralph iterations may run `pnpm test` from inside a package, and that should not require the parent workspace to be aware.
- **Per-package `vitest.config.ts` files are the seam for future per-environment splits.** The extension and webview run in different runtime environments in real use (Node host vs browser webview); at test time both are `environment: 'node'` today. A single root config could not express the per-package context the way these can grow into (e.g. swapping `webview`'s environment to `jsdom` when its components grow).
- **Integration tests are physically separate.** They live under `tests/integration/` because they will spawn a real skill subprocess and exercise the MCP transport. Mixing them with per-package unit tests would conflate tiers; keeping them as their own project lets us tune `testTimeout` (already at 30s) and any future `setupFiles` in isolation, without bleeding those settings into unit tests.
- **Workspace-aggregated `pnpm test` runs all five projects in one Vitest process.** This is faster than five sequential `pnpm -r run test` invocations and produces one coherent failure summary at the root. The trade-off — a flake in the integration project can take longer to surface — is mitigated by the explicit `testTimeout: 30_000` on the integration project.

The decision is not "use Vitest" (that was implicit in the Phase 0 stack choice). The decision is the **shape of the workspace**: four package-local projects plus one top-level integration project, composed via `defineWorkspace`.

## Consequences

**What this enables:**

- A future contributor can add a fifth package and only needs to add one new `vitest.config.ts` plus one line to `vitest.workspace.ts`. No root-level reshuffle.
- The autonomous workflow can run `pnpm test` from inside a package without depending on workspace context — a property ADR-0007's iteration model relies on.
- Per-package config splits (e.g. switching `webview` to `jsdom` later) are local edits that do not affect any other package's test runner.
- The integration project can grow `setupFiles` for spawning the skill subprocess without affecting unit-test startup time.

**What this forecloses / costs:**

- Five config files instead of one. Minor maintenance overhead; offset by the per-package isolation above.
- A flake in the integration project is hidden inside the aggregated `pnpm test` output until that project completes. Mitigated by the 30-second test timeout and (eventually) by surfacing the integration project as its own CI step if integration flake becomes a recurring problem.
- Switching to a single root config later would be a breaking change to the Ralph iteration contract (per-package `pnpm test` would stop working without duplicating globs into a separate per-package config). That is an explicit non-goal of this ADR.

**What becomes a future ADR's problem:**

- If `webview` ever needs `environment: 'jsdom'` or a custom DOM polyfill, that's a one-file change inside `packages/webview/vitest.config.ts`; no ADR needed unless the change ripples (e.g. a shared test setup module across packages).
- If integration flake forces a CI-job split (integration as a separate pipeline step from unit tests), that's a CI workflow ADR, not a test-infrastructure ADR — the workspace layout already supports it via `vitest run --project integration`.
- A future "browser-mode" Vitest split for the webview (Vitest 3+ browser mode) would warrant a follow-up ADR; the current layout does not preclude it.

## Alternatives considered

- **Single root `vitest.config.ts` with `include` globs covering every package's `tests/**`.** Rejected because (a) per-package `pnpm test` would either not work or would require a duplicate config inside each package that re-states the globs, breaking the Ralph iteration contract; (b) the integration project's `testTimeout: 30_000` would either bleed into unit tests or require an exception path inside the root config; (c) future per-environment splits (jsdom for webview, browser-mode Vitest, custom setup files for integration) are harder to add to a flat config than to a per-project workspace.
- **`pnpm -r run test` with one `vitest.config.ts` per package and no workspace file.** Rejected because the root `pnpm test` would then spawn five Vitest processes serially, slower than one aggregated run, with five separate failure summaries instead of one coherent root summary. The workspace file is what gives us "one process, five projects, one summary."
- **Jest instead of Vitest.** Out of scope for this ADR; the Phase 0 stack choice is recorded implicitly in `tech-spec.md` §6 (Phase 0 mentions "Repo bootstrap (TS strict, Vitest, ESLint with the AgentRunner-only rule pre-added)"). Not revisited here.

## References

- `vitest.workspace.ts` — the workspace composition.
- `packages/shared/vitest.config.ts`, `packages/skill/vitest.config.ts`, `packages/extension/vitest.config.ts`, `packages/webview/vitest.config.ts`, `tests/integration/vitest.config.ts` — the five per-project configs this ADR ratifies.
- `package.json:15` (`"test": "vitest run --passWithNoTests"`) — the root test script that consumes the workspace.
- `docs/qa/qa-report-001.md` — finding **F-VITEST-LAYOUT-UNRECORDED (minor)**; the QA observation this ADR closes.
- ADR-0006 (`docs/adr/0006-agent-configuration-setup.md`) — the agent-configuration bootstrap alongside which this layout was set up; this ADR fills the gap that ADR-0006's "decisions made during the bootstrap" section did not cover.
- ADR-0007 (`docs/adr/0007-autonomous-workflow.md`) — the Ralph iteration model that depends on per-package `pnpm test` working in isolation.
- `tech-spec.md` §6 — phase plan; tests gate L0–L3 dogfooding maturity.
- [Vitest workspace documentation](https://vitest.dev/guide/workspace) — `defineWorkspace` semantics.
