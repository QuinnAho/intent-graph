// Tests for the Verifier interface plumbing and the Coverage Verifier.
//
// Coverage:
//   - registry: register() throws on duplicate id, getVerifier finds entries,
//     listVerifiers iterates in insertion order.
//   - scheduler: dispatches sub-ms verifiers inline, throws on missing
//     registration, throws on s/minutes verifiers (phase-2 stub).
//   - coverage verifier:
//       - empty graph → 'verified', no findings.
//       - one intent with no incoming realizes → 'failed', one warning.
//       - one constraint with no outgoing edges → 'failed', one warning.
//       - covered graph (intent has realizes-in, constraint has outgoing)
//         → 'verified', no findings.

import { describe, expect, it, beforeEach } from 'vitest';

import {
  _clearRegistryForTests,
  getVerifier,
  listVerifiers,
  register,
} from '../src/verifiers/registry.js';
import { runVerifier } from '../src/verifiers/scheduler.js';
import { coverageVerifier } from '../src/verifiers/builtin/coverage.js';
import type {
  Obligation,
  Verifier,
  VerifierContext,
  VerifierContextEdge,
  VerifierContextNode,
} from '../src/verifiers/Verifier.js';

function makeContext(
  nodes: VerifierContextNode[],
  edges: VerifierContextEdge[],
): VerifierContext {
  return {
    runId: 'test-run',
    *getNodes(filter) {
      for (const n of nodes) {
        if (filter?.kind && n.kind !== filter.kind) continue;
        yield n;
      }
    },
    *getEdges(filter) {
      for (const e of edges) {
        if (filter?.kind && e.kind !== filter.kind) continue;
        if (filter?.src && e.src !== filter.src) continue;
        if (filter?.dst && e.dst !== filter.dst) continue;
        yield e;
      }
    },
  };
}

const fakeObligation = (id: string): Obligation => ({
  id,
  intent_node_id: 'intent-foo',
  kind: 'property',
  test_code: '',
  rationale: null,
});

describe('registry', () => {
  beforeEach(() => {
    _clearRegistryForTests();
  });

  it('register() inserts a verifier and getVerifier() finds it', () => {
    const v: Verifier = {
      id: 'test.example',
      obligationKinds: ['property'],
      capabilities: { canShrink: false, canExplain: false, isDeterministic: true },
      costClass: 'sub-ms',
      run: async () => ({
        status: 'verified',
        verifierId: 'test.example',
        obligationId: 'o',
        findings: [],
        latencyMs: 0,
      }),
    };
    register(v);
    expect(getVerifier('test.example')).toBe(v);
  });

  it('register() throws on duplicate id from a different verifier object', () => {
    const make = (): Verifier => ({
      id: 'test.dup',
      obligationKinds: ['property'],
      capabilities: { canShrink: false, canExplain: false, isDeterministic: true },
      costClass: 'sub-ms',
      run: async () => ({
        status: 'verified',
        verifierId: 'test.dup',
        obligationId: 'o',
        findings: [],
        latencyMs: 0,
      }),
    });
    register(make());
    expect(() => register(make())).toThrow(/collision/);
  });

  it('register() is idempotent when the same verifier reference is registered twice', () => {
    const v: Verifier = {
      id: 'test.idempotent',
      obligationKinds: ['property'],
      capabilities: { canShrink: false, canExplain: false, isDeterministic: true },
      costClass: 'sub-ms',
      run: async () => ({
        status: 'verified',
        verifierId: 'test.idempotent',
        obligationId: 'o',
        findings: [],
        latencyMs: 0,
      }),
    };
    register(v);
    expect(() => register(v)).not.toThrow();
    expect(getVerifier('test.idempotent')).toBe(v);
  });

  it('listVerifiers() iterates in insertion order', () => {
    const make = (id: string): Verifier => ({
      id,
      obligationKinds: ['property'],
      capabilities: { canShrink: false, canExplain: false, isDeterministic: true },
      costClass: 'sub-ms',
      run: async () => ({
        status: 'verified',
        verifierId: id,
        obligationId: 'o',
        findings: [],
        latencyMs: 0,
      }),
    });
    register(make('alpha'));
    register(make('beta'));
    register(make('gamma'));
    expect([...listVerifiers()].map((v) => v.id)).toEqual(['alpha', 'beta', 'gamma']);
  });
});

