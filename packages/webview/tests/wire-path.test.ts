// the blueprint wire: leaves east, enters west, horizontal tangents at both pins.
import { describe, expect, it } from 'vitest';

import { wireOffset, wirePath } from '../src/graph/edges/wire-path.js';

const t = { forwardMin: 40, forwardMax: 220, backBase: 60, backMin: 60, backMax: 240 };

describe('wireOffset', () => {
  it('uses half the run going forward, held between the limits', () => {
    expect(wireOffset(200, t)).toBe(100);
    expect(wireOffset(20, t)).toBe(40);
    expect(wireOffset(1000, t)).toBe(220);
  });

  it('loops wider the further back the wire goes', () => {
    expect(wireOffset(-40, t)).toBe(70);
    expect(wireOffset(-0.001, t)).toBeCloseTo(60);
    expect(wireOffset(-4000, t)).toBe(240);
  });
});

describe('wirePath', () => {
  it('draws a cubic with control points level with each pin', () => {
    const w = wirePath(0, 20, 150, 100, t);
    expect(w.path).toBe('M0,20 C75,20 75,100 150,100');
    expect(w.labelX).toBe(75);
    expect(w.labelY).toBe(60);
  });

  it('goes straight when both pins sit on one row', () => {
    expect(wirePath(0, 50, 300, 50, t).path).toBe('M0,50 C150,50 150,50 300,50');
  });

  it('leaves east and enters west on a backward wire', () => {
    const w = wirePath(300, 0, 100, 80, t);
    expect(w.path).toBe('M300,0 C410,0 -10,80 100,80');
  });
});
