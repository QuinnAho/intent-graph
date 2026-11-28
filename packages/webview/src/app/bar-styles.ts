// styles shared by the state bar and its counts
import type { CSSProperties } from 'react';

import { GLANCE_TUNING } from './glance-tuning.js';

export const BAR: CSSProperties = {
  flex: '0 0 auto',
  height: `${GLANCE_TUNING.barHeight}px`,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '0 6px',
  borderBottom: '1px solid var(--ig-edge)',
  background: 'var(--ig-node)',
  color: 'var(--ig-text)',
  fontSize: '12px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  zIndex: 25,
};

export const COUNT_BUTTON: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  height: '24px',
  padding: '0 5px',
  borderRadius: '999px',
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--ig-text)',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
  flexShrink: 0,
};

export const GROUP: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '1px', flexShrink: 0 };

export const GROUP_LABEL: CSSProperties = { fontSize: '11px', opacity: 0.6, margin: '0 3px 0 2px', flexShrink: 0 };

export const DIVIDER: CSSProperties = { width: '1px', alignSelf: 'stretch', margin: '8px 3px', background: 'var(--ig-edge)', flexShrink: 0 };
