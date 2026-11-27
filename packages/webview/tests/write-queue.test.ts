// an action taken while another is still being saved waits its turn and then runs, in order.
// and a graph update never lands under a node that is being held, or the box the person
// aimed at has moved by the time the node is let go.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDragHold } from '../src/graph/drag-hold.js';
import { createWriteQueue } from '../src/transport/write-queue.js';

describe('write queue', () => {
  it('runs a job only after the one before it is done, in the order they were taken', async () => {
    const q = createWriteQueue();
    const log: string[] = [];
    let release = (): void => {};
    const slow = q.run(async () => {
      log.push('rename start');
      await new Promise<void>((r) => (release = r));
      log.push('rename end');
      return 'a';
    });
    const next = q.run(async () => {
      log.push('move start');
      return 'b';
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual(['rename start']);
    release();
    expect(await slow).toBe('a');
    expect(await next).toBe('b');
    expect(log).toEqual(['rename start', 'rename end', 'move start']);
  });

  it('keeps going after a job fails, and hands the failure to its own caller only', async () => {
    const q = createWriteQueue();
    const bad = q.run(async () => {
      throw new Error('boom');
    });
    const good = q.run(async () => 'ok');
    await expect(bad).rejects.toThrow('boom');
    expect(await good).toBe('ok');
  });
});

describe('drag hold', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is free until a drag starts, holds while it lasts and frees everyone waiting when it ends', async () => {
    const h = createDragHold(10_000);
    let freed = 0;
    await h.whenFree();
    h.begin();
    expect(h.held()).toBe(true);
    const a = h.whenFree().then(() => freed++);
    const b = h.whenFree().then(() => freed++);
    await Promise.resolve();
    expect(freed).toBe(0);
    h.end();
    await Promise.all([a, b]);
    expect(freed).toBe(2);
    expect(h.held()).toBe(false);
  });

  it('lets go by itself when the end of a drag never comes', async () => {
    const h = createDragHold(5_000);
    h.begin();
    const waiting = h.whenFree();
    vi.advanceTimersByTime(5_001);
    await waiting;
    expect(h.held()).toBe(false);
  });
});
