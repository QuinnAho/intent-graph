import { afterEach, describe, expect, it, vi } from 'vitest';

import { openInEditor, startShellBridge } from '../src/transport/shell-bridge.js';
import { useGraphStore } from '../src/store/graph-slice.js';

function layOut(count: number): void {
  const nodes = Array.from({ length: count }, (_, i) => ({ id: `n${i}`, position: { x: 0, y: 0 }, data: {} }));
  useGraphStore.getState().setGraph(nodes, []);
  useGraphStore.getState().setLayoutReady(true);
}

// a window whose parent is another window, the way the page sits in the editor panel's iframe
function framedWindow(): { win: Window; post: ReturnType<typeof vi.fn> } {
  const post = vi.fn();
  const parent = { postMessage: post };
  const win = { parent } as unknown as Window;
  return { win, post };
}

afterEach(() => {
  useGraphStore.setState({ nodes: [], edges: [], status: 'idle', errorMessage: null, layoutReady: false });
});

describe('shell bridge', () => {
  it('does nothing with no parent window', () => {
    const spy = vi.spyOn(window, 'postMessage');
    const stop = startShellBridge(window);
    layOut(4);
    expect(openInEditor('src/math.ts', 3, window)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    stop();
    spy.mockRestore();
  });

  it('says ready once, with the node count, after the layout', () => {
    const { win, post } = framedWindow();
    const stop = startShellBridge(win);
    useGraphStore.getState().setGraph([{ id: 'a', position: { x: 0, y: 0 }, data: {} }], []);
    expect(post).not.toHaveBeenCalled();
    layOut(6);
    layOut(7);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({ type: 'intentgraph.ready', nodes: 6 }, '*');
    stop();
  });

  it('says ready at once when the layout was done before it started', () => {
    layOut(5);
    const { win, post } = framedWindow();
    const stop = startShellBridge(win);
    expect(post).toHaveBeenCalledWith({ type: 'intentgraph.ready', nodes: 5 }, '*');
    stop();
  });

  it('asks the shell to open a file', () => {
    const { win, post } = framedWindow();
    expect(openInEditor('src/math.ts', 3, win)).toBe(true);
    expect(post).toHaveBeenCalledWith({ type: 'intentgraph.open', path: 'src/math.ts', line: 3 }, '*');
    expect(openInEditor('src/greet.ts', undefined, win)).toBe(true);
    expect(post).toHaveBeenLastCalledWith({ type: 'intentgraph.open', path: 'src/greet.ts' }, '*');
  });
});
