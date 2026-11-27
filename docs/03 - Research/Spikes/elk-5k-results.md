# Risk-C spike — ELK layout time at 5k-node and L0 scales

> **Task:** `p2-t13` (`automation/tasks/phase-2-static-graph/tasks.json`)
> **Bench script:** `scripts/spike-elk-bench.ts`
> **Harness:** `scripts/spike-elk-5k.ts`, fixture at `.intentgraph/spike-elk-5k.json`
> **Date:** 2026-05-04
> **Status:** advisory recommendation — phase-6 task decomposition makes the binding call

## Posture-correction note

The original `p2-t13` task notes (in `automation/tasks/phase-2-static-graph/tasks.json`, written 2026-04-27) framed the recommendation against tech-spec §3.5 line 142's stated long-term posture, "ELK in a dedicated WebWorker." That framing is **stale**: by the time this spike ran, the L0 implementation had landed `runLayout` on the **main thread**, not in a worker (commit `17e5065`, "p2-t09 follow-up: run elk on main thread"). The header comment on `packages/webview/src/graph/layout/index.ts` records the reason — `elkjs` ships its own GWT-compiled worker that fails to construct when nested inside an ESM module worker (`_Worker is not a constructor`); the dedicated wrapper at `packages/webview/src/graph/layout/elk.worker.ts` is preserved as a phase-6 entry point but is unused at L0.

The original task notes also asked the spike to choose between three options:
1. keep "the incremental local placement strategy (§3.5 line 142)";
2. escalate to server-side ELK for graphs >3k nodes;
3. add the Sigma.js overview escape hatch sooner.

That trade was written assuming a working dedicated worker, where "incremental local placement" meant ELK in a worker performing one-shot startup layout. The actual current trade is between four positions, not three. This document is reframed against the four-option trade. The original §3.5 long-term wording ("ELK in a dedicated WebWorker") is preserved as the destination; what changes is that fixing the worker is now in scope as its own option, distinct from "keep current posture."

The recommendation in §6 is **advisory**. tech-spec §6 phase 6 (line 466) names "graph >3k nodes → server-side ELK" as a phase-6 question; this spike informs that decision but does not bind it. Phase 6 task decomposition is the binding gate.

