// Original to IntentGraph (no ClaudeMap analog). Extracts the visual vocabulary
// shared across SystemNode/FileNode/FunctionNode in claudemap into a single
// composable component. The eight IntentGraph node kinds compose <NodeChrome>
// plus their per-kind body. This is the "chrome, health backgrounds, dim/ghost/
// highlight states, hidden handles" surface called out in the lift plan.

import { Handle, Position } from '@xyflow/react';
import { CircleCheck, CircleDashed, CircleX, TriangleAlert } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { getNodeIcon, type NodeKind } from '../nodeIcons.js';

export type NodeHealth = 'green' | 'yellow' | 'red';
export type NodeHighlight = 'none' | 'subtle' | 'lead';
/** check status from verified_by, per adr 0030 */
export type CheckStatus = 'verified' | 'failed' | 'pending';

export interface NodeChromeData {
  /** Node kind drives the icon + default sizing. */
  kind: NodeKind;
  /** Single-line label rendered in the header. */
  label: string;
  /** Body content rendered under the header. */
  body?: ReactNode;
  /** Optional health pip; absence means no pip. */
  health?: NodeHealth;
  /** Whether the surface tints to reflect health. */
  healthOverlay?: boolean;
  /** Selection / highlight state — drives border + shadow. */
  highlight?: NodeHighlight;
  isSelected?: boolean;
  /** Visibility states — drive opacity. */
  isDimmed?: boolean;
  isGhosted?: boolean;
  /** Check status of a spec node. Absence means no mark (code nodes). */
  checkStatus?: CheckStatus;
  /** Anchor warnings for this node, shown as a count with the text on hover. */
  warnings?: ReadonlyArray<string>;
  /** Hide the four React Flow handles. Default true; only edges in IntentGraph. */
  handlesHidden?: boolean;
}

const HIDDEN_HANDLE_STYLE: CSSProperties = { opacity: 0, pointerEvents: 'none' };

const HEALTH_BACKGROUND: Record<NodeHealth, string> = {
  green: 'rgba(63, 185, 80, 0.05)',
  yellow: 'rgba(210, 153, 34, 0.08)',
  red: 'rgba(248, 81, 73, 0.10)',
};

const HEALTH_PIP: Record<NodeHealth, string> = {
  green: 'transparent',
  yellow: '#d29922',
  red: '#f85149',
};

// icon, word and colour together, so the mark reads without colour
const CHECK_MARK: Record<CheckStatus, { Icon: typeof CircleCheck; color: string; border: string }> = {
  verified: { Icon: CircleCheck, color: '#3fb950', border: 'rgba(63, 185, 80, 0.55)' },
  failed: { Icon: CircleX, color: '#f85149', border: 'rgba(248, 81, 73, 0.65)' },
  pending: { Icon: CircleDashed, color: 'var(--ig-text-muted, #8b949e)', border: 'var(--ig-edge)' },
};

export function StatusMark(props: { status: CheckStatus }): JSX.Element {
  const { Icon, color, border } = CHECK_MARK[props.status];
  return (
    <span
      data-check-status={props.status}
      aria-label={`checks ${props.status}`}
      title={`checks ${props.status}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 7px 2px 5px',
        borderRadius: '999px',
        border: `1px solid ${border}`,
        color,
        fontSize: '11px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <Icon size={13} strokeWidth={props.status === 'failed' ? 2.6 : 2.2} />
      {props.status}
    </span>
  );
}

function WarningMark(props: { warnings: ReadonlyArray<string> }): JSX.Element {
  return (
    <span
      data-warnings={props.warnings.length}
      title={props.warnings.join('\n')}
      aria-label={`${props.warnings.length} anchor warnings`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#d29922', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}
    >
      <TriangleAlert size={13} />
      {props.warnings.length}
    </span>
  );
}

function pickSurface(data: NodeChromeData): string {
  if (data.healthOverlay && data.health) {
    return HEALTH_BACKGROUND[data.health];
  }
  if (data.highlight === 'lead') return 'rgba(120, 169, 255, 0.08)';
  if (data.highlight === 'subtle') return 'rgba(255, 255, 255, 0.012)';
  return 'var(--ig-node)';
}

function pickBorder(data: NodeChromeData): string {
  if (data.isSelected) return 'rgba(120, 169, 255, 0.7)';
  if (data.highlight === 'lead') return 'rgba(120, 169, 255, 0.42)';
  if (data.highlight === 'subtle') return 'rgba(255, 255, 255, 0.07)';
  return 'var(--ig-edge)';
}

function pickOpacity(data: NodeChromeData): number {
  if (data.isGhosted) return 0.1;
  if (data.isDimmed) return 0.42;
  return 1;
}

function HiddenHandles(): JSX.Element {
  return (
    <>
      <Handle id="target-top" type="target" position={Position.Top} style={HIDDEN_HANDLE_STYLE} />
      <Handle id="source-top" type="source" position={Position.Top} style={HIDDEN_HANDLE_STYLE} />
      <Handle
        id="target-right"
        type="target"
        position={Position.Right}
        style={HIDDEN_HANDLE_STYLE}
      />
      <Handle
        id="source-right"
        type="source"
        position={Position.Right}
        style={HIDDEN_HANDLE_STYLE}
      />
      <Handle
        id="target-bottom"
        type="target"
        position={Position.Bottom}
        style={HIDDEN_HANDLE_STYLE}
      />
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        style={HIDDEN_HANDLE_STYLE}
      />
      <Handle
        id="target-left"
        type="target"
        position={Position.Left}
        style={HIDDEN_HANDLE_STYLE}
      />
      <Handle
        id="source-left"
        type="source"
        position={Position.Left}
        style={HIDDEN_HANDLE_STYLE}
      />
    </>
  );
}

export function NodeChrome(props: { data: NodeChromeData }): JSX.Element {
  const { data } = props;
  const Icon = getNodeIcon(data.kind);
  const surface = pickSurface(data);
  const border = pickBorder(data);
  const opacity = pickOpacity(data);
  const showPip = data.health !== undefined && data.health !== 'green';
  const showHandles = data.handlesHidden !== false;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {showHandles ? <HiddenHandles /> : null}
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: surface,
          border: `1px solid ${border}`,
          borderRadius: '12px',
          boxShadow: data.isSelected
            ? '0 10px 24px rgba(120, 169, 255, 0.14)'
            : '0 2px 8px rgba(0, 0, 0, 0.30)',
          opacity,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'opacity 180ms ease, box-shadow 180ms ease',
          color: 'var(--ig-text)',
        }}
      >
        <div
          style={{
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minHeight: '44px',
            borderBottom: data.body !== undefined ? '1px solid var(--ig-edge)' : 'none',
          }}
        >
          <Icon size={18} />
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
            title={data.label}
          >
            {data.label}
          </span>
          {data.warnings && data.warnings.length > 0 ? <WarningMark warnings={data.warnings} /> : null}
          {data.checkStatus ? <StatusMark status={data.checkStatus} /> : null}
          {showPip && data.health ? (
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: HEALTH_PIP[data.health],
              }}
            />
          ) : null}
        </div>
        {data.body !== undefined ? (
          <div style={{ padding: '10px 14px', fontSize: '12px', lineHeight: 1.4, flex: 1 }}>
            {data.body}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function getDefaultChromeSize(kind: NodeKind, expanded: boolean): { width: number; height: number } {
  // Conservative defaults — per-kind components override via getLayoutSize.
  if (kind === 'code_symbol') return { width: 200, height: 56 };
  if (kind === 'task') return { width: 220, height: expanded ? 110 : 72 };
  return { width: 220, height: expanded ? 110 : 72 };
}
