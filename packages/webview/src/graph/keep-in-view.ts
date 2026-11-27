// where to move the viewport so the selected node is not under the edit panel.
// pure: the canvas hands in boxes and the current view and gets a view back, or null to leave it.

import { PANEL_TUNING } from './view-tuning.js';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface View {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** free space left of the panel, in screen pixels */
export function freeArea(canvas: { width: number; height: number }, panelOpen: boolean): Box {
  const right = panelOpen ? PANEL_TUNING.width + PANEL_TUNING.margin + PANEL_TUNING.gap : PANEL_TUNING.pad;
  const width = Math.max(1, canvas.width - PANEL_TUNING.pad - right);
  return { x: PANEL_TUNING.pad, y: PANEL_TUNING.pad, width, height: Math.max(1, canvas.height - 2 * PANEL_TUNING.pad) };
}

/** null when the node already sits inside the free area, else the view that centres it there */
export function viewToClearPanel(node: Box, view: View, canvas: { width: number; height: number }): View | null {
  const free = freeArea(canvas, true);
  const left = node.x * view.zoom + view.x;
  const top = node.y * view.zoom + view.y;
  const inside =
    left >= free.x && top >= free.y && left + node.width * view.zoom <= free.x + free.width && top + node.height * view.zoom <= free.y + free.height;
  if (inside) return null;
  const fit = Math.min(free.width / node.width, free.height / node.height);
  const zoom = Math.max(PANEL_TUNING.minZoom, Math.min(view.zoom, fit));
  return {
    zoom,
    x: free.x + free.width / 2 - (node.x + node.width / 2) * zoom,
    y: free.y + free.height / 2 - (node.y + node.height / 2) * zoom,
  };
}
