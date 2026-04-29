// Zustand slice for graph state — nodes, edges, and load status. Mutations
// go through narrow setters so React Flow can subscribe via narrow selectors
// (./selectors.ts) without re-rendering on unrelated changes.
//
// At L0 the only producer is the file-based graph.json loader
// (../transport/graph-json-loader.ts). Phase 3 swaps the producer for the
// MCP delta protocol; the store shape does not change because both producers
// converge on the same React Flow node/edge representation.

import { create } from 'zustand';
import type { Edge, Node } from '@xyflow/react';

export type GraphLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface GraphState {
  readonly nodes: ReadonlyArray<Node>;
  readonly edges: ReadonlyArray<Edge>;
  readonly status: GraphLoadStatus;
  readonly errorMessage: string | null;
  readonly layoutReady: boolean;

  // Actions — narrow setters so consumers can subscribe via shallow-equality
  // selectors without triggering re-renders on unrelated mutations.
  setLoading(): void;
  setGraph(nodes: ReadonlyArray<Node>, edges: ReadonlyArray<Edge>): void;
  setLayoutReady(ready: boolean): void;
  setError(message: string): void;
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  status: 'idle',
  errorMessage: null,
  layoutReady: false,

  setLoading: () => set({ status: 'loading', errorMessage: null, layoutReady: false }),
  setGraph: (nodes, edges) => set({ nodes, edges, status: 'ready', errorMessage: null }),
  setLayoutReady: (ready) => set({ layoutReady: ready }),
  setError: (message) => set({ status: 'error', errorMessage: message, layoutReady: false }),
}));
