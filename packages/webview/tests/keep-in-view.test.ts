// the graph keeps the selected node clear of the edit panel.
import { describe, expect, it } from 'vitest';

import { freeArea, viewToClearPanel, type Box } from '../src/graph/keep-in-view.js';

const canvas = { width: 1280, height: 800 };
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const screen = (n: Box, v: { x: number; y: number; zoom: number }): Box => ({ x: n.x * v.zoom + v.x, y: n.y * v.zoom + v.y, width: n.width * v.zoom, height: n.height * v.zoom });
const panel: Box = { x: 1280 - 380 - 12, y: 12, width: 380, height: 776 };

describe('viewToClearPanel', () => {
  it('leaves the view alone when the node is already in the free area', () => {
    expect(viewToClearPanel({ x: 100, y: 100, width: 300, height: 60 }, { x: 0, y: 0, zoom: 1 }, canvas)).toBeNull();
  });

  it('moves a node that sits under the panel so the two do not overlap', () => {
    const node = { x: 900, y: 300, width: 300, height: 60 };
    const v = viewToClearPanel(node, { x: 0, y: 0, zoom: 1 }, canvas);
    expect(v).not.toBeNull();
    expect(overlaps(screen(node, v!), panel)).toBe(false);
  });

  it('zooms out for a node wider than the free area, and never zooms in', () => {
    const node = { x: 0, y: 0, width: 1400, height: 600 };
    const v = viewToClearPanel(node, { x: 0, y: 0, zoom: 1 }, canvas)!;
    expect(v.zoom).toBeLessThan(1);
    const s = screen(node, v);
    expect(overlaps(s, panel)).toBe(false);
    expect(s.x).toBeGreaterThanOrEqual(freeArea(canvas, true).x - 0.001);
    expect(viewToClearPanel({ x: 1800, y: 300, width: 100, height: 40 }, { x: 0, y: 0, zoom: 0.5 }, canvas)!.zoom).toBe(0.5);
  });
});
