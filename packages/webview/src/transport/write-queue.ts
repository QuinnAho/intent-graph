// every write the page sends goes through one line, so an action taken while another is
// still being saved waits its turn and then runs. the server keeps the same order.

export interface WriteQueue {
  run<T>(job: () => Promise<T>): Promise<T>;
}

export function createWriteQueue(): WriteQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(job: () => Promise<T>): Promise<T> {
      const result = tail.then(job);
      // a failed job belongs to its own caller, the line moves on
      tail = result.catch(() => undefined);
      return result;
    },
  };
}

export const pageWrites = createWriteQueue();
