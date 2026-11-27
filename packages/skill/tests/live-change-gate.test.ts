// the watcher only rebuilds when content really changed, and batches saves.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentHashGate, ChangeBatcher, pickWindow } from '../src/live/change-gate.js';

describe('ContentHashGate', () => {
  it('passes the first sight and real edits, blocks identical rewrites', () => {
    const g = new ContentHashGate();
    expect(g.changed('a.md', 'one')).toBe(true);
    expect(g.changed('a.md', 'one')).toBe(false);
    expect(g.changed('a.md', 'two')).toBe(true);
    expect(g.changed('b.md', 'two')).toBe(true);
  });

  it('can be primed so the first event after start is judged against disk', () => {
    const g = new ContentHashGate();
    g.prime('a.md', 'one');
    expect(g.changed('a.md', 'one')).toBe(false);
  });

  it('treats a removed file as a change once', () => {
    const g = new ContentHashGate();
    g.prime('a.md', 'one');
    expect(g.removed('a.md')).toBe(true);
    expect(g.removed('a.md')).toBe(false);
    expect(g.changed('a.md', 'one')).toBe(true);
  });
});

describe('pickWindow', () => {
  const t = { quietMs: 300, burstMs: 2000, burstFiles: 5 };
  it('uses the quiet window for a few files and the burst window for many', () => {
    expect(pickWindow(1, t)).toBe(300);
    expect(pickWindow(5, t)).toBe(300);
    expect(pickWindow(6, t)).toBe(2000);
  });
});

describe('ChangeBatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const t = { quietMs: 300, burstMs: 2000, burstFiles: 2 };

  it('flushes one batch after the quiet window, with every path once', () => {
    const flush = vi.fn();
    const b = new ChangeBatcher(t, flush);
    b.add('a');
    vi.advanceTimersByTime(200);
    b.add('a');
    b.add('b');
    vi.advanceTimersByTime(299);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
    expect([...flush.mock.calls[0]![0]].sort()).toEqual(['a', 'b']);
  });

  it('waits the burst window once the batch is large', () => {
    const flush = vi.fn();
    const b = new ChangeBatcher(t, flush);
    b.add('a');
    b.add('b');
    b.add('c');
    vi.advanceTimersByTime(1999);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('drops pending work on stop', () => {
    const flush = vi.fn();
    const b = new ChangeBatcher(t, flush);
    b.add('a');
    b.stop();
    vi.advanceTimersByTime(5000);
    expect(flush).not.toHaveBeenCalled();
  });
});
