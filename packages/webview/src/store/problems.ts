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

// lane 12: what to do next, one short line per kind of problem the server makes today.
// matched on the message. the owner may change the words, they are listed in the lane note.
export const PROBLEM_HINTS: ReadonlyArray<{ readonly match: RegExp; readonly hint: string }> = [
  { match: /^no YAML frontmatter found/, hint: 'Start the file with a --- block holding id, title, parent, confidence.' },
  { match: /^frontmatter is not valid YAML/, hint: 'Fix the YAML between the two --- lines.' },
  { match: /^frontmatter must be a YAML mapping/, hint: 'Write the frontmatter as key: value lines.' },
  { match: /required minimum \(id, title, parent, confidence\)/, hint: 'Add the missing id, title, parent or confidence field.' },
  { match: /does not start with the kind prefix/, hint: 'Start the id with its kind, like intent- or concept-.' },
  { match: /^intent missing recommended `target_kinds`/, hint: 'Add a target_kinds list to the frontmatter.' },
  { match: /^constraint missing one or more recommended fields/, hint: 'Add predicate_kind, expr and scope_node to the frontmatter.' },
  { match: /^concept missing recommended `regeneration_scope`/, hint: 'Add regeneration_scope: atomic or cooperative.' },
  { match: /^parent loop/, hint: 'Point one parent in the loop at a concept outside it.' },
  { match: /^drift /, hint: 'Run node tools/drift.mjs again for a fresh report.' },
  { match: /^inference /, hint: 'Run node tools/infer.mjs again for a fresh report.' },
];

export function problemHint(message: string): string | null {
  return PROBLEM_HINTS.find((h) => h.match.test(message))?.hint ?? null;
}

const KIND_OF_DIR: Readonly<Record<string, string>> = { intents: 'intent', constraints: 'constraint', decisions: 'decision', concepts: 'concept' };

/** the node a problem is about, when its file still makes one: the id the message names, or kind-stem of the file */
export function problemNodeId(p: Pick<GraphProblem, 'file' | 'message'>, ids: ReadonlySet<string>): string | null {
  const named = /id "([^"]+)"/.exec(p.message)?.[1];
  if (named && ids.has(named)) return named;
  const parts = p.file.split(/[\\/]/);
  const stem = (parts[parts.length - 1] ?? '').replace(/\.md$/i, '');
  const kind = KIND_OF_DIR[parts[parts.length - 2] ?? ''];
  if (kind && ids.has(`${kind}-${stem}`)) return `${kind}-${stem}`;
  return null;
}

interface ProblemsState {
  readonly problems: ReadonlyArray<GraphProblem>;
  /** the list under the bar is open. the bar's count opens and closes it (lane 12). */
  readonly open: boolean;
  setProblems(problems: ReadonlyArray<GraphProblem>): void;
  setOpen(open: boolean): void;
}

export const useProblemsStore = create<ProblemsState>((set) => ({
  problems: [],
  open: false,
  setProblems: (problems) => set({ problems }),
  setOpen: (open) => set({ open }),
}));
