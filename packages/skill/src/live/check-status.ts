// check status per adr 0030: verified (every linked test passes), failed (any
// fails), pending (no verified_by, not run yet, or a linked test is missing or skipped).

import type { Anchor } from '../parser/spec-md/anchors.js';

export type CheckStatus = 'verified' | 'failed' | 'pending';

// the slice of vitest's json reporter output we read
export interface TestReport {
  readonly testResults: ReadonlyArray<{
    readonly name: string;
    readonly status: string;
    readonly assertionResults: ReadonlyArray<{ readonly title: string; readonly fullName: string; readonly status: string }>;
  }>;
}

export interface NodeCheck {
  readonly status: CheckStatus;
  readonly reasons: ReadonlyArray<string>;
}

type AnchorResult = 'passed' | 'failed' | 'missing';

export function toRelative(file: string, root: string): string {
  const f = file.replace(/\\/g, '/');
  const r = root.replace(/\\/g, '/').replace(/\/+$/, '');
  if (f.toLowerCase().startsWith(r.toLowerCase() + '/')) return f.slice(r.length + 1);
  return f;
}

function judgeAnchor(anchor: Anchor, report: TestReport, root: string): { result: AnchorResult; reason?: string } {
  const file = report.testResults.find((t) => toRelative(t.name, root) === anchor.path);
  if (!file) return { result: 'missing', reason: `${anchor.raw}: test file not found in the run` };
  if (anchor.name !== undefined) {
    const hits = file.assertionResults.filter((x) => x.title === anchor.name || x.fullName === anchor.name);
    if (hits.length === 0) return { result: 'missing', reason: `${anchor.raw}: test not found` };
    if (hits.some((x) => x.status === 'failed')) return { result: 'failed', reason: `${anchor.raw}: failed` };
    if (hits.every((x) => x.status === 'passed')) return { result: 'passed' };
    return { result: 'missing', reason: `${anchor.raw}: skipped` };
  }
  if (file.status === 'failed' || file.assertionResults.some((x) => x.status === 'failed')) {
    return { result: 'failed', reason: `${anchor.raw}: failed` };
  }
  if (file.assertionResults.length > 0 && file.assertionResults.every((x) => x.status === 'passed')) return { result: 'passed' };
  return { result: 'missing', reason: `${anchor.raw}: no passing tests ran` };
}

export function mapCheckStatus(verifiedBy: ReadonlyArray<Anchor>, report: TestReport | null, root: string): NodeCheck {
  if (verifiedBy.length === 0) return { status: 'pending', reasons: ['no verified_by'] };
  if (!report) return { status: 'pending', reasons: ['tests not run yet'] };
  const judged = verifiedBy.map((a) => judgeAnchor(a, report, root));
  const reasons = judged.flatMap((j) => (j.reason ? [j.reason] : []));
  if (judged.some((j) => j.result === 'failed')) return { status: 'failed', reasons };
  if (judged.some((j) => j.result === 'missing')) return { status: 'pending', reasons };
  return { status: 'verified', reasons };
}

export interface LinkedFiles {
  readonly tests: ReadonlySet<string>;
  readonly realized: ReadonlySet<string>;
}

export function needsTestRun(changed: ReadonlySet<string>, before: LinkedFiles, after: LinkedFiles): boolean {
  for (const p of changed) if (after.tests.has(p) || after.realized.has(p) || before.tests.has(p)) return true;
  if (before.tests.size !== after.tests.size) return true;
  for (const t of after.tests) if (!before.tests.has(t)) return true;
  return false;
}
