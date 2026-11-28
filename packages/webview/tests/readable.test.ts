// lane 17: a first view you can read. the fit floor, the start corner and F twice.
import { describe, expect, it } from 'vitest';

import { nextFitKind, pageFit, type PageFitInput } from '../src/graph/fit-model.js';
import { FIT_TUNING } from '../src/graph/view-tuning.js';

// the spec block measured on this repo (research note): 2126 by 1540 at 0,0
const block = { x: 0, y: 0, width: 2126, height: 1540 };
const input = (over: Partial<PageFitInput> = {}): PageFitInput => ({
  bounds: block,
  canvas: { width: 1440, height: 864 },
  padding: FIT_TUNING.padding,
  maxZoom: FIT_TUNING.maxZoom,
  floor: FIT_TUNING.readableZoom,
  mode: 'readable',
  reserveRight: 0,
  insetPx: FIT_TUNING.startInsetPx,
  ...over,
});

describe('pageFit', () => {
  it('starts at the floor with the top left of the block 24 px in when the block does not fit', () => {
    for (const width of [1440, 700, 480]) {
      const f = pageFit(input({ canvas: { width, height: 800 } }));
      expect(f.viewport.zoom).toBe(0.7);
      expect(f.partial).toBe(true);
      expect(f.viewport.x).toBe(24);
      expect(f.viewport.y).toBe(24);
    }
  });

  it('keeps the floor at 9.1 px for a 13 px title', () => {
    expect(13 * pageFit(input()).viewport.zoom).toBeCloseTo(9.1, 5);
  });

  it('puts the corner of a block that does not start at 0,0 at the inset', () => {
    const f = pageFit(input({ bounds: { x: 100, y: -50, width: 3000, height: 2000 } }));
    expect(f.viewport.x + 100 * f.viewport.zoom).toBeCloseTo(24, 6);
    expect(f.viewport.y - 50 * f.viewport.zoom).toBeCloseTo(24, 6);
  });

  it('changes nothing when the block fits at the floor or more: centred, like react flow', () => {
    const small = { x: 10, y: 20, width: 500, height: 300 };
    const f = pageFit(input({ bounds: small, canvas: { width: 1440, height: 900 } }));
    expect(f.partial).toBe(false);
    expect(f.viewport.zoom).toBe(1.2);
    // react flow: zoom = (width - 2 * floor((w - w / 1.2) / 2)) / box width, centre on the box
    const w = 1440;
    const h = 900;
    const px = Math.floor((w - w / 1.2) * 0.5);
    const py = Math.floor((h - h / 1.2) * 0.5);
    const z = Math.min((w - 2 * px) / 2126, (h - 2 * py) / 1540);
    const big = pageFit(input({ canvas: { width: w, height: h }, floor: 0.3 }));
    expect(big.viewport.zoom).toBeCloseTo(z, 10);
    expect(big.viewport.x).toBeCloseTo(w / 2 - 1063 * z, 6);
    expect(big.viewport.y).toBeCloseTo(h / 2 - 770 * z, 6);
    expect(big.partial).toBe(false);
  });

  it('fits everything down to 0.05 for F, centred', () => {
    const f = pageFit(input({ floor: FIT_TUNING.minZoom, mode: 'all', canvas: { width: 480, height: 760 } }));
    expect(f.viewport.zoom).toBeLessThan(0.7);
    expect(f.viewport.zoom).toBeGreaterThanOrEqual(0.05);
    expect(f.partial).toBe(false);
    // the whole block is inside the canvas
    expect(f.viewport.x).toBeGreaterThanOrEqual(0);
    expect(f.viewport.x + 2126 * f.viewport.zoom).toBeLessThanOrEqual(480);
  });

  it('clamps at 0.05 for a box too big even for that, and says the view is partial', () => {
    const f = pageFit(input({ floor: 0.05, mode: 'all', bounds: { x: 0, y: 0, width: 100000, height: 100000 } }));
    expect(f.viewport.zoom).toBe(0.05);
    expect(f.partial).toBe(true);
  });

  it('leaves the legend width free: the fit centres in what is left', () => {
    const small = { x: 0, y: 0, width: 400, height: 300 };
    const f = pageFit(input({ bounds: small, canvas: { width: 1440, height: 900 }, reserveRight: 340 }));
    const right = f.viewport.x + 400 * f.viewport.zoom;
    expect(right).toBeLessThanOrEqual(1440 - 340);
    expect(f.viewport.x).toBeGreaterThanOrEqual(0);
  });

  it('never divides by a zero size', () => {
    const f = pageFit(input({ bounds: { x: 0, y: 0, width: 0, height: 0 }, canvas: { width: 0, height: 0 } }));
    expect(Number.isFinite(f.viewport.zoom)).toBe(true);
  });
});

describe('nextFitKind', () => {
  it('F fits everything first, a second F goes back to the readable start, a third fits everything again', () => {
    expect(nextFitKind(null, false)).toBe('all');
    expect(nextFitKind('all', false)).toBe('readable');
    expect(nextFitKind('readable', false)).toBe('all');
  });
  it('after the person moved the view F fits everything', () => {
    expect(nextFitKind('all', true)).toBe('all');
  });
});

// part b: say what the state means
import type { Node } from '@xyflow/react';
import { NO_CHECKS_WORDS, glanceCounts, hasLinkedCheck, pendingTitle } from '../src/app/glance-model.js';
import { readFolder } from '../src/transport/graph-json-loader.js';

