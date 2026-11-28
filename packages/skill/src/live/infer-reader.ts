// reads the newest inference report from <root>/.runs/infer/latest.json and the settled
// list beside it. files only, the live server never starts a model.

import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { InferProposalRow } from '@intentgraph/shared/schemas';

import { toRelative } from './check-status.js';
import type { LiveProblem } from './compose.js';
import { parseInferReport, parseSettled, type Settled } from './infer-marks.js';

export interface InferSnapshot {
  /** the proposals of the newest report, or null when there is none or it is unusable */
  readonly proposals: InferProposalRow[] | null;
  readonly settled: Settled;
  readonly problem: LiveProblem | null;
}

const INFER_DIR = ['.runs', 'infer'];
export const settledPath = (root: string): string => join(root, ...INFER_DIR, 'settled.json');

function statKey(file: string): string {
  try {
    const s = statSync(file);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return 'none';
  }
}

function readOrNull(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** cheap change check for the poll: latest.json, the report it names, and the settled list */
export function inferSignature(root: string): string {
  const latest = join(root, ...INFER_DIR, 'latest.json');
  let named = '';
  try {
    named = String((JSON.parse(readFileSync(latest, 'utf8')) as { report?: unknown }).report ?? '');
  } catch {
    // unreadable latest.json still counts as a signature of its own
  }
  const reportPath = named ? (isAbsolute(named) ? named : join(root, named)) : '';
  return `${statKey(latest)}|${named}|${reportPath ? statKey(reportPath) : ''}|${statKey(settledPath(root))}`;
}

/** true only for a path inside <root>/.runs/infer */
export function isInsideInfer(root: string, file: string): boolean {
  const inside = relative(join(resolve(root), ...INFER_DIR), resolve(file));
  return inside.length > 0 && !inside.startsWith('..') && !isAbsolute(inside) && !inside.split(sep).includes('..');
}

export function readInferSnapshot(root: string): InferSnapshot {
  const settled = parseSettled(readOrNull(settledPath(root)));
  const latest = join(root, ...INFER_DIR, 'latest.json');
  const latestRel = toRelative(latest, root);
  const problem = (file: string, message: string): InferSnapshot => ({ proposals: null, settled, problem: { severity: 'error', file, message } });
  const latestText = readOrNull(latest);
  if (latestText === null) return { proposals: null, settled, problem: null };
  let named: unknown;
  try {
    named = (JSON.parse(latestText) as { report?: unknown }).report;
  } catch {
    return problem(latestRel, 'inference latest.json is not valid json');
  }
  if (typeof named !== 'string' || named === '') return problem(latestRel, 'inference latest.json does not name a report');
  const reportPath = isAbsolute(named) ? resolve(named) : resolve(root, named);
  if (!isInsideInfer(root, reportPath)) return problem(latestRel, 'inference report is outside .runs/infer');
  const reportRel = toRelative(reportPath, root);
  const text = readOrNull(reportPath);
  if (text === null) return problem(reportRel, 'inference report named by latest.json cannot be read');
  const parsed = parseInferReport(text);
  if (!parsed.ok) return problem(reportRel, parsed.message);
  return { proposals: parsed.proposals, settled, problem: null };
}
