// drift marks for the live graph. the live server only reads what tools/drift.mjs
// wrote, it never starts a judge. pure rules here, file reading in drift-reader.ts.

import { DriftPairReportSchema, type DriftPairReport, type DriftVerdict, type LiveDrift } from '@intentgraph/shared/schemas';

const SEVERITY: Record<DriftVerdict, number> = { aligned: 0, unclear: 1, drift: 2 };

export type ParsedReport = { readonly ok: true; readonly pairs: DriftPairReport[] } | { readonly ok: false; readonly message: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** the entries of a report.json: range runs hold `pairs`, case runs hold one run per case. any bad entry refuses the whole report. */
export function parseDriftReport(text: string): ParsedReport {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, message: 'drift report is not valid json' };
  }
  const body = isObject(doc) ? doc['report'] : undefined;
  if (!isObject(body)) return { ok: false, message: 'drift report has no report object' };
  const lists: unknown[] = [];
  if (Array.isArray(body['pairs'])) lists.push(...body['pairs']);
  else if (isObject(body['reports'])) {
    for (const run of Object.values(body['reports'])) if (isObject(run) && Array.isArray(run['pairs'])) lists.push(...run['pairs']);
  } else return { ok: false, message: 'drift report has no pairs list' };
  const pairs: DriftPairReport[] = [];
  for (const [i, raw] of lists.entries()) {
    const r = DriftPairReportSchema.safeParse(raw);
    if (!r.success) {
      const issue = r.error.issues[0];
      return { ok: false, message: `drift report does not match the schema at pair ${i + 1}: ${issue ? `${issue.path.join('.')} ${issue.message}` : 'invalid'}` };
    }
    pairs.push(r.data);
  }
  return { ok: true, pairs };
}

/** worst verdict per node. among equal verdicts the later entry wins, it is the newer commit. */
export function pickWorst(pairs: ReadonlyArray<DriftPairReport>): Map<string, { entry: DriftPairReport; count: number }> {
  const out = new Map<string, { entry: DriftPairReport; count: number }>();
  for (const p of pairs) {
    const had = out.get(p.node_id);
    if (!had) out.set(p.node_id, { entry: p, count: 1 });
    else out.set(p.node_id, { entry: SEVERITY[p.verdict] >= SEVERITY[had.entry.verdict] ? p : had.entry, count: had.count + 1 });
  }
  return out;
}

/**
 * the mark for every node the report names. stale when a bound file changed after the report was written.
 * mtimeOf gives a file's change time in ms, or null when it is gone.
 */
export function buildDriftMarks(
  pairs: ReadonlyArray<DriftPairReport>,
  writtenAtMs: number,
  realizedPaths: ReadonlyMap<string, ReadonlyArray<string>>,
  mtimeOf: (path: string) => number | null,
): Map<string, LiveDrift> {
  const marks = new Map<string, LiveDrift>();
  for (const [id, { entry, count }] of pickWorst(pairs)) {
    const stale = (realizedPaths.get(id) ?? []).some((p) => {
      const t = mtimeOf(p);
      return t !== null && t > writtenAtMs;
    });
    marks.set(id, {
      verdict: entry.verdict,
      evidence: entry.evidence,
      suggested_action: entry.suggested_action,
      commit: entry.commit,
      decided_by: entry.decided_by,
      reported_at: new Date(writtenAtMs).toISOString(),
      entries: count,
      stale,
    });
  }
  return marks;
}
