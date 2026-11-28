// the count of open proposals, in the state bar. a click selects the next one, so a person
// can go through them with Enter and Delete alone. a zero is shown dim, not hidden.

import type { Node } from '@xyflow/react';

import { RobotIcon } from '../graph/nodes/shared/nodeChrome.js';
import { useGraphStore } from '../store/graph-slice.js';
import { GLANCE_TUNING } from './glance-tuning.js';
import { countTitle } from './glance-model.js';
import { selectNextProposal } from './inferred-actions.js';
import { inferredCountLabel, openInferred } from './inferred-model.js';
import { COUNT_BUTTON } from './bar-styles.js';

export function InferredCount(): JSX.Element {
  const count = useGraphStore((s) => openInferred(s.nodes as Node[]).length);
  const zero = count === 0;
  return (
    <span data-inferred-count={count} style={{ display: 'inline-flex' }}>
      <button
        type="button"
        data-bar-count="inferred"
        data-count={count}
        aria-disabled={zero}
        style={{ ...COUNT_BUTTON, border: '1px dashed rgba(167, 139, 250, 0.8)', ...(zero ? { opacity: GLANCE_TUNING.zeroOpacity, cursor: 'default' } : {}) }}
        onClick={zero ? undefined : () => void selectNextProposal()}
        title={zero ? countTitle('inferred', 0) : `${countTitle('inferred', count)} Enter accepts, Delete dismisses.`}
      >
        <RobotIcon size={14} />
        {inferredCountLabel(count)}
      </button>
    </span>
  );
}
