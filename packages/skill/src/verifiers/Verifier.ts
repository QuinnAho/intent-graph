// Skill-side re-export of the shared Verifier contract. Plugin authors
// import from `@intentgraph/shared/verifier`; skill-internal call sites
// import from this file. Keeping a stable internal alias means built-ins
// and the scheduler do not have to reach across packages on every line.
//
// ADR-0016 §1: the contract lives in `@intentgraph/shared/verifier/`. This
// re-export is purely an ergonomic seam for skill code.

export type {
  Verifier,
  VerifierCapabilities,
  VerifierContext,
  VerifierContextEdge,
  VerifierContextNode,
  VerifierCostClass,
  VerifierCounterexample,
  VerifierFinding,
  VerifierResult,
  Obligation,
} from '@intentgraph/shared/verifier';
