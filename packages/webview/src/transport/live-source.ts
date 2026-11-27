// where the graph comes from. the live server injects window.__INTENTGRAPH_LIVE__
// into the page it serves. the vite dev page can point at one with ?live=<url>.
// with neither, the page reads the static /graph.json once, as before.

export interface LiveSource {
  readonly graphUrl: string;
  readonly eventsUrl: string;
}

export const SPEC_KINDS: ReadonlySet<string> = new Set(['intent', 'constraint', 'decision', 'concept']);

export function readLiveSource(search: string, flag: unknown): LiveSource | null {
  if (flag && typeof flag === 'object') {
    const f = flag as Record<string, unknown>;
    if (typeof f['graph'] === 'string' && typeof f['events'] === 'string') return { graphUrl: f['graph'], eventsUrl: f['events'] };
  }
  const live = new URLSearchParams(search).get('live');
  if (!live) return null;
  if (live === '1') return { graphUrl: '/graph.json', eventsUrl: '/events' };
  const base = live.replace(/\/+$/, '');
  return { graphUrl: `${base}/graph.json`, eventsUrl: `${base}/events` };
}

export function readFocus(search: string): string | null {
  return new URLSearchParams(search).get('focus');
}

/** node ids the first view fits to, or null to fit the whole graph */
export function pickInitialFit(
  nodes: ReadonlyArray<{ id: string; type?: string | undefined; parentId?: string | undefined }>,
  focus: string | null,
): string[] | null {
  const hit = focus ? nodes.find((n) => n.id === focus) : undefined;
  // a node inside a concept brings its concept, so the frame around it is not cut off
  if (hit) return hit.parentId !== undefined && nodes.some((n) => n.id === hit.parentId) ? [hit.id, hit.parentId] : [hit.id];
  const spec = nodes.filter((n) => n.type !== undefined && SPEC_KINDS.has(n.type)).map((n) => n.id);
  return spec.length > 0 ? spec : null;
}
