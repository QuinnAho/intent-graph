# ADR 0016 — Verifier interface: location, scheduling, and registration

## Status

Accepted 2026-04-27.

## Context

Phase-2 task `p2-t07` lands the Coverage Verifier, which is the first concrete `Verifier` implementation against the contract in tech-spec §3.4 (lines 127-138). That interface is load-bearing for every later verifier — typecheck (phase 4) and the formal/example/metamorphic verifiers (phases 4-5) will inherit it. Tech-spec §3.4 pins the type shape:

```ts
interface Verifier {
  id: string;
  obligationKinds: ('property'|'typecheck'|'formal'|'example'|'metamorphic')[];
  capabilities: { canShrink: boolean; canExplain: boolean; isDeterministic: boolean };
  costClass: 'sub-ms' | 'ms' | 's' | 'minutes';
  run(o: Obligation, ctx: VerifierContext): Promise<VerifierResult>;
}
```

…and §3.4 line 138 pins the scheduling rule: "user-interactive paths can never block on `s`/`minutes` verifiers — those run in background and post results to graph asynchronously." Tech-spec §4.3 (lines 221-239) pins the `obligation` table the verifier writes back to (status transitions `pending → verified | failed | rejected`, plus `last_run_at`, plus `counterexample_node_id`). Tech-spec §5.4 (lines 406-413) pins the MCP surface: `verify.run`, `verify.register` (third-party plugins), `verify.shrink`, `verify.propose_property`.

What §3.4 does **not** specify, and what `p2-t07` cannot land cleanly without:

1. **File location.** Where the interface lives, where built-ins live, and how they are discovered.
2. **Cost-class scheduler hookup.** The shape of the dispatcher between sub-ms/ms (sync) and s/minutes (Inngest-backed) verifiers, and where async results post back.
3. **Registration semantics.** How built-ins announce themselves at skill bootstrap, and how third-party MCP plugins register against `verify.run`.

Each of these is a one-way door for the next four verifiers, so we pin them now rather than letting `p2-t07`'s scope_files implicitly answer them.

## Decision

### 1. File location — interface in `packages/shared`, built-ins in skill, scheduler in skill