const spec = (id: string, data: Record<string, unknown>): Node => ({ id, type: 'intent', position: { x: 0, y: 0 }, data: { label: id, ...data } });

describe('checks linked', () => {
  it('a node with nothing in verified_by has no linked check, the bar says so', () => {
    const nodes = [spec('a', { checkStatus: 'pending', statusReasons: ['no verified_by'] }), spec('b', { checkStatus: 'pending', statusReasons: ['no verified_by'] })];
    expect(hasLinkedCheck(nodes[0]!)).toBe(false);
    expect(glanceCounts(nodes).checksLinked).toBe(false);
    expect(NO_CHECKS_WORDS).toBe('no checks linked yet');
  });
  it('one linked test, run or not, shows the counts', () => {
    expect(glanceCounts([spec('a', { checkStatus: 'pending', statusReasons: ['tests not run yet'] })]).checksLinked).toBe(true);
    expect(glanceCounts([spec('a', { checkStatus: 'verified' })]).checksLinked).toBe(true);
    expect(glanceCounts([spec('a', { checkStatus: 'failed', statusReasons: ['t.test.ts: failed'] })]).checksLinked).toBe(true);
  });
  it('a proposal never counts as linked', () => {
    expect(hasLinkedCheck(spec('inferred:x', { checkStatus: 'verified', inferred: { id: 'x', confidence: 'inferred' } }))).toBe(false);
  });
});

describe('pendingTitle', () => {
  it('says what pending means and what would change it', () => {
    expect(pendingTitle(['no verified_by'])).toMatch(/no test is linked.*verified_by/);
    expect(pendingTitle(['tests not run yet'])).toMatch(/not run yet/);
    expect(pendingTitle(['t.test.ts: skipped'])).toMatch(/t\.test\.ts: skipped/);
    expect(pendingTitle(undefined)).toMatch(/^Pending: /);
  });
});

describe('readFolder', () => {
  it('takes a last segment, never a path', () => {
    expect(readFolder({ folder: 'intent-graph' })).toBe('intent-graph');
    expect(readFolder({ folder: 'a/b' })).toBeNull();
    expect(readFolder({ folder: `a${String.fromCharCode(92)}b` })).toBeNull();
    expect(readFolder({})).toBeNull();
    expect(readFolder(null)).toBeNull();
  });
});

// part c: a planned proposal is readable
import { blend, contrastAtOpacity, contrastRatio, hexRgb } from '../src/graph/contrast.js';
import { PROPOSAL_TUNING } from '../src/graph/view-tuning.js';

describe('planned proposal contrast', () => {
  // the default tokens: text, node surface, canvas (tokens.css), and the proposal header tint
  const text = hexRgb('#d4d4d4');
  const node = hexRgb('#252526');
  const canvas = hexRgb('#1e1e1e');
  const header = blend([167, 139, 250], node, 0.08);
  it('keeps 4.5 to 1 for the title and the words, on the box and on its header', () => {
    for (const box of [node, header]) {
      expect(contrastAtOpacity(text, box, canvas, PROPOSAL_TUNING.plannedOpacity)).toBeGreaterThanOrEqual(PROPOSAL_TUNING.minContrast);
      expect(contrastAtOpacity(text, box, canvas, PROPOSAL_TUNING.plannedOpacity * PROPOSAL_TUNING.wordOpacity)).toBeGreaterThanOrEqual(PROPOSAL_TUNING.minContrast);
    }
  });
  it('is still fainter than a proposal whose code works', () => {
    expect(PROPOSAL_TUNING.plannedOpacity).toBeLessThan(1);
  });
  it('the old 0.55 failed it, so the measure means something', () => {
    expect(contrastAtOpacity(text, node, canvas, 0.55)).toBeLessThan(4.5);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });
});

// part d: narrow
import { freeArea, viewToClearPanel } from '../src/graph/keep-in-view.js';
import { CHECK_STATES, GLANCE_STATES, shownStates } from '../src/app/glance-model.js';
import { PANEL_TUNING } from '../src/graph/view-tuning.js';

describe('the sheet at the foot', () => {
  const canvas = { width: 480, height: 700 };
  it('leaves the top half free, above the sheet', () => {
    const free = freeArea(canvas, true, true);
    expect(free.y + free.height).toBeLessThanOrEqual(canvas.height * (1 - PANEL_TUNING.sheetShare));
    expect(free.width).toBe(480 - 2 * PANEL_TUNING.pad);
  });
  it('brings a node under the sheet up into the free part', () => {
    const node = { x: 0, y: 600, width: 300, height: 80 };
    const v = viewToClearPanel(node, { x: 0, y: 0, zoom: 1 }, canvas, true);
    expect(v).not.toBeNull();
    const top = node.y * v!.zoom + v!.y;
    expect(top + node.height * v!.zoom).toBeLessThanOrEqual(canvas.height * (1 - PANEL_TUNING.sheetShare));
  });
  it('the side panel is unchanged', () => {
    expect(freeArea(canvas, true)).toEqual(freeArea(canvas, true, false));
  });
});

describe('shownStates', () => {
  const counts = Object.fromEntries(GLANCE_STATES.map((s) => [s, 0])) as Record<(typeof GLANCE_STATES)[number], number>;
  counts.pending = 3;
  it('a compact bar folds zero counts away, a wide one keeps them', () => {
    expect(shownStates(CHECK_STATES, counts, true)).toEqual(['pending']);
    expect(shownStates(CHECK_STATES, counts, false)).toEqual(['verified', 'failed', 'pending']);
  });
});
