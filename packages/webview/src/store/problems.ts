// spec files the parser rejected or warned about, from the live server's
// graph.json. a rejected file has no node, so this list is the only place a
// person sees it. the static graph.json has no problems field, so the list is empty there.

import { create } from 'zustand';

export interface GraphProblem {
  readonly severity: 'error' | 'warning';
  readonly file: string;
  readonly message: string;
}

export function readProblems(envelope: unknown): GraphProblem[] {
  const raw = (envelope as { problems?: unknown } | null)?.problems;
  if (!Array.isArray(raw)) return [];
  const out: GraphProblem[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    if (typeof r['file'] !== 'string' || typeof r['message'] !== 'string') continue;
    out.push({ severity: r['severity'] === 'error' ? 'error' : 'warning', file: r['file'], message: r['message'] });
  }
  return out;
}

export function problemsLabel(problems: ReadonlyArray<GraphProblem>): string {
  if (problems.length === 0) return '';
  return `${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}`;
}

interface ProblemsState {
  readonly problems: ReadonlyArray<GraphProblem>;
  setProblems(problems: ReadonlyArray<GraphProblem>): void;
}

export const useProblemsStore = create<ProblemsState>((set) => ({
  problems: [],
  setProblems: (problems) => set({ problems }),
}));
