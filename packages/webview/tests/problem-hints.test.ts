// lane 12: every problem row says what to do next, and a row that belongs to a node finds it.
import { describe, expect, it } from 'vitest';

import { PROBLEM_HINTS, problemHint, problemNodeId } from '../src/store/problems.js';

describe('problemHint', () => {
  it('has a hint for each kind of problem the server makes today', () => {
    const messages = [
      'no YAML frontmatter found (expected `---` block at start of file)',
      'frontmatter is not valid YAML: bad indentation',
      'frontmatter must be a YAML mapping',
      "frontmatter does not satisfy ADR-0009's required minimum (id, title, parent, confidence): id: Required",
      'id "adds" does not start with the kind prefix "intent-"; recommended for clarity.',
      'intent missing recommended `target_kinds` (per spec/intents/README.md).',
      'constraint missing one or more recommended fields (predicate_kind, expr, scope_node) per spec/constraints/README.md.',
      'concept missing recommended `regeneration_scope` (atomic|cooperative) per spec/concepts/README.md.',
      'parent loop, each of these is under the next: a.md -> b.md -> a.md',
      'drift report is not valid json',
      'inference latest.json does not name a report',
    ];
    for (const m of messages) expect(problemHint(m), m).not.toBeNull();
    expect(PROBLEM_HINTS).toHaveLength(messages.length);
  });

  it('keeps every hint to 12 words at most', () => {
    for (const h of PROBLEM_HINTS) expect(h.hint.split(/\s+/).length, h.hint).toBeLessThanOrEqual(12);
  });

  it('gives no hint for a message it does not know', () => {
    expect(problemHint('something new went wrong')).toBeNull();
  });
});

describe('problemNodeId', () => {
  const ids = new Set(['intent-adds-numbers', 'adds', 'concept-calculator']);
  it('finds the node by the id the message names, then by kind and file name', () => {
    expect(problemNodeId({ file: 'spec/intents/x.md', message: 'id "adds" does not start with the kind prefix' }, ids)).toBe('adds');
    expect(problemNodeId({ file: 'spec/intents/adds-numbers.md', message: 'intent missing recommended `target_kinds`' }, ids)).toBe('intent-adds-numbers');
    expect(problemNodeId({ file: 'spec\\concepts\\calculator.md', message: 'x' }, ids)).toBe('concept-calculator');
  });
  it('is null for a file that makes no node', () => {
    expect(problemNodeId({ file: 'spec/intents/broken.md', message: 'frontmatter is not valid YAML' }, ids)).toBeNull();
  });
});
