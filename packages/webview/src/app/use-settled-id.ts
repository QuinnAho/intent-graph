import { useEffect, useState } from 'react';
import { useUiStore } from '../store/ui-slice.js';
import { PANEL_TUNING } from '../graph/view-tuning.js';

// a newly picked id is held back for the double-click window, so the panel and the pan do not
// move what is under the pointer between the two clicks. null shows at once. while a rename
// field is open the id waits, so the panel does not move the node under the field.
export function useSettledId(id: string | null): string | null {
  const [settled, setSettled] = useState<string | null>(id);
  useEffect(() => {
    if (id === null) {
      setSettled(null);
      return undefined;
    }
    if (id === settled) return undefined;
    // a pick from the right-click menu is not the first click of a double-click
    if (useUiStore.getState().menu !== null) {
      setSettled(id);
      return undefined;
    }
    let timer = 0;
    const arm = (): void => {
      timer = window.setTimeout(() => {
        if (useUiStore.getState().renameId !== null) arm();
        else setSettled(id);
      }, PANEL_TUNING.doubleClickMs);
    };
    arm();
    return () => window.clearTimeout(timer);
  }, [id, settled]);
  return settled;
}
