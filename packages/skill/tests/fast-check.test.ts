// Smoke test that fast-check is wired into @intentgraph/skill. The single
// property — Number.parseInt(String(n), 10) === n on safe integers — is
// trivially true; the point of the test is to exercise the fast-check runtime
// inside vitest so a regression in the dev-dep wiring is caught at CI time.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { checkParseIntRoundTrip } from '../src/verifiers/builtin/fast-check.js';

describe('fast-check wiring', () => {
  it('round-trips Number.parseInt over safe integers', () => {
    const result = checkParseIntRoundTrip();
    expect(result.ok).toBe(true);
    expect(result.numRuns).toBeGreaterThan(0);
  });

  it('exposes the fast-check runtime to test files', () => {
    fc.assert(
      fc.property(fc.integer(), (n: number) => Number.parseInt(String(n), 10) === n),
    );
  });
});
