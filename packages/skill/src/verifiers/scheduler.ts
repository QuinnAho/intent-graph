// Verifier scheduler. ADR-0016 §2 pins the dispatch shape:
//   - sub-ms / ms verifiers run inline (verifier.run is awaited directly).
//   - s / minutes verifiers enqueue an Inngest `verify.run` event and return
//     a `pending` sentinel; the Inngest function wraps verifier.run in a
//     single step.run so the trace_event row lands through the AgentRunner-
//     adjacent chokepoint per ADR-0004.
//
// Async post-back goes through `event_log` per ADR-0016 §2 — the Inngest
// function appends `obligation.verified` (or `.failed`) and the existing
// projection updates `obligation` rows. This file does NOT do the post-back;
// it only enqueues. The Inngest function lives alongside the orchestrator
// (phase 4 wires it in).
//
// At phase 2, the Inngest binding is not yet wired. For now, s/minutes
// verifiers simply throw — the only verifier in scope (Coverage) is sub-ms,
// so the gap is invisible at L0. Phase 4's task list lands the Inngest
// function and removes the throw.

import type { Obligation, Verifier, VerifierContext, VerifierResult } from './Verifier.js';
import { getVerifier, listVerifiers } from './registry.js';

export interface RunVerifierOptions {
  /** Pin a specific verifier id; otherwise dispatch by `obligation.kind`. */
  readonly verifierId?: string;
}

/**
 * Run a verifier against an obligation. Looks up the verifier, inspects its
 * `costClass`, and either runs inline (sub-ms / ms) or enqueues for
 * background processing (s / minutes). Returns a `VerifierResult` whose
 * `status` discriminates the two cases:
 *   - `pending` — async path, real result will land via event_log later.
 *   - `verified | failed | rejected` — sync path, result is final.
 *
 * Throws if no matching verifier is registered (the caller should check
 * `getVerifier` first if it wants graceful degradation).
 */
export async function runVerifier(
  o: Obligation,
  ctx: VerifierContext,
  opts: RunVerifierOptions = {},
): Promise<VerifierResult> {
  const verifier = resolveVerifier(o, opts.verifierId);
  if (!verifier) {
    throw new Error(
      `no verifier registered for obligation ${o.id} ` +
        `(kind=${o.kind}${opts.verifierId ? `, requested id=${opts.verifierId}` : ''})`,
    );
  }

  switch (verifier.costClass) {
    case 'sub-ms':
    case 'ms':
      return verifier.run(o, ctx);
    case 's':
    case 'minutes':
      return enqueueAsync(verifier, o);
  }
}

/**
 * Resolve which verifier to run. If `verifierId` is supplied, use it directly
 * (and verify the kind matches). Otherwise pick the first registered verifier
 * that advertises the obligation's kind in its `obligationKinds` array.
 *
 * The first-match policy is deliberately simple — phase 4 may layer routing
 * heuristics (capability-based selection, user preference) on top. At L0
 * there is one verifier per obligation kind, so the ambiguity does not arise.
 */
function resolveVerifier(o: Obligation, verifierId: string | undefined): Verifier | undefined {
  if (verifierId !== undefined) {
    const verifier = getVerifier(verifierId);
    if (!verifier) return undefined;
    if (!verifier.obligationKinds.includes(o.kind)) {
      throw new Error(
        `verifier '${verifierId}' does not handle obligation kind '${o.kind}' ` +
          `(supported: ${verifier.obligationKinds.join(', ')})`,
      );
    }
    return verifier;
  }
  for (const verifier of listVerifiers()) {
    if (verifier.obligationKinds.includes(o.kind)) return verifier;
  }
  return undefined;
}

/**
 * Enqueue an s/minutes verifier for background execution. Phase 2 stub:
 * throws because the Inngest binding is not yet wired. Phase 4 replaces the
 * throw with a real `inngest.send({ name: 'verify.run', data: ... })` and
 * returns a `{ status: 'pending', verifierId, obligationId, enqueuedAt }`
 * sentinel matching the VerifierResult union's pending variant.
 *
 * The pending-sentinel shape is documented in @intentgraph/shared/verifier;
 * only the enqueue call itself is stubbed at phase 2.
 */
function enqueueAsync(verifier: Verifier, o: Obligation): never {
  throw new Error(
    `s/minutes verifier '${verifier.id}' cannot run at phase 2 — Inngest binding ` +
      `lands in phase 4. The pending-sentinel return path is in place but the ` +
      `enqueue call is stubbed. See ADR-0016 §2 for the full async contract. ` +
      `(obligation=${o.id}, costClass=${verifier.costClass})`,
  );
}
