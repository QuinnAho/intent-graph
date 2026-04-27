// Lifted from claudemap/app/src/lib/layoutEngine.js @ claudemap@vendored.
// Adapted: TS strict, message-passing wrapper around the off-main-thread ELK
// worker (claudemap ran ELK on the main thread). Public API is a single
// `runLayout(nodes, edges, options)` returning a positions array.
// License: MIT (see /claudemap/LICENSE). See LIFT_LOG.md for the full lift record.

import {
  type LayoutEdgeInput,
  type LayoutNodeInput,
  type LayoutOptions,
  type LayoutPosition,
  type LayoutWorkerRequest,
  type LayoutWorkerResponse,
} from './layout-protocol.js';

export type { LayoutEdgeInput, LayoutNodeInput, LayoutOptions, LayoutPosition };

let workerSingleton: Worker | null = null;
let pendingId = 0;
const pending = new Map<
  string,
  { resolve: (positions: LayoutPosition[]) => void; reject: (err: Error) => void }
>();

function getWorker(): Worker {
  if (workerSingleton) return workerSingleton;
  // Vite resolves this via `new URL(..., import.meta.url)` and bundles the worker
  // separately. The `{ type: 'module' }` opt-in is required for ESM workers.
  workerSingleton = new Worker(new URL('./elk.worker.ts', import.meta.url), {
    type: 'module',
  });
  workerSingleton.addEventListener('message', (event: MessageEvent<LayoutWorkerResponse>) => {
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    if (event.data.error !== undefined) {
      entry.reject(new Error(event.data.error));
      return;
    }
    entry.resolve(event.data.positions);
  });
  return workerSingleton;
}

function nextId(): string {
  pendingId += 1;
  return `layout_${pendingId.toString(36)}`;
}

export function runLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  options?: LayoutOptions,
): Promise<LayoutPosition[]> {
  const worker = getWorker();
  const id = nextId();
  const request: LayoutWorkerRequest = options !== undefined
    ? { id, nodes, edges, options }
    : { id, nodes, edges };
  return new Promise<LayoutPosition[]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage(request);
  });
}

export function disposeLayoutWorker(): void {
  if (workerSingleton) {
    workerSingleton.terminate();
    workerSingleton = null;
  }
  for (const entry of pending.values()) {
    entry.reject(new Error('Layout worker disposed before request completed.'));
  }
  pending.clear();
}