describe('scheduler', () => {
  beforeEach(() => {
    _clearRegistryForTests();
    register(coverageVerifier);
  });

  it('dispatches sub-ms verifiers inline and returns the verifier result', async () => {
    const ctx = makeContext([], []);
    const result = await runVerifier(fakeObligation('o-1'), ctx);
    expect(result.status).toBe('verified');
    expect(result.verifierId).toBe('builtin.coverage');
  });

  it('throws when no verifier matches the obligation kind', async () => {
    _clearRegistryForTests();
    const ctx = makeContext([], []);
    await expect(runVerifier(fakeObligation('o-1'), ctx)).rejects.toThrow(/no verifier registered/);
  });

  it('throws when an explicit verifier_id mismatches the obligation kind', async () => {
    register({
      id: 'test.typecheck-only',
      obligationKinds: ['typecheck'],
      capabilities: { canShrink: false, canExplain: false, isDeterministic: true },
      costClass: 'sub-ms',
      run: async () => ({
        status: 'verified',
        verifierId: 'test.typecheck-only',
        obligationId: 'o',
        findings: [],
        latencyMs: 0,
      }),
    });
    const ctx = makeContext([], []);
    await expect(
      runVerifier(fakeObligation('o-1'), ctx, { verifierId: 'test.typecheck-only' }),
    ).rejects.toThrow(/does not handle obligation kind/);
  });

  it('throws on s/minutes verifiers at phase 2 (Inngest binding not wired)', async () => {
    register({
      id: 'test.slow',
      obligationKinds: ['property'],
      capabilities: { canShrink: false, canExplain: false, isDeterministic: true },
      costClass: 's',
      run: async () => ({
        status: 'verified',
        verifierId: 'test.slow',
        obligationId: 'o',
        findings: [],
        latencyMs: 0,
      }),
    });
    const ctx = makeContext([], []);
    await expect(
      runVerifier(fakeObligation('o-1'), ctx, { verifierId: 'test.slow' }),
    ).rejects.toThrow(/Inngest binding/);
  });
});

describe('Coverage Verifier', () => {
  it('returns verified with no findings on an empty graph', async () => {
    const ctx = makeContext([], []);
    const result = await coverageVerifier.run(fakeObligation('o-1'), ctx);
    expect(result.status).toBe('verified');
    if (result.status !== 'pending') {
      expect(result.findings.length).toBe(0);
    }
  });

  it('flags an intent with no incoming realizes edges', async () => {
    const ctx = makeContext(
      [
        {
          id: 'intent-foo',
          kind: 'intent',
          title: 'Foo',
          body: '{}',
          parentId: null,
        },
      ],
      [],
    );
    const result = await coverageVerifier.run(fakeObligation('o-1'), ctx);
    expect(result.status).toBe('failed');
    if (result.status !== 'pending') {
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]?.nodeId).toBe('intent-foo');
      expect(result.findings[0]?.severity).toBe('warning');
      expect(result.findings[0]?.message).toMatch(/no incoming `realizes`/);
    }
  });

  it('passes an intent that has at least one incoming realizes edge', async () => {
    const ctx = makeContext(
      [
        { id: 'intent-foo', kind: 'intent', title: 'Foo', body: '{}', parentId: null },
        { id: 'code-bar', kind: 'code_symbol', title: 'bar', body: '{}', parentId: null },
      ],
      [
        { id: 'e1', src: 'code-bar', dst: 'intent-foo', kind: 'realizes', weight: 1 },
      ],
    );
    const result = await coverageVerifier.run(fakeObligation('o-1'), ctx);
    expect(result.status).toBe('verified');
    if (result.status !== 'pending') {
      expect(result.findings.length).toBe(0);
    }
  });

  it('flags a constraint with no outgoing edges', async () => {
    const ctx = makeContext(
      [
        {
          id: 'constraint-foo',
          kind: 'constraint',
          title: 'Foo',
          body: '{}',
          parentId: null,
        },
      ],
      [],
    );
    const result = await coverageVerifier.run(fakeObligation('o-1'), ctx);
    expect(result.status).toBe('failed');
    if (result.status !== 'pending') {
      expect(result.findings.some((f) => f.nodeId === 'constraint-foo')).toBe(true);
    }
  });

  it('passes a constraint that has at least one outgoing edge', async () => {
    const ctx = makeContext(
      [
        { id: 'constraint-foo', kind: 'constraint', title: 'Foo', body: '{}', parentId: null },
        { id: 'intent-bar', kind: 'intent', title: 'Bar', body: '{}', parentId: null },
      ],
      [
        // Realize edge from a hypothetical implementer back to the intent
        // gives intent-bar coverage; constraint-foo's outgoing edge is what
        // we are pinning here.
        { id: 'e1', src: 'impl-x', dst: 'intent-bar', kind: 'realizes', weight: 1 },
        { id: 'e2', src: 'constraint-foo', dst: 'intent-bar', kind: 'constrains', weight: 1 },
      ],
    );
    const result = await coverageVerifier.run(fakeObligation('o-1'), ctx);
    // The intent isn't in the node list; only the constraint is. Since the
    // constraint has an outgoing 'constrains' edge, no warning fires for it.
    if (result.status !== 'pending') {
      expect(
        result.findings.find((f) => f.nodeId === 'constraint-foo'),
      ).toBeUndefined();
    }
  });

  it('costClass is sub-ms (per ADR-0016 / tech-spec §3.4 line 134)', () => {
    expect(coverageVerifier.costClass).toBe('sub-ms');
  });

  it('isDeterministic = true (same graph in → same findings out)', async () => {
    const ctx1 = makeContext(
      [{ id: 'intent-foo', kind: 'intent', title: 'Foo', body: '{}', parentId: null }],
      [],
    );
    const ctx2 = makeContext(
      [{ id: 'intent-foo', kind: 'intent', title: 'Foo', body: '{}', parentId: null }],
      [],
    );
    const r1 = await coverageVerifier.run(fakeObligation('o-1'), ctx1);
    const r2 = await coverageVerifier.run(fakeObligation('o-1'), ctx2);
    expect(r1.status).toBe(r2.status);
    expect(coverageVerifier.capabilities.isDeterministic).toBe(true);
  });
});
