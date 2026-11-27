// how much room a spec node's title needs. pure, so the layout and the tests share it.

import { TITLE_TUNING } from '../view-tuning.js';

/** lines a title takes when wrapped at word breaks into `widthPx`, a long word breaks too */
export function titleLines(label: string, widthPx: number): number {
  const perLine = Math.max(1, Math.floor(widthPx / TITLE_TUNING.charPx));
  const words = label.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return 1;
  let lines = 1;
  let used = 0;
  for (const word of words) {
    let len = word.length;
    if (len > perLine) {
      // a word longer than a line fills whole lines on its own
      if (used > 0) lines += 1;
      lines += Math.ceil(len / perLine) - 1;
      used = len % perLine === 0 ? perLine : len % perLine;
      continue;
    }
    if (used === 0) used = len;
    else if (used + 1 + len <= perLine) used += 1 + len;
    else {
      lines += 1;
      used = len;
    }
  }
  return lines;
}

/** width left for the title text in a node `nodeWidth` wide */
export function titleWidth(nodeWidth: number, hasWarnings: boolean): number {
  const marks = TITLE_TUNING.statusMarkPx + TITLE_TUNING.driftMarkPx + (hasWarnings ? TITLE_TUNING.warningMarkPx : 0);
  return nodeWidth - TITLE_TUNING.headerChrome - marks;
}

/** height of a spec node: the base height, plus a line for each extra title line */
export function specNodeHeight(label: string, nodeWidth: number, hasWarnings: boolean, minHeight: number): number {
  const lines = titleLines(label, titleWidth(nodeWidth, hasWarnings));
  return Math.max(minHeight, TITLE_TUNING.baseHeight + (lines - 1) * TITLE_TUNING.lineHeight);
}