- **`Verifier`, `Obligation`, `VerifierContext`, `VerifierResult` types live in `packages/shared/src/verifier/`** (new directory). They are exported from the shared package as part of its public surface.
- **First-party built-in implementations live in `packages/skill/src/verifiers/builtin/<name>.ts`** (matching `p2-t07`'s scope_files for the Coverage Verifier).
- **The scheduler lives in `packages/skill/src/verifiers/scheduler.ts`** and is the only call site that imports built-ins.
- **A registry barrel `packages/skill/src/verifiers/registry.ts`** imports each built-in module for its side-effect registration (see (3) below) and exports a typed lookup `getVerifier(id): Verifier | undefined`.

The load-bearing call here is putting the **interface in `@intentgraph/shared`, not in `packages/skill`.** Tech-spec §3.4 line 128 says "in-process for first-party, MCP for third-party." A third-party MCP plugin that wants to speak `Verifier` needs to import the type without dragging skill internals (better-sqlite3, tree-sitter bindings, the AgentRunner chokepoint). Putting the interface in `@intentgraph/shared` — already the home of cross-package Zod schemas per ADR-0002's storage-port discipline — gives plugin authors a stable, narrow type surface without coupling them to the skill subprocess. The cost is that `@intentgraph/shared` grows a `verifier/` namespace, which is acceptable: it is exactly the kind of cross-process contract `shared` exists to host.

### 2. Cost-class scheduler — free function for sync, Inngest function wrap for async, event-log for post-back

- **`runVerifier(o: Obligation, ctx: VerifierContext): Promise<VerifierResult>`** is a free function exported from `packages/skill/src/verifiers/scheduler.ts`. It looks up the verifier by `o.kind` (or by an explicit `verifier_id`), inspects `costClass`, and:
  - For `sub-ms` and `ms`: invokes `verifier.run(o, ctx)` directly in-process and returns the result. Caller awaits.
  - For `s` and `minutes`: enqueues an Inngest event `verify.run` (already declared in tech-spec §3.3 line 122) carrying `{ obligation_id, verifier_id, scope }` and returns immediately with a `pending` sentinel result. The Inngest function wraps `verifier.run` in a single `step.run` so the trace_event row is written through the existing chokepoint per ADR-0004.
- **Async post-back goes through `event_log`, not a direct write to the `obligation` table.** The Inngest function appends an `obligation.verified` (or `.failed`) event to the hash-chained `event_log` (per ADR-0002), and the existing projection logic updates the `obligation` row's `status`, `last_run_at`, and `counterexample_node_id`. This keeps the audit trail intact: a failed s-class verification is replayable from `event_log` alone, the same way every other state mutation is.

The free-function-plus-Inngest-wrap shape (rather than a `VerifierScheduler` class with internal queues) is deliberate. Inngest is already the queue per ADR-0004; introducing a second per-cost-class queue inside the skill would be the second graph model the project's hard rules forbid.

### 3. Registration — module-load side-effect for built-ins, no `verifier.register` mutation tool, MCP delegation for third-party

- **Built-ins register at module load.** Each `packages/skill/src/verifiers/builtin/<name>.ts` exports a const `verifier: Verifier` and calls `registry.register(verifier)` at module top level. `registry.ts` imports each built-in once; the skill bootstrap imports `registry.ts` once. This is the standard ESM side-effect pattern and makes the set of built-ins discoverable by `grep -r "registry.register" packages/skill/src/verifiers/builtin`.
- **No `verifier.register` mutation tool.** Tech-spec §5.4 lists `verify.register` as a tool for third-party MCP plugins, but we read this as **declarative manifest registration at MCP plugin handshake**, not a runtime mutation a plugin can call to inject arbitrary verifier objects. Specifically: a third-party MCP plugin announces its supported verifier IDs and obligation kinds in its MCP tool manifest at session start; the skill records these in an in-memory third-party registry; `verify.run` with a third-party `verifier_id` delegates the call out over MCP rather than running an in-process `verifier.run`.
- **`verify.run` is the single uniform tool surface.** First-party verifiers and third-party verifiers are both invoked through `verify.run`; the scheduler decides locally vs. MCP-delegated based on the registry entry. The other §5.4 tools (`verify.shrink`, `verify.propose_property`) follow the same delegation pattern.

This gives third-party plugins exactly one extension point (the MCP manifest) and keeps the skill in control of which costClass an external verifier claims to be — the manifest declares it, and the scheduler enforces the user-interactive-blocking rule from §3.4 line 138 against it the same way it does for built-ins.

## Consequences

**What this enables:**

- `p2-t07` can land the Coverage Verifier as a single file under `packages/skill/src/verifiers/builtin/coverage.ts` against a stable type surface, without inventing scheduling or registration in the same patch.
- The next four verifiers (typecheck, formal, example, metamorphic) drop into `builtin/` with the same shape; the scheduler does not change.
- s-class and minutes-class verifiers get durability and concurrency control for free from the existing Inngest infrastructure (ADR-0004), including the `concurrency: { key: "event.data.intentNodeId", limit: 1 }` policy from tech-spec §3.3 line 125.
- The audit trail for verification outcomes is unified with every other state mutation in the system: `event_log` is the only writer of truth (ADR-0002).
- Third-party verifier authors get a clean, narrow type import (`@intentgraph/shared`) and a single uniform invocation point (`verify.run`).

**What this forecloses (costs to name explicitly):**

- **Plugins must depend on `@intentgraph/shared`.** Putting the interface there means the shared package is now part of the plugin SDK contract, not just an internal monorepo convenience. Future breaking changes to `Verifier` or `Obligation` types are now public-API-breaking and require an ADR.
- **First s-class verifier run pays Inngest cold-start latency.** Wrapping s/minutes verifiers in an Inngest function means the first invocation in a cold worker pays the function-boot cost (tens to low hundreds of ms in dev, more in some cloud configurations). This is acceptable because §3.4 already says s-class verifiers cannot block user-interactive paths; the latency lives in the background lane by design.
- **No runtime `verifier.register` mutation.** Plugins cannot inject a verifier mid-session; they declare at handshake. This forecloses dynamic verifier authoring inside a plugin (e.g., a plugin that LLM-generates a new verifier per obligation) without an explicit follow-up ADR. Worth the trade for the integrity guarantee that the skill always knows the full verifier set up front.
- **Module-load side-effect registration is order-sensitive.** Two built-ins claiming the same `id` would silently conflict at import time. Mitigation: `registry.register` throws on duplicate ID; this is enforced by a unit test in `p2-t07`'s scope.
- **The `verifier/` namespace in `@intentgraph/shared`** is now a load-bearing public surface. ADR-NNNN+1's problem: the first time a verifier needs a richer `VerifierContext` (e.g., access to retrieval results or trace metadata), we will have to widen the type without breaking plugins.

## Alternatives considered

- **Interface in `packages/skill/src/verifiers/Verifier.ts` (rejected).** Puts the type next to the implementations — convenient for the skill, hostile to third-party MCP plugins, which would have to either copy the type or take a transitive dependency on the skill subprocess. Fails the "in-process for first-party, MCP for third-party" parity goal in §3.4 line 128.
- **`VerifierScheduler` class with per-cost-class queues (rejected).** Reproduces Inngest inside the skill. Violates the "no second graph model" / no-second-orchestrator hard rule that ADR-0004 carries. The free-function-plus-Inngest-wrap shape uses one queue, the one we already have.
- **Direct write to the `obligation` table from the Inngest function (rejected).** Bypasses `event_log`, breaks replayability, and drifts the verification path away from every other state mutation in the system. ADR-0002 is explicit: current-state tables are a projection of `event_log`. Verification outcomes are state mutations like any other.
- **Runtime `verifier.register` MCP tool that accepts a serialized verifier (rejected).** Tempting because §5.4 names the tool, but interpreted literally it would let plugins inject arbitrary `costClass` claims at runtime, defeating the scheduler's enforcement of the user-interactive-blocking rule. Manifest-at-handshake is the same expressivity for legitimate plugins with a tighter trust boundary.
- **Explicit `registerBuiltins()` call at skill bootstrap instead of module-load side-effects (rejected, but narrowly).** More explicit and easier to test in isolation, at the cost of a maintenance burden: every new built-in requires a second edit to the bootstrap file. The duplicate-ID guard at registry level gives us most of the safety; a unit test gives us the rest. We can revisit if the side-effect pattern proves brittle.

## References

- tech-spec.md §3.3 (orchestration runtime, Inngest functions including `verify.run`)
- tech-spec.md §3.4 (verification backplane — interface and scheduling rule)
- tech-spec.md §4.3 (obligation schema)
- tech-spec.md §5.4 (MCP verification tool surface)
- ADR-0002 (relational graph store as substrate; `event_log` as canonical writer)
- ADR-0004 (agent orchestration; Inngest as the durable runner; no second graph model)

ADR draft committed at `docs/adr/0016-verifier-interface.md` with status `Proposed`. Change status to `Accepted` after review.
