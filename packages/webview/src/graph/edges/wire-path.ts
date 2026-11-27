// the wire shape. a cubic from the source pin (east side) to the target pin (west side)
// with both control points level with their pin, so a wire always leaves right and
// enters left. same family as react flow's getBezierPath, with own offsets.

export interface WireShape {
  readonly forwardMin: number;
  readonly forwardMax: number;
  readonly backBase: number;
  readonly backMin: number;
  readonly backMax: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** horizontal distance from each pin to its control point. dx is target x minus source x. */
export function wireOffset(dx: number, t: WireShape): number {
  if (dx >= 0) return clamp(dx / 2, t.forwardMin, t.forwardMax);
  return clamp(t.backBase + -dx / 4, t.backMin, t.backMax);
}

const r = (v: number): number => Math.round(v * 100) / 100;

export function wirePath(sx: number, sy: number, tx: number, ty: number, t: WireShape): { path: string; labelX: number; labelY: number } {
  const c = wireOffset(tx - sx, t);
  const path = `M${r(sx)},${r(sy)} C${r(sx + c)},${r(sy)} ${r(tx - c)},${r(ty)} ${r(tx)},${r(ty)}`;
  // the curve's middle at t = 0.5
  return { path, labelX: r((sx + tx) / 2), labelY: r((sy + ty) / 2) };
}
