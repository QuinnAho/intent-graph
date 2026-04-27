// Tests for the /spec/*.md frontmatter parser. Covers ADR-0009's required
// minimum (id, title, parent, confidence) plus the per-kind warnings the
// parser surfaces when recommended fields are absent. Also walks the real
// /spec/ tree's example fixtures so the round-trip stays honest.
//
// Tech-spec §3.5, §4.1; ADR-0009.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, afterEach } from 'vitest';

import { parseSpecTree } from '../src/parser/spec-md/index.js';
import { parseFrontmatter, FrontmatterError } from '../src/parser/spec-md/frontmatter.js';

const here = resolve(fileURLToPath(import.meta.url), '..');
const repoSpecRoot = resolve(here, '..', '..', '..', 'spec');

describe('parseFrontmatter (ADR-0009 minimum)', () => {
  it('accepts a file with all four required fields', () => {
    const source = `---\nid: intent-foo\ntitle: Foo\nparent: null\nconfidence: asserted\n---\nbody\n`;
    const parsed = parseFrontmatter('foo.md', source);
    expect(parsed.minimum.id).toBe('intent-foo');
    expect(parsed.minimum.title).toBe('Foo');
    expect(parsed.minimum.parent).toBeNull();
    expect(parsed.minimum.confidence).toBe('asserted');
    expect(parsed.body.trim()).toBe('body');
  });

  it('rejects a file with no frontmatter block', () => {
    expect(() => parseFrontmatter('foo.md', 'just body, no frontmatter')).toThrow(FrontmatterError);
  });

  it('rejects a file missing a required field', () => {
    const source = `---\nid: intent-foo\ntitle: Foo\nconfidence: asserted\n---\nbody\n`;
    expect(() => parseFrontmatter('foo.md', source)).toThrow(/parent/);
  });

  it('rejects a file with an invalid confidence value', () => {
    const source = `---\nid: intent-foo\ntitle: Foo\nparent: null\nconfidence: bogus\n---\nbody\n`;
    expect(() => parseFrontmatter('foo.md', source)).toThrow(/confidence/);
  });

  it('rejects malformed YAML', () => {
    const source = `---\nid: intent-foo\ntitle: [unbalanced\nparent: null\nconfidence: asserted\n---\nbody\n`;
    expect(() => parseFrontmatter('foo.md', source)).toThrow(/not valid YAML/);
  });
});

describe('parseSpecTree against the real /spec fixtures', () => {
  it('parses the three example files into 3 nodes + 2 edges', () => {
    const result = parseSpecTree(repoSpecRoot, { now: 1700000000000 });

    expect(result.errors).toEqual([]);

    const exampleNodes = result.nodes.filter((n) => n.id.includes('example-'));
    expect(exampleNodes.map((n) => n.id).sort()).toEqual([
      'concept-example-spec-driven-loop',
      'intent-example-drift-is-detectable',
      'intent-example-graph-is-source-of-truth',
    ]);

    const concept = exampleNodes.find((n) => n.id === 'concept-example-spec-driven-loop');
    expect(concept?.kind).toBe('concept');
    expect(concept?.parentId).toBeNull();
    expect(concept?.confidence).toBe('asserted');
    const conceptBody = JSON.parse(concept!.body) as { regeneration_scope: string };
    expect(conceptBody.regeneration_scope).toBe('cooperative');

    const intent = exampleNodes.find((n) => n.id === 'intent-example-graph-is-source-of-truth');
    expect(intent?.kind).toBe('intent');
    expect(intent?.parentId).toBe('concept-example-spec-driven-loop');
    const intentBody = JSON.parse(intent!.body) as { target_kinds: unknown[] };
    expect(intentBody.target_kinds).toEqual(['module']);

    // Two `realizes` edges: each example intent → the example concept.
    const exampleEdges = result.edges.filter((e) =>
      e.src.includes('example-') || e.dst.includes('example-'),
    );
    expect(exampleEdges).toHaveLength(2);
    expect(exampleEdges.every((e) => e.kind === 'realizes')).toBe(true);
    expect(exampleEdges.every((e) => e.dst === 'concept-example-spec-driven-loop')).toBe(true);
  });
});

describe('parseSpecTree warnings vs errors', () => {
  let tmpRoot: string | null = null;
  afterEach(() => {
    if (tmpRoot) {
      rmSync(tmpRoot, { recursive: true, force: true });
      tmpRoot = null;
    }
  });

  function mkSpecRoot(): string {
    tmpRoot = mkdtempSync(join(tmpdir(), 'ig-spec-md-'));
    mkdirSync(join(tmpRoot, 'intents'));
    mkdirSync(join(tmpRoot, 'constraints'));
    mkdirSync(join(tmpRoot, 'decisions'));
    mkdirSync(join(tmpRoot, 'concepts'));
    return tmpRoot;
  }

  it('surfaces missing recommended fields as warnings, not errors', () => {
    const root = mkSpecRoot();
    // Intent with minimum-only frontmatter — no target_kinds.
    writeFileSync(
      join(root, 'intents', 'min.md'),
      `---\nid: intent-min\ntitle: Minimum\nparent: null\nconfidence: extracted\n---\nbody.\n`,
    );
    const result = parseSpecTree(root);
    expect(result.errors).toEqual([]);
    expect(result.nodes).toHaveLength(1);
    const targetKindsWarning = result.warnings.find((w) => w.message.includes('target_kinds'));
    expect(targetKindsWarning).toBeDefined();
  });

  it('records files that fail frontmatter validation as errors and still parses other files', () => {
    const root = mkSpecRoot();
    writeFileSync(join(root, 'intents', 'bad.md'), `no frontmatter here\n`);
    writeFileSync(
      join(root, 'intents', 'good.md'),
      `---\nid: intent-good\ntitle: Good\nparent: null\nconfidence: asserted\ntarget_kinds:\n  - module\n---\nbody.\n`,
    );
    const result = parseSpecTree(root);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toMatch(/frontmatter/i);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.id).toBe('intent-good');
  });

  it('skips README.md files in every kind directory', () => {
    const root = mkSpecRoot();
    writeFileSync(join(root, 'intents', 'README.md'), `# Intents\nNot frontmatter.\n`);
    const result = parseSpecTree(root);
    expect(result.errors).toEqual([]);
    expect(result.nodes).toHaveLength(0);
  });

  it('warns when an id does not start with the kind prefix', () => {
    const root = mkSpecRoot();
    writeFileSync(
      join(root, 'concepts', 'oops.md'),
      `---\nid: thing-oops\ntitle: Oops\nparent: null\nconfidence: asserted\nregeneration_scope: atomic\n---\nbody.\n`,
    );
    const result = parseSpecTree(root);
    expect(result.errors).toEqual([]);
    expect(result.nodes).toHaveLength(1);
    expect(result.warnings.some((w) => w.message.includes('does not start with the kind prefix'))).toBe(true);
  });

  it('tolerates a missing kind directory (not every checkout has all four)', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'ig-spec-md-partial-'));
    mkdirSync(join(tmpRoot, 'intents'));
    // intentionally no constraints/decisions/concepts
    writeFileSync(
      join(tmpRoot, 'intents', 'lonely.md'),
      `---\nid: intent-lonely\ntitle: Lonely\nparent: null\nconfidence: asserted\ntarget_kinds:\n  - module\n---\nbody.\n`,
    );
    const result = parseSpecTree(tmpRoot);
    expect(result.errors).toEqual([]);
    expect(result.nodes).toHaveLength(1);
  });
});
