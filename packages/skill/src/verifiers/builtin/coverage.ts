// Coverage Verifier — first concrete verifier against the ADR-0016 interface.
//
// What it checks (tech-spec §6 phase 2 line 444):
//   - Every Intent has at least one `realizes` edge pointing TO it (i.e., at
//     least one downstream artifact claims to realize this intent).
//   - Every Constraint is verified-by something (i.e., the constraint has at
//     least one outgoing edge of kind `verified_by`).
//
// Per p2-t07's task notes: at L0, missing coverage SURFACES AS WARNINGS, not
// blockers. The L0 gate is "find an intent visually within 60s," not "every
// intent has a realizes edge." A red Coverage run on the in-progress dogfood
// payload is expected and useful as triage. Phase 3 (L1) raises Coverage to
// a CI gate when bidirectional sync makes intent-edge authoring cheap.
//
// Implementation discipline:
//   - Cost class is `sub-ms` — the verifier is a single graph traversal that
//     scales with edge count, well under a millisecond on phase-2-sized
//     graphs (a few hundred nodes / edges per the smoke test).
//   - Findings carry `severity: 'warning'` per the L0-not-blocker rule. The
//     overall result `status` is `failed` only when at least one warning
//     was emitted; an empty result is `verified`.
//   - The verifier emits one finding per uncovered intent / constraint.
//     Caller decides whether to surface them individually or roll them up.
//   - Determinism: yes. Same graph in → same findings out.

import type {
  Obligation,
  Verifier,
  VerifierContext,
  VerifierFinding,
  VerifierResult,
} from '../Verifier.js';

const VERIFIER_ID = 'builtin.coverage';

/**
 * The Coverage Verifier. Reads the graph once via `ctx.getNodes` and
 * `ctx.getEdges`, builds two indices (incoming-realizes per node, outgoing-
 * verified_by per node), then walks intents and constraints to surface
 * uncovered ones as `warning`-severity findings.
 *
 * `Obligation` is essentially ignored at this layer — the obligation is the
 * trigger, not the target. The verifier acts on the whole graph and reports
 * per-node findings. The obligation's `intent_node_id` is preserved in the
 * result for audit but does not narrow the scan.
 */
export const coverageVerifier: Verifier = {
  id: VERIFIER_ID,
  obligationKinds: ['property'],
  capabilities: {
    canShrink: false,
    canExplain: true,
    isDeterministic: true,
  },
  costClass: 'sub-ms',
  async run(o: Obligation, ctx: VerifierContext): Promise<VerifierResult> {
    const startedAt = Date.now();

    // Build incoming-realizes index: node id → count of edges where dst
    // equals that id and kind === 'realizes'. Constraints are checked via
    // outgoing 'verified_by' separately because the spec frontmatter
    // currently models verified_by as a constraint→target relationship.
    const incomingRealizes = new Map<string, number>();
    const outgoingVerifiedBy = new Map<string, number>();

    for (const edge of ctx.getEdges()) {
      if (edge.kind === 'realizes') {
        incomingRealizes.set(edge.dst, (incomingRealizes.get(edge.dst) ?? 0) + 1);
      }
      // The schema's edge.kind enum (tech-spec §4.2) does not include
      // `verified_by` as a first-class kind today — verified_by is encoded
      // implicitly via a `realizes` from a constraint to its target intent.
      // We retain the outgoing-verified_by index slot so a future schema
      // amendment can populate it without changing the verifier's shape.
      if (edge.kind === 'references' && (edge.body ?? '').includes('verified_by')) {
        outgoingVerifiedBy.set(edge.src, (outgoingVerifiedBy.get(edge.src) ?? 0) + 1);
      }
    }

    const findings: VerifierFinding[] = [];

    for (const node of ctx.getNodes()) {
      if (node.kind === 'intent') {
        if ((incomingRealizes.get(node.id) ?? 0) === 0) {
          findings.push({
            nodeId: node.id,
            message: `intent has no incoming \`realizes\` edges — no downstream artifact claims to realize it`,
            severity: 'warning',
          });
        }
      } else if (node.kind === 'constraint') {
        // For constraints, missing 'verified_by' is the L0 signal. Until the
        // schema lands `verified_by` as a first-class edge kind, we treat
        // ANY outgoing edge from the constraint as evidence of verification
        // wiring (better to under-report than over-report at L0).
        let hasOutgoing = false;
        for (const _edge of ctx.getEdges({ src: node.id })) {
          hasOutgoing = true;
          break;
        }
        if (!hasOutgoing) {
          findings.push({
            nodeId: node.id,
            message: `constraint has no outgoing edges — no \`verified_by\` link recorded`,
            severity: 'warning',
          });
        }
      }
    }

    const latencyMs = Date.now() - startedAt;
    return {
      status: findings.length === 0 ? 'verified' : 'failed',
      verifierId: VERIFIER_ID,
      obligationId: o.id,
      findings,
      latencyMs,
    };
  },
};

// Registration: the registry owns the side-effect call. See ../registry.ts.
// Built-in modules export `verifier`; the registry imports them by name and
// calls register() itself. This avoids the circular import that arises when
// each built-in tries to register() back into the registry that imports it.
