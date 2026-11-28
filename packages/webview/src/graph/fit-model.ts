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

/** F fits, unless the focus is in a text field or a modifier is held */
export function isFitKey(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }, typing: boolean): boolean {
  if (typing || e.ctrlKey === true || e.metaKey === true || e.altKey === true) return false;
  return e.key === 'f' || e.key === 'F';
}
