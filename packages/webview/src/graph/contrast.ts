// lane 17: wcag contrast for a box drawn with an opacity over the canvas. pure, tested.

export type Rgb = readonly [number, number, number];

export function hexRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** a colour drawn at alpha over another */
export function blend(top: Rgb, under: Rgb, alpha: number): Rgb {
  return [0, 1, 2].map((i) => alpha * top[i]! + (1 - alpha) * under[i]!) as unknown as Rgb;
}

function luminance(c: Rgb): number {
  const lin = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** text on a box, both drawn at one opacity over the canvas */
export function contrastAtOpacity(text: Rgb, box: Rgb, canvas: Rgb, opacity: number): number {
  return contrastRatio(blend(text, canvas, opacity), blend(box, canvas, opacity));
}
