// a title of up to 40 characters is shown in full, and the layout height follows the title.
import { describe, expect, it } from 'vitest';

import { specNodeHeight, titleLines, titleWidth } from '../src/graph/layout/title-room.js';
import { TITLE_TUNING, VIEW_TUNING } from '../src/graph/view-tuning.js';

describe('titleLines', () => {
  it('counts one line for a short title and wraps at word breaks', () => {
    expect(titleLines('Short', 200)).toBe(1);
    expect(titleLines('aaaa bbbb cccc dddd', 80)).toBe(2);
    expect(titleLines('', 100)).toBe(1);
  });

  it('breaks a word longer than the line', () => {
    expect(titleLines('x'.repeat(40), 80)).toBeGreaterThanOrEqual(4);
  });
});

describe('specNodeHeight', () => {
  const width = VIEW_TUNING.specNodeWidth;

  it('fits a 40 character title in two lines at the spec node width, with every mark', () => {
    const title = 'Adding two numbers returns the exact sum';
    expect(title.length).toBe(40);
    expect(titleLines(title, titleWidth(width, false))).toBeLessThanOrEqual(2);
  });

  it('grows with the title and never goes under the minimum', () => {
    const one = specNodeHeight('Short', width, false, 76);
    const two = specNodeHeight(`${'w'.repeat(30)} ${'w'.repeat(10)}`, width, false, 76);
    expect(one).toBe(76);
    expect(two).toBe(TITLE_TUNING.baseHeight + TITLE_TUNING.lineHeight);
    expect(specNodeHeight('Short', width, false, 120)).toBe(120);
  });

  it('reserves more room when the node has warnings', () => {
    expect(titleWidth(width, true)).toBeLessThan(titleWidth(width, false));
  });
});
