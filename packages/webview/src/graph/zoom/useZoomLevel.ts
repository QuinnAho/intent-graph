// Lifted from claudemap/app/src/hooks/useZoomLevel.js @ claudemap@vendored.
// Adapted: TS strict, three-tier output preserved (overview/mid/detail) but the
// thresholds are configurable per call. In ClaudeMap the tiers map to graph
// density; in IntentGraph they map to audiences (overview = stakeholder /
// architect, mid = developer scanning intents, detail = developer editing a
// specific node). License: MIT (see /claudemap/LICENSE).
// See LIFT_LOG.md for the full lift record.

import { useCallback, useState } from 'react';
import type { Viewport } from '@xyflow/react';

export type ZoomLevel = 'overview' | 'mid' | 'detail';

export interface ZoomTierDefinitions {
  /** Zoom strictly below this is `overview`. */
  overviewBelow: number;
  /** Zoom at or above `overviewBelow` and strictly below this is `mid`. */
  midBelow: number;
}

const DEFAULT_TIERS: ZoomTierDefinitions = {
  // IntentGraph defaults: a wider overview tier than ClaudeMap because the
  // intent graph tends to be denser at the top and structurally rich.
  overviewBelow: 0.6,
  midBelow: 1.5,
};

export function classifyZoom(zoom: number, tiers: ZoomTierDefinitions = DEFAULT_TIERS): ZoomLevel {
  if (zoom < tiers.overviewBelow) return 'overview';
  if (zoom < tiers.midBelow) return 'mid';
  return 'detail';
}

export function useZoomLevel(tiers: ZoomTierDefinitions = DEFAULT_TIERS): {
  zoomLevel: ZoomLevel;
  onViewportChange: (viewport: Viewport) => void;
} {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('overview');

  const onViewportChange = useCallback(
    (viewport: Viewport): void => {
      const next = classifyZoom(viewport.zoom, tiers);
      setZoomLevel((prev) => (prev === next ? prev : next));
    },
    [tiers],
  );

  return { zoomLevel, onViewportChange };
}