The spike does **not** measure rendering cost. Risk-C in tech-spec §7 covers both layout cost (this spike) and rendering cost (React Flow's per-node reconciliation cost on N DOM nodes); the rendering half is out of scope here and is a separate spike. A recommendation to keep main-thread layout at L1/L2 scale must be paired with a render-side pass before phase-6 hardening; this document does not produce that pass.

## Methodology

- **Bench:** `pnpm tsx scripts/spike-elk-bench.ts --runs 20 --warmup 3`. The script imports `runLayout` from `packages/webview/src/graph/layout/index.ts` directly — the production entry point — so the measurement reflects ELK time as the webview actually invokes it. No worker wrapping; `getElk()` constructs the ELK singleton on first call and reuses it across runs.
- **Sample size:** N=20 timed runs per graph, with 3 warmup runs to stabilize the elkjs constructor and JIT before measurement. Sample size confirmed with the human; 20 is enough to put a stable band on p50 and p95, with p99 carrying more uncertainty than p50 by construction.
- **Two graphs measured for symmetric reporting:**
  - **`spike-5k`** — 5,000 nodes / 15,000 edges, the synthesized harness from `spike-elk-5k.ts` (Risk-C scale per tech-spec §7-C).
  - **`dogfood-l0`** — 695 nodes / 536 edges, the L0 dogfood seed (`.intentgraph/graph.json`), produced by `pnpm tsx scripts/seed-dev-db.ts` on the same checkout. Node sizing is normalized to 180×80 (matching the spike harness's uniform sizing) so the two runs measure ELK behavior, not React Flow's kind-aware sizing layer.
- **Wall-clock measurement** via `process.hrtime.bigint()` around `runLayout()`. Each sample is end-to-end ELK time including the result transform back to `LayoutPosition[]`.
- **Layout config:** the production defaults from `packages/webview/src/graph/layout/index.ts` — `elk.algorithm=layered`, `elk.direction=DOWN`, node spacing 64, between-layer spacing 84, padding 30, port constraints `FIXED_ORDER`. No overrides.

### Hardware

| Field | Value |
|---|---|
| Workstation | Alienware m15 R3 |
| CPU | Intel Core i9-10980HK, 8 cores / 16 threads, 2.4 GHz base / 3.1 GHz reported by WMIC |
| RAM | 32 GB |
| OS | Windows 11 Enterprise (build 10.0.22631) |
| Node | (system Node, see `node --version`) |
| pnpm | corepack-managed, see `pnpm --version` |
| Foreground | bench process running unchallenged; no other heavy IDE / browser load during measurement |

This is a developer laptop, not a server. Tech-spec line 444 names "a typical dev machine" as the L0 acceptance reference; this hardware is on the higher end of what most contributors will use, so the measured cost is a **lower bound** on what slower laptops will see.

## Results

### Spike-5k (5,000 nodes / 15,000 edges)

| Stat | ms | seconds |
|---|---:|---:|
| min | 125,939 | 125.9 |
| p50 | 155,281 | 155.3 |
| mean | 148,948 | 148.9 |
| p95 | 167,953 | 168.0 |
| p99 | 172,345 | 172.3 |
| max | 173,443 | 173.4 |

**All 20 timed samples (ms), in run order:**

```
159311, 157264, 155888, 163063, 156177, 161949, 167664, 164049,
156451, 154674, 137991, 125939, 142067, 173443, 129085, 126087,
131228, 146975, 137755, 131898
```

Variance is wide for a deterministic graph algorithm: peak-to-trough range is **47.5 s** (~38% of mean). The distribution is bimodal — a higher cluster around 160 s ± 5 s in the early runs, a lower cluster around 130 s ± 10 s in later runs — with the warmup count (3) likely insufficient for a graph of this size. A larger warmup or longer run might compress the band, but the floor (~126 s) is already three orders of magnitude past the 16.7 ms frame budget that defines whether a UI thread stutters, so additional precision changes nothing operationally.

### Dogfood-l0 (695 nodes / 536 edges)

| Stat | ms |
|---:|---:|
| min | 153.7 |
| p50 | 172.7 |
| mean | 177.6 |
| p95 | 194.4 |
| p99 | 216.3 |
| max | 221.7 |

**All 20 timed samples (ms), in run order:**

```
184.9, 221.7, 192.9, 191.8, 186.8, 187.5, 176.5, 165.6,
170.3, 172.5, 172.8, 171.2, 165.8, 180.3, 153.7, 172.0,
170.5, 188.1, 162.3, 165.2
```

Variance is tight: peak-to-trough is 68 ms (~38%, similar relative spread to spike-5k but in a vastly smaller absolute band). p99 at 216 ms is comfortably under one second.

### Summary at-a-glance

| Graph | Nodes | Edges | p50 | p95 | p99 | Mean |
|---|---:|---:|---:|---:|---:|---:|
| spike-5k | 5,000 | 15,000 | **155.3 s** | **168.0 s** | **172.3 s** | 148.9 s |
| dogfood-l0 | 695 | 536 | **172.7 ms** | **194.4 ms** | **216.3 ms** | 177.6 ms |

Two orders of magnitude in node count produces approximately three orders of magnitude in layout time (~177 ms → ~155 s, a ~875× increase for ~7.2× more nodes / ~28× more edges). This is steeper than O(n²) — closer to between O(n²·³) and O(n²·⁵) for layered ELK on this edge density, consistent with what the elkjs literature suggests when port constraints and edge routing both engage.

## Interpretation against the dogfooding ladder

| Gate | Graph size (rough) | p50 ms | Verdict on main-thread ELK |
|---|---|---:|---|
| L0 (today, ~700 nodes) | observed | 173 ms | **acceptable** — one-shot startup layout. UI is unresponsive for ~200 ms, well below the 1 s threshold where users perceive a hang. |
| L1 (Phase 3, ~1–2k nodes) | extrapolated | ~700 ms – 4 s | **borderline** — the upper end exceeds the 1 s "this is slow" threshold. Re-layout on intent-edit (the Phase 3 bidirectional sync regenerates positions for affected nodes) would compound this if not localized. |
| L2 (Phase 4, ~3–4k nodes) | extrapolated | ~30 s – 90 s | **unacceptable** — main-thread ELK at this scale blocks the editor for tens of seconds. Drift inbox interactions become impossible to drive. |
| L3 (Phase 5, ~5k+ nodes) | observed | 155 s | **unacceptable by an order of magnitude** — the editor is frozen for over two minutes per layout. |

The L0 measurement validates the current main-thread posture for *L0 only*. L1 is borderline. L2 and beyond are off the table without a substrate change.

## Cross-cutting findings (independent of which option lands)

1. **The wide variance on the 5k harness is itself a finding.** A 38% peak-to-trough range in 20 deterministic-algorithm runs implies meaningful interference from JIT, GC, and OS scheduler at this scale. Whatever option phase 6 picks, the chosen substrate must tolerate this variance — a "sometimes 130 s, sometimes 170 s" cost is harder for downstream code (timeouts, progress indicators, Inngest step deadlines) than a smooth distribution. The dedicated worker (Option B) likely reduces this by isolating GC pressure from the main thread; server-side ELK (Option C) eliminates it entirely from the client.
2. **The L0 numbers are clean** (variance <40 ms absolute, p99 < 220 ms). Whatever option lands, it should not regress L0 below today's observed cost. Specifically, switching to server-side layout for small graphs adds an MCP round trip; on a graph this size that round trip would cost as much as the layout itself.
3. **Layout time scales super-quadratically** in nodes. A future graph in the 1500–2000 node range — plausible by L1 — will be on the order of seconds, not hundreds of milliseconds. The L0→L1 transition is where the recommendation begins to bite, not L2.
4. **The spike does not measure render cost.** React Flow's per-node React reconciliation against 5k DOM nodes is a separate substrate cost not exercised here. A render-side spike is required before any L2 commitment is binding; it is out of scope of `p2-t13`.

## Options and trade

| Option | What it is | Pros | Cons | When it bites |
|---|---|---|---|---|
| **A. Main-thread ELK** *(current posture)* | What ships at L0. ELK runs on the main thread; the wrapper worker exists but is unused. | Simple. No build complexity. No IPC. L0 cost is acceptable (~170 ms p50). | UI thread blocks during layout. Re-layouts during edit are felt as stutters once the graph crosses ~1k nodes. | L1 borderline; L2+ unacceptable. |
| **B. Fix the dedicated worker** *(tech-spec §3.5's stated intent)* | Restore the original §3.5 plan: ELK in a worker, communicating via `postMessage`. Requires resolving the elkjs nested-worker construction issue (likely by passing a real `workerFactory` or by hand-bundling the elk-worker as a top-level worker). | Off-thread layout. UI stays responsive even at L2 scale. Aligns with tech-spec §3.5 line 142. | Engineering cost: nontrivial — the GWT-compiled worker construction is the bug `17e5065` was reverting. Worth measuring whether the off-thread cost still scales super-quadratically (it should, but the user-felt cost is different). | L1 / L2; the cost of *not* doing this is that re-layouts during edit feel unresponsive. |
| **C. Server-side ELK** *(tech-spec §6 phase 6 foreshadow)* | Move ELK to the skill subprocess; webview receives positions via MCP and renders only. | UI thread is never blocked. Layout cost is paid once per request, off the user's machine. Skill can cache or incrementalize across sessions. | Adds an MCP round trip per layout (cost ~15–50 ms typical). Makes layout an asynchronous data dependency rather than a render-time call. Architectural complexity. Overkill for L0/L1. | L2+; the cost of *not* doing this is that even an off-thread worker can't keep up with multi-thousand-node layouts on slow machines. |
| **D. Sigma.js overview escape hatch** | Render-side optimization, not layout-side. Sigma.js renders to canvas, avoiding React Flow's per-node reconciliation. | Solves the *render* half of Risk-C. Doesn't help with layout cost. | Different problem from this spike. Useful as an L3 escape hatch when DOM-node count, not layout time, is the bottleneck. | Out of scope; flagged for the render-side spike. |

## Recommendation (advisory; phase-6 task decomposition makes the binding call)

**Stay on Option A (main-thread ELK) through L0 and Phase 3 (L1 build-out). Begin Option B (dedicated worker) work no later than the start of Phase 4, before L2 graph sizes (3k+ nodes) become routine.**

> **Render-side scope reminder.** This recommendation only covers ELK layout time. React Flow's per-node DOM reconciliation cost on N nodes is **not measured here** and is a separate Risk-C exposure. Any Phase 4 commitment to L2 scale must be paired with a render-side spike before it binds; this recommendation is a layout-side input only.

Concretely:

1. **Now (L0 already shipping):** keep main-thread ELK. The L0 numbers (p50 173 ms, p99 216 ms) are within budget for one-shot startup layout. No change needed.
2. **Phase 3 (L1, MCP server + bidirectional sync):** stay on main thread but **measure L1 layout cost** as part of the L1 acceptance gate. The Phase 3 task list should include a dogfood-graph re-bench at the end of phase 3, before the L1 sign-off, with the same `spike-elk-bench.ts --only dogfood --runs 20` command. The numbers from this run become a baseline. **Explicit L1 escalation threshold: if p95 layout time on the L1 dogfood graph exceeds 1.0 s, or if p99 exceeds 1.5 s, escalate Option B (dedicated worker) into Phase 3 in flight rather than waiting for Phase 4.** The 1 s p95 threshold is the empirical "this feels slow" boundary from the human-computer interaction literature (Nielsen 1993; reaffirmed by Google's RAIL model); the 1.5 s p99 threshold is its tail-latency analog so a small fraction of slow layouts doesn't poison the user's calibration of the tool's responsiveness. Both thresholds apply to the L1 graph as it actually exists at sign-off, not to extrapolated projections.
3. **Phase 4 start (L2 substrate begins):** **fix the dedicated worker.** The elkjs nested-worker construction issue is solvable (most plausibly by replacing elkjs's bundled worker with a hand-bundled top-level worker that imports the same algorithm code). This is a discrete piece of work with a clear acceptance test (the existing `runLayout` API returns the same positions, but `requestAnimationFrame` is not blocked during layout).

   **Why Phase 4 is the named deadline, not Phase 3 or Phase 5:** Phase 4 is the first phase whose dogfooding gate (L2, per CLAUDE.md and tech-spec line 451) introduces *interactive* flows that compete with layout for main-thread time. Drift inbox interactions (Y/N/V keybindings on inbox rows), AgentRunner-routed proposals (the user accepts or rejects a patch), and monitor-LLM verdicts (chevron-overlay, Tier-1 escalation per ADR-0021) all happen against a backdrop where the graph may re-layout because intents or constraints just changed. If main-thread ELK still owns the layout at this point, every drift acceptance during a re-layout window stutters the editor; the L2 acceptance criterion ("≥80% drift auto-detected, ≥50% suggestions accepted as-is") cannot be met under that latency profile. Phase 3 lacks this competition (its surfaces are markdown sync and TipTap node-text editing, both of which are tolerant to short main-thread blocks); Phase 5 is too late (L2's dogfood gate runs against the worker's absence). Phase 4's start is therefore the binding boundary.
4. **Phase 6 (hardening, L3+):** revisit Option C (server-side ELK) **only if** Phase 4's dedicated worker proves insufficient at the project's actual L3 graph size. The empirical question phase 6 has to answer is: "with the worker, what is p95 layout time on real teams' graphs at L3 scale?" — not the synthesized 5k spike. Server-side ELK adds enough architectural complexity (MCP round trip, async layout dependency) that it should be deferred until measured need is in evidence.
5. **Option D (Sigma.js)** stays in the deck as a render-side escape hatch and is **not** decided by this spike. The render-side spike is a separate task; flag it as a Phase 4 candidate so render and layout costs are evaluated together before any L2 binding decision.

### Why not "fix the worker now"

Three reasons:
- The L0 cost is already acceptable; Option B's user-perceived gain is currently small.
- The elkjs nested-worker fix is engineering work that would compete with Phase 3's MCP server build-out, which has higher ROI for the dogfooding ladder.
- Phase 4 needs the worker for a concrete reason (interactive responsiveness during L2 drift events), so the fix has a natural home and a binding deadline rather than being speculative.

### Why not "go straight to server-side ELK"

Two reasons:
- Server-side ELK adds an MCP round trip per layout. On the L0 dogfood graph, that round trip costs as much as the layout itself; the user-perceived experience would regress.
- Server-side layout is binding architecture (the webview becomes a position consumer rather than a layout owner). Phase-6 is the right gate for that level of commitment, with worker performance numbers in hand.

## Sign-off

This document is the deliverable of `p2-t13`. Per the task definition, this is a **human checkpoint** — the recommendation is advisory, and acceptance is required before the conclusions become part of the project's planning record.

- Sign-off: ____________________  Date: __________
- Notes from sign-off: __________

After sign-off, the `produced_by` artifacts (this document plus `scripts/spike-elk-bench.ts`) commit to `main` as one commit. The phase-3 task list amendment (re-bench at L1 acceptance) and the phase-4 task list draft (fix the worker; render-side spike) capture the recommendation's downstream consequences; both are out of scope for `p2-t13` and land in their own task-list authoring tasks.

## Files referenced

- `scripts/spike-elk-bench.ts` — bench script (this task added it)
- `scripts/spike-elk-5k.ts` — synthesizer (p2-t12)
- `scripts/spike-elk-5k-runner.ts` — single-run runner (p2-t12)
- `packages/webview/src/graph/layout/index.ts` — production `runLayout` entry point (the bench imports this directly)
- `packages/webview/src/graph/layout/elk.worker.ts` — preserved phase-6 worker entry point, currently unused
- `.intentgraph/spike-elk-5k.json` — spike fixture (5,000 nodes, 15,000 edges, seed=42)
- `.intentgraph/graph.json` — L0 dogfood seed (695 nodes, 536 edges) produced by `scripts/seed-dev-db.ts`
- `automation/tasks/phase-2-static-graph/tasks.json` — `p2-t13` task definition
- `tech-spec.md:141–142` — original §3.5 ELK-in-WebWorker posture
- `tech-spec.md:466` — phase-6 server-side-ELK foreshadow
- `tech-spec.md:517` — Risk-C entry in §7
