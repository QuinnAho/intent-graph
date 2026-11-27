// reads the newest drift report from <root>/.runs/drift/latest.json. files only,
// the live server never starts the drift check or a model.

import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { DriftPairReport } from '@intentgraph/shared/schemas';

import { toRelative } from './check-status.js';
import type { LiveProblem } from './compose.js';
import { parseDriftReport } from './drift-marks.js';

export interface DriftSnapshot {
  /** the pairs of the newest report, or null when there is none or it is unusable */
  readonly pairs: DriftPairReport[] | null;
  /** when the report file was written, ms since epoch */
  readonly writtenAtMs: number;
  readonly problem: LiveProblem | null;
}

export const NO_DRIFT: DriftSnapshot = { pairs: null, writtenAtMs: 0, problem: null };

const LATEST = ['.runs', 'drift', 'latest.json'];

function statKey(file: string): string {
  try {
    const s = statSync(file);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return 'none';
  }
}

/** cheap change check for the poll: changes when latest.json or the report it names is new, edited or gone */
export function driftSignature(root: string): string {
  const latest = join(root, ...LATEST);
  let named = '';
  try {
    named = String((JSON.parse(readFileSync(latest, 'utf8')) as { report?: unknown }).report ?? '');
  } catch {
    // unreadable latest.json still counts as a signature of its own
  }
  return `${statKey(latest)}|${named}|${named ? statKey(named) : ''}`;
}

export function readDriftSnapshot(root: string): DriftSnapshot {
  const latest = join(root, ...LATEST);
  const latestRel = toRelative(latest, root);
  const problem = (file: string, message: string): DriftSnapshot => ({ pairs: null, writtenAtMs: 0, problem: { severity: 'error', file, message } });
  let latestText: string;
  try {
    latestText = readFileSync(latest, 'utf8');
  } catch {
    return NO_DRIFT;
  }
  let named: unknown;
  try {
    named = (JSON.parse(latestText) as { report?: unknown }).report;
  } catch {
    return problem(latestRel, 'drift latest.json is not valid json');
  }
  if (typeof named !== 'string' || named === '') return problem(latestRel, 'drift latest.json does not name a report');
  const reportPath = isAbsolute(named) ? resolve(named) : resolve(root, named);
  const inside = relative(join(root, '.runs', 'drift'), reportPath);
  if (inside.startsWith('..') || isAbsolute(inside) || inside.split(sep).includes('..')) return problem(latestRel, 'drift report is outside .runs/drift');
  const reportRel = toRelative(reportPath, root);
  let text: string;
  let writtenAtMs: number;
  try {
    text = readFileSync(reportPath, 'utf8');
    writtenAtMs = statSync(reportPath).mtimeMs;
  } catch {
    return problem(reportRel, 'drift report named by latest.json cannot be read');
  }
  const parsed = parseDriftReport(text);
  if (!parsed.ok) return problem(reportRel, parsed.message);
  return { pairs: parsed.pairs, writtenAtMs, problem: null };
}
