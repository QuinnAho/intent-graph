// where the page gets its graph: static graph.json, or a live server.
import { describe, expect, it } from 'vitest';

import { pickInitialFit, readFocus, readLiveSource } from '../src/transport/live-source.js';

describe('readLiveSource', () => {
  it('is null for the static page', () => {
    expect(readLiveSource('', undefined)).toBe(null);
  });

  it('reads the flag the live server injects', () => {
    expect(readLiveSource('', { graph: '/graph.json', events: '/events' })).toEqual({ graphUrl: '/graph.json', eventsUrl: '/events' });
  });

  it('reads a live server url from the query, for the vite dev page', () => {
    expect(readLiveSource('?live=http://127.0.0.1:4100/', undefined)).toEqual({
      graphUrl: 'http://127.0.0.1:4100/graph.json',
      eventsUrl: 'http://127.0.0.1:4100/events',
    });
    expect(readLiveSource('?live=1', undefined)).toEqual({ graphUrl: '/graph.json', eventsUrl: '/events' });
  });

  it('ignores a malformed flag', () => {
    expect(readLiveSource('', { graph: 3 })).toBe(null);
  });
});

describe('readFocus', () => {
  it('reads the focus parameter', () => {
    expect(readFocus('?focus=intent-a')).toBe('intent-a');
    expect(readFocus('?x=1')).toBe(null);
  });
});

describe('pickInitialFit', () => {
  const nodes = [
    { id: 'intent-a', type: 'intent' },
    { id: 'code_module:a.ts', type: 'code_module' },
    { id: 'concept-b', type: 'concept' },
  ];
  it('fits the focused node when it exists', () => {
    expect(pickInitialFit(nodes, 'concept-b')).toEqual(['concept-b']);
  });
  it('fits the spec nodes when there is no focus or the focus is unknown', () => {
    expect(pickInitialFit(nodes, null)).toEqual(['intent-a', 'concept-b']);
    expect(pickInitialFit(nodes, 'nope')).toEqual(['intent-a', 'concept-b']);
  });
  it('fits everything when there are no spec nodes', () => {
    expect(pickInitialFit([{ id: 'x', type: 'code_module' }], null)).toBe(null);
  });
});
