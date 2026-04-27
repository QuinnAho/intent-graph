// Frontmatter extraction + ADR-0009 validation. Tech-spec §3.5 (concept
// boundaries), §4.1 (per-kind body shapes), ADR-0009 (required minimum:
// id, title, parent, confidence ∈ extracted|inferred|semantic|asserted).
//
// We only enforce the four required fields here; per-kind recommended
// fields (owner, priority, predicate_kind, etc.) are documented in the
// per-kind READMEs and surfaced as warnings when missing — never errors —
// per ADR-0009's two-tier discipline.

import yaml from 'js-yaml';
import { z } from 'zod';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

export const FRONTMATTER_REQUIRED_FIELDS = ['id', 'title', 'parent', 'confidence'] as const;

const ConfidenceEnum = z.enum(['extracted', 'inferred', 'semantic', 'asserted']);
export type SpecConfidence = z.infer<typeof ConfidenceEnum>;

const FrontmatterMinimumSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  parent: z.string().nullable(),
  confidence: ConfidenceEnum,
});

export type FrontmatterMinimum = z.infer<typeof FrontmatterMinimumSchema>;

export interface ParsedFrontmatter {
  /** The four ADR-0009 required fields, validated. */
  readonly minimum: FrontmatterMinimum;
  /** All frontmatter fields including kind-specific recommended ones. */
  readonly raw: Record<string, unknown>;
  /** Markdown body after the closing `---`. Trimmed of leading whitespace only. */
  readonly body: string;
}

export class FrontmatterError extends Error {
  constructor(
    public readonly file: string,
    public readonly reason: string,
  ) {
    super(`${file}: ${reason}`);
    this.name = 'FrontmatterError';
  }
}

/**
 * Parse a Markdown file's frontmatter. Throws FrontmatterError when the
 * file lacks frontmatter, the frontmatter is not valid YAML, or any of
 * the four ADR-0009 required fields are missing or invalid.
 */
export function parseFrontmatter(file: string, source: string): ParsedFrontmatter {
  const match = FRONTMATTER_RE.exec(source);
  if (!match) {
    throw new FrontmatterError(
      file,
      'no YAML frontmatter found (expected `---` block at start of file)',
    );
  }

  const [, yamlBody, mdBody] = match;
  let raw: unknown;
  try {
    raw = yaml.load(yamlBody ?? '');
  } catch (err) {
    throw new FrontmatterError(file, `frontmatter is not valid YAML: ${(err as Error).message}`);
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new FrontmatterError(file, 'frontmatter must be a YAML mapping');
  }

  const rawObj = raw as Record<string, unknown>;
  const minimumResult = FrontmatterMinimumSchema.safeParse(rawObj);
  if (!minimumResult.success) {
    const issues = minimumResult.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new FrontmatterError(
      file,
      `frontmatter does not satisfy ADR-0009's required minimum (id, title, parent, confidence): ${issues}`,
    );
  }

  return {
    minimum: minimumResult.data,
    raw: rawObj,
    body: mdBody ?? '',
  };
}
