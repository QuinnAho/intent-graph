// Lifted from claudemap/app/src/components/graph/systemNodeSizing.js @ claudemap@vendored.
// Adapted: TS strict, polymorphic dispatch by node kind. Each node component exports
// its own getLayoutSize(data) and registers it here; the sizing module composes the
// dispatch map. Free-form helpers like getSystemNodeWidth (line-count tied) were
// dropped because IntentGraph node sizes derive from kind, expansion, and child
// counts rather than from a primitive code metric.
// License: MIT (see /claudemap/LICENSE). See docs/04 - Workflow/Lift Log.md for the full lift record.

import type { Node } from '@xyflow/react';

import type { NodeKind } from '../nodes/nodeIcons.js';
import { getDefaultChromeSize } from '../nodes/shared/nodeChrome.js';
import { TITLE_TUNING, VIEW_TUNING } from '../view-tuning.js';
import { specNodeHeight } from './title-room.js';

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
// spec nodes show the whole title, so their height follows it
const TITLE_KINDS: ReadonlySet<string> = new Set(['intent', 'constraint', 'decision']);

export function getLayoutSize(node: Node): NodeLayoutSize {
  const kind = node.type as NodeKind | undefined;
  if (kind && sizers.has(kind)) {
    const fn = sizers.get(kind);
    if (fn) {
      const size = fn(node);
      if (!TITLE_KINDS.has(kind)) return size;
      const data = node.data as { label?: unknown; warnings?: ReadonlyArray<string>; inferred?: { restates?: unknown } };
      const label = typeof data.label === 'string' ? data.label : '';
      const hasWarnings = (data.warnings?.length ?? 0) > 0;
      const height = specNodeHeight(label, VIEW_TUNING.specNodeWidth, hasWarnings, size.height);
      // an inferred node carries a row of words, and a "same as" line when it restates a declared intent
      const extra = data.inferred ? TITLE_TUNING.inferredRowPx + (data.inferred.restates ? TITLE_TUNING.sameAsRowPx : 0) : 0;
      return { width: size.width, height: height + extra };
    }
  }
  if (kind) return getDefaultChromeSize(kind, false);
  return { width: 220, height: 72 };
}
