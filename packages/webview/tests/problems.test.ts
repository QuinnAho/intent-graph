// the page reads the problems list from graph.json and labels it without colour.
import { describe, expect, it } from 'vitest';

import { problemsLabel, readProblems } from '../src/store/problems.js';

describe('readProblems', () => {
  it('reads well formed entries and drops malformed ones', () => {
    expect(
      readProblems({ problems: [{ severity: 'error', file: 'spec/a.md', message: 'bad yaml' }, { file: 3 }, 'x'] }),
    ).toEqual([{ severity: 'error', file: 'spec/a.md', message: 'bad yaml' }]);
  });

  it('is empty when the envelope has no problems field, as the static graph.json does', () => {
    expect(readProblems({})).toEqual([]);
  });

  it('treats an unknown severity as a warning', () => {
    expect(readProblems({ problems: [{ severity: 'odd', file: 'a', message: 'm' }] })[0]!.severity).toBe('warning');
  });
});

describe('problemsLabel', () => {
  it('says the count in words', () => {
    expect(problemsLabel([])).toBe('');
    expect(problemsLabel([{ severity: 'error', file: 'a', message: 'm' }])).toBe('1 problem');
    expect(problemsLabel([{ severity: 'error', file: 'a', message: 'm' }, { severity: 'warning', file: 'b', message: 'm' }])).toBe('2 problems');
  });
});
