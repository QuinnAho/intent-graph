// while a node is held, a graph update waits. the drop is read from the boxes as they were
// drawn when the person picked the node up, not from a layout that moved under the pointer.

import { WIRE_EDIT_TUNING } from './view-tuning.js';

export interface DragHold {
  begin(): void;
  end(): void;
  held(): boolean;
  /** resolves at once when nothing is held, otherwise when the drag ends */
  whenFree(): Promise<void>;
}

export function createDragHold(maxMs: number): DragHold {
  let isHeld = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waiting: Array<() => void> = [];
  const end = (): void => {
    isHeld = false;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const go = waiting;
    waiting = [];
    for (const f of go) f();
  };
  return {
    begin: () => {
      isHeld = true;
      if (timer !== null) clearTimeout(timer);
      // a drag whose end never came must not freeze the page
      timer = setTimeout(end, maxMs);
    },
    end,
    held: () => isHeld,
    whenFree: () => (isHeld ? new Promise<void>((ok) => waiting.push(ok)) : Promise.resolve()),
  };
}

export const dragHold = createDragHold(WIRE_EDIT_TUNING.dragHoldMaxMs);
