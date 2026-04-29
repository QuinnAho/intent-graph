// The Verifier interface as a cross-process contract. Lives in
// `@intentgraph/shared` (not in packages/skill) per ADR-0016 §1 so third-party
// MCP plugins can import the type without dragging skill internals
// (better-sqlite3, tree-sitter bindings, the AgentRunner chokepoint).
//
// Tech-Spec §3.4 lines 127–138 pin the interface shape. ADR-0016 pins the
// file location (this file), the cost-class scheduling rule, and the
// registration semantics (built-ins side-effect-register at module load;
// third-party plugins declare via MCP manifest at handshake).
//
// Public surface for plugin authors:
//   - `Verifier` — the contract every verifier implements.
//   - `Obligation` — the row payload the verifier inspects.
//   - `VerifierContext` — the read-only environment passed at run time.
//   - `VerifierResult` — the return shape, including async-pending sentinel.
//   - `VerifierCostClass`, `VerifierCapabilities` — type aliases re-exported
//     for plugin authors who want to declare them positionally.
//
// Anything beyond this set is skill-internal and lives under
// `packages/skill/src/verifiers/`.

import type { ObligationKind, ObligationStatus } from '../schemas/obligation.js';

/** Tech-Spec §3.4 line 134: cost class drives the scheduler's sync vs async dispatch. */
export type VerifierCostClass = 'sub-ms' | 'ms' | 's' | 'minutes';

/**
 * Static capability declaration. Used by the scheduler to decide whether to
 * route an obligation through this verifier without round-tripping. ADR-0016 §1
 * explicitly forbids dynamic capability negotiation — the values here MUST be
 * stable across the verifier's lifetime.
 */
export interface VerifierCapabilities {
  /** True if the verifier can produce a minimized counterexample on failure. */
  readonly canShrink: boolean;
  /** True if the verifier can produce a human-readable explanation on failure. */
  readonly canExplain: boolean;
  /** True if `run(o, ctx)` is deterministic given the same (o, ctx). */
  readonly isDeterministic: boolean;
}

/**
 * The minimal obligation shape verifier authors consume. This is a structural
 * subset of `ObligationRow` from `../schemas/obligation.ts` — the shared
 * surface deliberately omits storage-internal fields (filters_passed,
 * counterexample_node_id) so plugin authors get a narrow type.
 *
 * Skill-internal callers wanting the full row should use `ObligationRow`
 * directly; the scheduler narrows it to `Obligation` before calling
 * `verifier.run`.
 */
export interface Obligation {
  readonly id: string;
  readonly intent_node_id: string;
  readonly kind: ObligationKind;
  readonly test_code: string;
  readonly rationale: string | null;
}

/**
 * Read-only environment threaded into every `verifier.run` invocation. The
 * `Coverage` verifier needs graph access (count of `realizes`-in edges per
 * intent); future verifiers may need more (retrieval results, trace metadata).
 * The interface stays narrow to keep the plugin contract stable; widening
 * `VerifierContext` is an ADR-level call per ADR-0016's "What this forecloses"
 * section.
 *
 * `getNodes()` and `getEdges()` are deliberately read-only and return iterables
 * rather than arrays — large graphs should be streamable through the verifier
 * without materializing every row.
 */
export interface VerifierContext {
  /** Stable id for this run; threaded into trace_event for audit. */
  readonly runId: string;
  /** Iterate the graph's nodes; filter by kind for efficient lookups. */
  getNodes(filter?: { kind?: string }): Iterable<VerifierContextNode>;
  /** Iterate the graph's edges; filter by kind for efficient lookups. */
  getEdges(filter?: { kind?: string; src?: string; dst?: string }): Iterable<VerifierContextEdge>;
}

/** Read-only node shape exposed to verifier authors. Mirror of `node` row's user-facing columns. */
export interface VerifierContextNode {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly body: string; // JSON-encoded; verifier can JSON.parse if needed
  readonly parentId: string | null;
}

/** Read-only edge shape exposed to verifier authors. */
export interface VerifierContextEdge {
  readonly id: string;
  readonly src: string;
  readonly dst: string;
  readonly kind: string;
  readonly weight: number;
  /** Optional JSON-encoded body string. Verifier may JSON.parse if needed. */
  readonly body?: string | null;
}

/**
 * The verifier result envelope. Tech-Spec §3.4 line 138 + ADR-0016 §2 require
 * that s/minutes verifiers return a `pending` sentinel synchronously and post
 * the actual result back through `event_log` when the Inngest function
 * completes. The `status: 'pending'` variant carries no findings; readers
 * MUST inspect `status` before consuming `findings`.
 */
export type VerifierResult =
  | {
      readonly status: 'pending';
      readonly verifierId: string;
      readonly obligationId: string;
      readonly enqueuedAt: number;
    }
  | {
      readonly status: ObligationStatus & ('verified' | 'failed' | 'rejected');
      readonly verifierId: string;
      readonly obligationId: string;
      readonly findings: ReadonlyArray<VerifierFinding>;
      readonly counterexample?: VerifierCounterexample;
      readonly latencyMs: number;
    };

/** A single non-fatal finding the verifier surfaced. Multiple findings allowed per run. */
export interface VerifierFinding {
  readonly nodeId: string;
  readonly message: string;
  /**
   * Severity is purely informational at the type layer — the obligation's
   * overall `status` is what gates downstream behavior. ADR-0022's three-tier
   * severity vocabulary is the user-facing projection; this field exists so
   * the scheduler can sort findings within a single result.
   */
  readonly severity: 'blocker' | 'warning' | 'info';
}

/** Optional counterexample payload for shrinkable verifiers (fast-check, HDD). */
export interface VerifierCounterexample {
  readonly inputRepr: string;
  readonly inputHash: string;
  readonly shrinkSteps: number;
  readonly shrinker: 'fast-check' | 'hypothesis' | 'hdd';
  readonly observed: string;
  readonly expected?: string;
}

/**
 * The Verifier contract. ADR-0016 §1 is the canonical reference; tech-spec
 * §3.4 lines 127–138 is the substrate definition.
 */
export interface Verifier {
  /** Stable id; the registry rejects duplicates per ADR-0016 §3. */
  readonly id: string;
  /** Obligation kinds this verifier can resolve. The scheduler dispatches by intersection. */
  readonly obligationKinds: ReadonlyArray<ObligationKind>;
  /** Static capability advertisement. */
  readonly capabilities: VerifierCapabilities;
  /** Cost class drives the scheduler's sync vs async dispatch. */
  readonly costClass: VerifierCostClass;
  /**
   * Run the verifier against an obligation. The scheduler is responsible for
   * cost-class enforcement — for s/minutes verifiers, the scheduler may call
   * this from inside an Inngest function; the verifier itself does not need
   * to worry about durability.
   */
  run(o: Obligation, ctx: VerifierContext): Promise<VerifierResult>;
}
