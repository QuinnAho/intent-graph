// Lifted from claudemap/app/src/components/graph/systemNodeSizing.js @ claudemap@vendored.
// Adapted: TS strict, polymorphic dispatch by node kind. Each node component exports
// its own getLayoutSize(data) and registers it here; the sizing module composes the
// dispatch map. Free-form helpers like getSystemNodeWidth (line-count tied) were
// dropped because IntentGraph node sizes derive from kind, expansion, and child
// counts rather than from a primitive code metric.
// License: MIT (see /claudemap/LICENSE). See LIFT_LOG.md for the full lift record.

import type { Node } from '@xyflow/react';

import type { NodeKind } from '../nodes/nodeIcons.js';
import { getDefaultChromeSize } from '../nodes/shared/nodeChrome.js';

export interface NodeLayoutSize {
  width: number;
  height: number;
}

export type LayoutSizeFn = (node: Node) => NodeLayoutSize;

const sizers = new Map<NodeKind, LayoutSizeFn>();

/** Per-node modules call this once at module load to register their sizer. */
export function registerLayoutSizer(kind: NodeKind, fn: LayoutSizeFn): void {
  sizers.set(kind, fn);
}

/** Polymorphic dispatch by node kind. Falls back to chrome defaults. */
export function getLayoutSize(node: Node): NodeLayoutSize {
  const kind = node.type as NodeKind | undefined;
  if (kind && sizers.has(kind)) {
    const fn = sizers.get(kind);
    if (fn) return fn(node);
  }
  if (kind) return getDefaultChromeSize(kind, false);
  return { width: 220, height: 72 };
}
