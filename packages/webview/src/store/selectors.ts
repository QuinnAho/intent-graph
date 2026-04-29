// Narrow selectors over the Zustand graph store. Consumers (GraphCanvas,
// app shell) MUST import from here rather than reading store state directly
// — keeps the re-render scope tight per the Zustand-narrow-selectors pattern
// (tech-spec §3.5 line 141 "narrow Zustand selectors").

import { useGraphStore, type GraphLoadStatus } from './graph-slice.js';
import type { Edge, Node } from '@xyflow/react';

export function useGraphNodes(): ReadonlyArray<Node> {
  return useGraphStore((s) => s.nodes);
}

export function useGraphEdges(): ReadonlyArray<Edge> {
  return useGraphStore((s) => s.edges);
}

export function useGraphStatus(): GraphLoadStatus {
  return useGraphStore((s) => s.status);
}

export function useGraphLoaded(): boolean {
  return useGraphStore((s) => s.status === 'ready');
}

export function useLayoutReady(): boolean {
  return useGraphStore((s) => s.layoutReady);
}

export function useGraphError(): string | null {
  return useGraphStore((s) => s.errorMessage);
}
