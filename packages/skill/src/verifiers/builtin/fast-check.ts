// Tier-1 in-process verifier: fast-check property-based testing for TS.
// Counterexample shrinking is free. Promotes minimized counterexamples to
// graph nodes (kind='counterexample').
//
// This module currently exposes only the trivial round-trip property used by
// the wiring smoke test (packages/skill/tests/fast-check.test.ts) so the
// verifier package has at least one passing fast-check property in CI before
// the full Verifier interface lands.

import fc from 'fast-check';

export interface PropertyResult {
  readonly ok: boolean;
  readonly numRuns: number;
}

// Round-trip property: for every safe integer n, Number.parseInt(String(n), 10) === n.
// Uses fast-check's integer arbitrary so values stay inside Number.MAX_SAFE_INTEGER.
export function checkParseIntRoundTrip(numRuns = 100): PropertyResult {
  const property = fc.property(fc.integer(), (n: number) => Number.parseInt(String(n), 10) === n);
  const result = fc.check(property, { numRuns });
  return { ok: !result.failed, numRuns: result.numRuns };
}
