// fitting again when the canvas changes size (lane 12). pure rule, the glue is in GraphCanvas.

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface RefitInput {
  /** the canvas size at the last fit, null before the first one */
  readonly last: Size | null;
  readonly now: Size;
  /** the person panned or zoomed since the last fit */
  readonly moved: boolean;
  readonly thresholdPx: number;
}

export function shouldRefit(s: RefitInput): boolean {
  if (s.moved || s.now.width <= 0 || s.now.height <= 0) return false;
  if (s.last === null) return true;
  return Math.abs(s.now.width - s.last.width) > s.thresholdPx || Math.abs(s.now.height - s.last.height) > s.thresholdPx;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface PageFitInput {
  /** the box of the nodes to fit, graph px */
  readonly bounds: Rect;
  readonly canvas: Size;
  /** react flow's ratio padding: 0.2 leaves 1/1.2 of each side usable */
  readonly padding: number;
  readonly maxZoom: number;
  /** the smallest zoom this fit may take */
  readonly floor: number;
  /** readable: under the floor, start at the top left. all: clamp and centre, like react flow */
  readonly mode: 'readable' | 'all';
  /** screen px at the right a layer covers, the legend. the fit leaves it free */
  readonly reserveRight: number;
  readonly insetPx: number;
}
export interface PageFit {
  readonly viewport: Viewport;
  /** the view holds only part of the box */
  readonly partial: boolean;
}

// same rounding as react flow's parsePadding, so a fit that fits is the one it always was
const padPx = (ratio: number, side: number): number => Math.floor((side - side / (1 + ratio)) * 0.5);

/** lane 17: the view a fit by the page or by F takes. pure, the glue is in GraphCanvas. */
export function pageFit(s: PageFitInput): PageFit {
  const width = Math.max(1, s.canvas.width - Math.max(0, s.reserveRight));
  const height = Math.max(1, s.canvas.height);
  const bw = Math.max(1, s.bounds.width);
  const bh = Math.max(1, s.bounds.height);
  const px = padPx(s.padding, width);
  const py = padPx(s.padding, height);
  const fitZoom = Math.min((width - 2 * px) / bw, (height - 2 * py) / bh, s.maxZoom);
  if (fitZoom < s.floor && s.mode === 'readable') {
    const zoom = s.floor;
    return { viewport: { x: s.insetPx - s.bounds.x * zoom, y: s.insetPx - s.bounds.y * zoom, zoom }, partial: true };
  }
  const zoom = Math.max(fitZoom, s.floor);
  const cx = s.bounds.x + bw / 2;
  const cy = s.bounds.y + bh / 2;
  return { viewport: { x: width / 2 - cx * zoom, y: height / 2 - cy * zoom, zoom }, partial: fitZoom < s.floor };
}

/** what F does: everything, unless the last F fitted everything and nothing moved since, then the readable start */
export function nextFitKind(last: 'all' | 'readable' | null, movedSince: boolean): 'all' | 'readable' {
  return last === 'all' && !movedSince ? 'readable' : 'all';
}

/** F fits, unless the focus is in a text field or a modifier is held */
export function isFitKey(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }, typing: boolean): boolean {
  if (typing || e.ctrlKey === true || e.metaKey === true || e.altKey === true) return false;
  return e.key === 'f' || e.key === 'F';
}
