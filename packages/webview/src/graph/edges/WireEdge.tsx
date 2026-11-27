// one wire for every edge kind: out pin (east) to in pin (west), coloured by kind,
// dashed only for supersedes, no arrowheads. thicker on hover, and when an end is
// selected or hovered.
import { BaseEdge, useStore, type EdgeProps } from '@xyflow/react';
import { useContext, useState } from 'react';

import { WIRE_COLORS, WIRE_DEFAULT_COLOR, WIRE_TUNING } from '../view-tuning.js';
import { HoverNodeContext } from './wire-context.js';
import { wirePath } from './wire-path.js';

export function wireStyle(kind: string): { color: string; dash: string | undefined } {
  return { color: WIRE_COLORS[kind] ?? WIRE_DEFAULT_COLOR, dash: kind === 'supersedes' ? WIRE_TUNING.dash : undefined };
}

export function WireEdge(props: EdgeProps): JSX.Element {
  const { id, source, target, sourceX, sourceY, targetX, targetY, selected } = props;
  const kind = String((props.data as { kind?: unknown } | undefined)?.kind ?? 'references');
  const { color, dash } = wireStyle(kind);
  const hoverNode = useContext(HoverNodeContext);
  // boolean result, so panning does not rerender every wire
  const endSelected = useStore((s) => s.nodeLookup.get(source)?.selected === true || s.nodeLookup.get(target)?.selected === true);
  const [hover, setHover] = useState(false);
  const lit = hover || selected === true || endSelected || hoverNode === source || hoverNode === target;
  const { path } = wirePath(sourceX, sourceY, targetX, targetY, WIRE_TUNING);
  return (
    <g data-wire-kind={kind} data-wire-src={source} data-wire-dst={target} data-wire-selected={selected === true ? 'true' : 'false'} data-wire-lit={lit ? 'true' : 'false'} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={WIRE_TUNING.hitWidth}
        style={{
          stroke: color,
          strokeWidth: lit ? WIRE_TUNING.hoverStroke : WIRE_TUNING.stroke,
          strokeOpacity: lit ? 1 : WIRE_TUNING.opacity,
          ...(dash ? { strokeDasharray: dash } : {}),
        }}
      />
    </g>
  );
}
