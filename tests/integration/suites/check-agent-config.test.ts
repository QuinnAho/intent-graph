// Regression guard for F-CHECK-CONFIG-COVERAGE: confirms the link scan in
// scripts/check-agent-config.ts catches broken relative links when invoked
// against fixture markdown. Each scenario below corresponds to one of the
// scanned locations called out in qa-report-001 (CLAUDE.md, AGENTS.md,
// STRUCTURE.md, docs/architecture.md, automation/README.md, docs/adr/*).

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findBrokenMarkdownLinks } from '../../../scripts/check-agent-config.ts';

describe('findBrokenMarkdownLinks', () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'ig-link-scan-'));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  function fixture(filename: string, body: string): string {
    const path = join(workdir, filename);
    writeFileSync(path, body, 'utf8');
    return path;
  }

  it('reports a broken relative link', () => {
    const path = fixture(
      'doc.md',
      '# Doc\n\nSee [the missing target](./does-not-exist.md).\n',
    );
    expect(findBrokenMarkdownLinks(path)).toEqual(['./does-not-exist.md']);
  });

  it('passes a working relative link', () => {
    fixture('peer.md', '# Peer\n');
    const path = fixture('doc.md', '# Doc\n\nSee [peer](./peer.md).\n');
    expect(findBrokenMarkdownLinks(path)).toEqual([]);
  });

  it('skips http/mailto/anchor links', () => {
    const path = fixture(
      'doc.md',
      '[a](https://example.com)\n[b](mailto:x@example.com)\n[c](#section)\n',
    );
    expect(findBrokenMarkdownLinks(path)).toEqual([]);
  });

  it('catches the case-sensitivity hazard (Tech-Spec.md vs tech-spec.md)', () => {
    fixture('tech-spec.md', '# spec\n');
    const path = fixture('doc.md', 'See [the spec](./Tech-Spec.md).\n');
    // On Linux, the capitalized link does not resolve to the lowercase file;
    // on Windows existsSync is case-insensitive so this assertion is
    // platform-conditional.
    if (process.platform === 'win32') {
      expect(findBrokenMarkdownLinks(path)).toEqual([]);
    } else {
      expect(findBrokenMarkdownLinks(path)).toEqual(['./Tech-Spec.md']);
    }
  });

  it('reports broken links anywhere in the doc body', () => {
    const path = fixture(
      'long.md',
      [
        '# Long doc',
        'See [first](./missing-1.md).',
        'And also [second](./missing-2.md).',
        'But [this](#anchor) is fine.',
      ].join('\n'),
    );
    expect(findBrokenMarkdownLinks(path)).toEqual(['./missing-1.md', './missing-2.md']);
  });
});
