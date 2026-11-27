// inferred intents for the live graph. the live server only reads what tools/infer.mjs
// wrote, it never starts a model. pure rules here, file reading in infer-reader.ts.
// what a person settled (dismissed or accepted) is tool state in .runs/infer/settled.json,
// never in spec/.

import { InferProposalRowSchema, type InferProposalRow, type LiveInferred } from '@intentgraph/shared/schemas';

export type ParsedInferReport = { readonly ok: true; readonly proposals: InferProposalRow[] } | { readonly ok: false; readonly message: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** the proposals of a report.json. any bad entry refuses the whole report. */
export function parseInferReport(text: string): ParsedInferReport {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, message: 'inference report is not valid json' };
  }
  const body = isObject(doc) ? doc['report'] : undefined;
  if (!isObject(body)) return { ok: false, message: 'inference report has no report object' };
  if (!Array.isArray(body['proposals'])) return { ok: false, message: 'inference report has no proposals list' };
  const proposals: InferProposalRow[] = [];
  for (const [i, raw] of (body['proposals'] as unknown[]).entries()) {
    const r = InferProposalRowSchema.safeParse(raw);
    if (!r.success) {
      const issue = r.error.issues[0];
      return { ok: false, message: `inference report does not match the schema at proposal ${i + 1}: ${issue ? `${issue.path.join('.')} ${issue.message}` : 'invalid'}` };
    }
    proposals.push(r.data);
  }
  return { ok: true, proposals };
}

export interface SettledEntry {
  readonly id: string;
  readonly code_hash: string;
}

export interface Settled {
  readonly dismissed: ReadonlyArray<SettledEntry>;
  /** accepted proposals and the intent each became, hidden only while that intent exists */
  readonly accepted: ReadonlyArray<SettledEntry & { readonly intent: string }>;
}

const EMPTY: Settled = { dismissed: [], accepted: [] };

const isEntry = (v: unknown): v is SettledEntry => isObject(v) && typeof v['id'] === 'string' && typeof v['code_hash'] === 'string';

/** a missing, broken or foreign file reads as nothing settled, so a bad file never hides a proposal */
export function parseSettled(text: string | null): Settled {
  if (text === null) return EMPTY;
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return EMPTY;
  }
  if (!isObject(doc)) return EMPTY;
  const dismissed = Array.isArray(doc['dismissed']) ? doc['dismissed'].filter(isEntry).map((e) => ({ id: e.id, code_hash: e.code_hash })) : [];
  const accepted = Array.isArray(doc['accepted'])
    ? doc['accepted'].filter((e: unknown): e is SettledEntry & { intent: string } => isEntry(e) && typeof (e as unknown as Record<string, unknown>)['intent'] === 'string').map((e) => ({ id: e.id, code_hash: e.code_hash, intent: e.intent }))
    : [];
  return { dismissed, accepted };
}

export const settledText = (s: Settled): string => `${JSON.stringify(s, null, 2)}\n`;

const same = (a: SettledEntry, p: InferProposalRow): boolean => a.id === p.id && a.code_hash === p.code_hash;

export function addDismissed(s: Settled, p: InferProposalRow): Settled {
  if (s.dismissed.some((e) => same(e, p))) return s;
  return { ...s, dismissed: [...s.dismissed, { id: p.id, code_hash: p.code_hash }] };
}

export function addAccepted(s: Settled, p: InferProposalRow, intent: string): Settled {
  return { ...s, accepted: [...s.accepted.filter((e) => !same(e, p)), { id: p.id, code_hash: p.code_hash, intent }] };
}

/** proposals still waiting for a person. a dismissed one comes back when its code changed. */
export function openProposals(proposals: ReadonlyArray<InferProposalRow>, s: Settled, specIds: ReadonlySet<string>): InferProposalRow[] {
  return proposals.filter((p) => !s.dismissed.some((e) => same(e, p)) && !s.accepted.some((e) => same(e, p) && specIds.has(e.intent)));
}

export const INFERRED_PREFIX = 'inferred:';
export const inferredNodeId = (p: { readonly id: string }): string => `${INFERRED_PREFIX}${p.id}`;

export function liveInferred(p: InferProposalRow, restatesTitle: string | null): LiveInferred {
  return {
    proposal_id: p.id,
    folder: p.folder,
    anchors: [...p.anchors],
    confidence: p.confidence,
    planned: p.planned,
    restates: p.restates,
    restates_title: restatesTitle,
    belongs_under: p.belongs_under,
    code_hash: p.code_hash,
  };
}
