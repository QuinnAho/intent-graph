// always-visible problem count in the corner, opens a list of file and message.
// hidden when there are no problems, so it clears by itself once a file is fixed.
// severity is a word and an icon, not only a colour.

import { TriangleAlert } from 'lucide-react';
import { useState, type CSSProperties } from 'react';

import { problemsLabel, useProblemsStore } from '../store/problems.js';

const BOX: CSSProperties = {
  position: 'absolute',
  top: '12px',
  left: '12px',
  zIndex: 20,
  maxWidth: 'min(560px, calc(100vw - 24px))',
  fontFamily: 'var(--ig-font-mono, monospace)',
  fontSize: '12px',
  color: 'var(--ig-text)',
};

const BUTTON: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '5px 10px',
  borderRadius: '999px',
  border: '1px solid #d29922',
  background: 'var(--ig-node)',
  color: 'var(--ig-text)',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
};

const LIST: CSSProperties = {
  marginTop: '6px',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid var(--ig-edge)',
  background: 'var(--ig-node)',
  listStyle: 'none',
  maxHeight: '50vh',
  overflowY: 'auto',
};

export function ProblemsPanel(): JSX.Element | null {
  const problems = useProblemsStore((s) => s.problems);
  const [open, setOpen] = useState(false);
  if (problems.length === 0) return null;
  return (
    <div style={BOX} data-problems-count={problems.length}>
      <button type="button" style={BUTTON} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <TriangleAlert size={14} color="#d29922" aria-hidden />
        {problemsLabel(problems)}
      </button>
      {open ? (
        <ul style={LIST} aria-label="spec problems">
          {problems.map((p) => (
            <li key={`${p.severity}|${p.file}|${p.message}`} data-problem-file={p.file} style={{ padding: '4px 0' }}>
              <strong>{p.severity}</strong> <span style={{ textDecoration: 'underline' }}>{p.file}</span>
              <div style={{ opacity: 0.85, marginTop: '2px', whiteSpace: 'pre-wrap' }}>{p.message}</div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
