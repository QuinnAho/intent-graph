// the spec writer: change the title or body of a spec file, or make a new intent file.
// an edit rewrites only the lines it must (the title line, a heading that mirrors the
// title, the updated line) and copies every other byte, so comments, key order, block
// values and line endings survive. a round-trip yaml library would re-emit the whole
// block, so lines are edited by hand and the result is parsed again before it is kept.

import { createHash } from 'node:crypto';
import { linkSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { NodeKindSchema } from '@intentgraph/shared/schemas';
import yaml from 'js-yaml';

import { parseFrontmatter, type ParsedFrontmatter } from './frontmatter.js';
import { SPEC_WRITE_TUNING } from './write-tuning.js';

// same split as frontmatter.ts, with the fences kept so they can be copied back
const PARTS_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n)([\s\S]*)$/;

export type WriteRefusal = { readonly ok: false; readonly code: 'invalid' | 'rejected' | 'duplicate'; readonly reason: string };
export type EditResult = { readonly ok: true; readonly text: string; readonly changed: boolean } | WriteRefusal;
export type NewIntentResult = { readonly ok: true; readonly text: string; readonly id: string; readonly slug: string } | WriteRefusal;
export type CreateResult = { readonly ok: true; readonly file: string; readonly id: string; readonly text: string } | WriteRefusal;

export interface SpecEdit {
  readonly title?: string;
  /** body text after the mirrored heading, any line endings */
  readonly body?: string;
}

export interface SpecForEdit {
  readonly id: string;
  readonly title: string;
  /** body after the heading that mirrors the title, with plain \n line endings */
  readonly body: string;
  readonly eol: '\n' | '\r\n';
  readonly raw: Record<string, unknown>;
}

interface Line {
  text: string;
  eol: string;
}

interface Parts {
  readonly open: string;
  readonly yaml: string;
  readonly close: string;
  readonly body: string;
  readonly eol: '\n' | '\r\n';
}

const refuse = (code: WriteRefusal['code'], reason: string): WriteRefusal => ({ ok: false, code, reason });

function splitParts(source: string): Parts | null {
  const m = PARTS_RE.exec(source);
  if (!m) return null;
  const open = m[1]!;
  return { open, yaml: m[2]!, close: m[3]!, body: m[4]!, eol: open.endsWith('\r\n') ? '\r\n' : '\n' };
}

function splitLines(text: string): Line[] {
  const out: Line[] = [];
  const re = /\r?\n/g;
  let at = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push({ text: text.slice(at, m.index), eol: m[0] });
    at = m.index + m[0].length;
  }
  if (at < text.length || out.length === 0) out.push({ text: text.slice(at), eol: '' });
  return out;
}

const joinLines = (lines: ReadonlyArray<Line>): string => lines.map((l) => l.text + l.eol).join('');
const plain = (s: string): string => s.replace(/\r\n/g, '\n');

/** one yaml scalar on one line, quoted only when yaml would read it as something else */
function yamlScalar(value: string): string {
  return yaml.dump(value, { lineWidth: -1 }).replace(/\n$/, '');
}

/** [start, end) of a top-level key and the lines its value runs over */
function keySpan(lines: ReadonlyArray<Line>, key: string): [number, number] | null {
  const head = new RegExp(`^${key}\\s*:`);
  const i = lines.findIndex((l) => head.test(l.text));
  if (i < 0) return null;
  let j = i + 1;
  while (j < lines.length && (lines[j]!.text.trim() === '' || /^[ \t]/.test(lines[j]!.text))) j++;
  // blank lines after a block value belong to whatever follows
  while (j > i + 1 && lines[j - 1]!.text.trim() === '') j--;
  return [i, j];
}

/** the trailing " # comment" of a one-line value, or '' when there is none */
function trailingComment(key: string, value: string): string {
  const whole = loadValue(key, value);
  for (let k = 1; k < value.length; k++) {
    if (value[k] !== '#' || !/\s/.test(value[k - 1]!)) continue;
    const before = value.slice(0, k).trimEnd();
    if (before.length > 0 && isDeepStrictEqual(loadValue(key, before), whole)) return value.slice(before.length);
  }
  return '';
}

function loadValue(key: string, value: string): unknown {
  try {
    return (yaml.load(`${key}: ${value}`) as Record<string, unknown> | null)?.[key];
  } catch {
    return Symbol('unparsable');
  }
}

/** replace a key's value in place, or add the key as the last line when it is missing */
function setKey(lines: Line[], key: string, scalar: string, eol: string): void {
  const span = keySpan(lines, key);
  if (!span) {
    lines[lines.length - 1]!.eol = eol;
    lines.push({ text: `${key}: ${scalar}`, eol: '' });
    return;
  }
  const [i, j] = span;
  const first = lines[i]!;
  const m = new RegExp(`^(${key}\\s*:[ \\t]*)(.*)$`).exec(first.text)!;
  const comment = j === i + 1 ? trailingComment(key, m[2]!) : '';
  const lead = j === i + 1 ? m[1]! : `${key}: `;
  lines.splice(i, j - i, { text: `${lead}${scalar}${comment}`, eol: lines[j - 1]!.eol });
}

function checkTitle(title: string): string | null {
  if (title.length === 0) return 'the title is empty';
  if (/[\r\n]/.test(title)) return 'the title must be one line';
  if (title.length > SPEC_WRITE_TUNING.titleMaxLength) return `the title is longer than ${SPEC_WRITE_TUNING.titleMaxLength} characters`;
  return null;
}

interface BodySplit {
  readonly lead: Line[];
  readonly heading: number;
  readonly rest: string;
}

/** split the body into the heading that mirrors the title (with blank lines around it) and the rest */
function splitBody(body: string, title: string): BodySplit {
  const lines = splitLines(body);
  let k = 0;
  while (k < lines.length && lines[k]!.text.trim() === '' && lines[k]!.eol !== '') k++;
  const m = k < lines.length ? /^#[ \t]+(.*?)[ \t]*$/.exec(lines[k]!.text) : null;
  if (!m || m[1] !== title.trim()) return { lead: [], heading: -1, rest: body };
  let end = k + 1;
  if (end < lines.length && lines[end]!.text.trim() === '' && lines[end]!.eol !== '') end++;
  const lead = lines.slice(0, end);
  return { lead, heading: k, rest: body.slice(joinLines(lead).length) };
}

function parseOrNull(file: string, source: string): ParsedFrontmatter | string {
  try {
    return parseFrontmatter(file, source);
  } catch (err) {
    return (err as Error).message;
  }
}

/** title and editable body of a spec file. throws FrontmatterError when the parser rejects it. */
export function readSpecForEdit(file: string, source: string): SpecForEdit {
  const parsed = parseFrontmatter(file, source);
  const parts = splitParts(source)!;
  return {
    id: parsed.minimum.id,
    title: parsed.minimum.title,
    body: plain(splitBody(parts.body, parsed.minimum.title).rest),
    eol: parts.eol,
    raw: parsed.raw,
  };
}

/** apply a title or body edit to a spec file's text, or say why not */
export function editSpecSource(file: string, source: string, edit: SpecEdit, today: string): EditResult {
  const before = parseOrNull(file, source);
  if (typeof before === 'string') return refuse('rejected', `the file does not parse, fix it first: ${before}`);
  const parts = splitParts(source);
  if (!parts) return refuse('rejected', 'no frontmatter found');

  const oldTitle = before.minimum.title;
  const newTitle = edit.title === undefined ? oldTitle : edit.title.trim();
  const bad = checkTitle(newTitle);
  if (bad) return refuse('invalid', bad);
  const split = splitBody(parts.body, oldTitle);
  const titleChanged = newTitle !== oldTitle;
  const bodyChanged = edit.body !== undefined && plain(edit.body) !== plain(split.rest);
  if (!titleChanged && !bodyChanged) return { ok: true, text: source, changed: false };

  const yamlLines = splitLines(parts.yaml);
  if (titleChanged) setKey(yamlLines, 'title', yamlScalar(newTitle), parts.eol);
  setKey(yamlLines, 'updated', today, parts.eol);

  const lead = split.lead.map((l) => ({ ...l }));
  if (titleChanged && split.heading >= 0) lead[split.heading]!.text = `# ${newTitle}`;
  const rest = bodyChanged ? plain(edit.body!).replace(/\n/g, parts.eol) : split.rest;
  const body = joinLines(lead) + rest;
  const text = parts.open + joinLines(yamlLines) + parts.close + body;

  // keep the result only if it parses and nothing but title and updated moved
  const after = parseOrNull(file, text);
  if (typeof after === 'string') return refuse('rejected', `the edit would not parse: ${after}`);
  const keys = (r: Record<string, unknown>): string[] => Object.keys(r).filter((k) => k !== 'updated');
  const same =
    after.minimum.title === newTitle &&
    isDeepStrictEqual(keys(before.raw), keys(after.raw)) &&
    keys(before.raw).every((k) => k === 'title' || isDeepStrictEqual(before.raw[k], after.raw[k])) &&
    after.body === body;
  if (!same) return refuse('rejected', 'the edit would change other fields, nothing was written');
  return { ok: true, text, changed: true };
}

/** file-name slug: lowercase ascii words joined by dashes, cut at a word break */
export function slugFromTitle(title: string, maxLength: number = SPEC_WRITE_TUNING.slugMaxLength): string {
  const words = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
  let slug = '';
  for (const w of words) {
    const next = slug ? `${slug}-${w}` : w;
    if (next.length > maxLength) break;
    slug = next;
  }
  // one word longer than the limit is cut rather than dropped
  if (!slug && words.length > 0) slug = words[0]!.slice(0, maxLength);
  return slug;
}

export interface NewIntent {
  readonly title: string;
  readonly parent: string;
  readonly today: string;
  readonly eol?: '\n' | '\r\n';
  /** node kinds the intent shapes. left out, the file has no target_kinds line. */
  readonly targetKinds?: ReadonlyArray<string>;
}

/** a message for a target_kinds list the writer would not write, null when it is fine */
export function checkTargetKinds(kinds: unknown): string | null {
  if (!Array.isArray(kinds) || kinds.length === 0) return 'Pick at least one target kind.';
  const allowed: ReadonlyArray<string> = NodeKindSchema.options;
  for (const k of kinds) {
    if (typeof k !== 'string' || !allowed.includes(k)) return `${String(k)} is not a node kind, pick from: ${allowed.join(', ')}`;
  }
  if (new Set(kinds).size !== kinds.length) return 'Each target kind can be listed once.';
  return null;
}

/** text of a new intent file: the adr 0009 minimum, asserted per adr 0024, draft, dated today */
export function newIntentSource(input: NewIntent): NewIntentResult {
  const title = input.title.trim();
  const bad = checkTitle(title);
  if (bad) return refuse('invalid', bad);
  const slug = slugFromTitle(title);
  if (!slug) return refuse('invalid', 'the title needs at least one letter or number for the file name');
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(input.parent)) {
    return refuse('invalid', `bad parent id "${input.parent}"`);
  }
  const kinds = input.targetKinds;
  if (kinds !== undefined) {
    const badKinds = checkTargetKinds(kinds);
    if (badKinds) return refuse('invalid', badKinds);
  }
  const id = `intent-${slug}`;
  const eol = input.eol ?? '\n';
  const text = [
    '---',
    `id: ${id}`,
    `title: ${yamlScalar(title)}`,
    `parent: ${input.parent}`,
    'confidence: asserted',
    'status: draft',
    ...(kinds ? ['target_kinds:', ...kinds.map((k) => `  - ${k}`)] : []),
    `created: ${input.today}`,
    `updated: ${input.today}`,
    '---',
    '',
    `# ${title}`,
    '',
  ].join(eol);
  const parsed = parseOrNull(`${slug}.md`, text);
  if (typeof parsed === 'string') return refuse('rejected', parsed);
  if (parsed.minimum.title !== title || parsed.minimum.parent !== input.parent) return refuse('rejected', 'the new file would not read back the same');
  return { ok: true, text, id, slug };
}

/** create spec/intents/<slug>.md. refuses when that file already exists, and never overwrites. */
export function createIntentFile(specRoot: string, input: NewIntent): CreateResult {
  const r = newIntentSource(input);
  if (!r.ok) return r;
  const dir = join(specRoot, 'intents');
  const file = join(dir, `${r.slug}.md`);
  mkdirSync(dir, { recursive: true });
  const tmp = tempName(file);
  writeFileSync(tmp, r.text);
  try {
    // a hard link is atomic and fails when the name is taken, so two creates cannot both win
    linkSync(tmp, file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return refuse('duplicate', `spec/intents/${r.slug}.md already exists, pick another title`);
    throw err;
  } finally {
    unlinkSync(tmp);
  }
  return { ok: true, file, id: r.id, text: r.text };
}

function tempName(file: string): string {
  // not .md, so the watcher and the parser never see it
  return join(dirname(file), `.${basename(file)}.${process.pid}-${Date.now()}.tmp`);
}

/** write next to the file, then rename over it, so a reader sees the old or the new text */
export function writeSpecFileAtomic(file: string, text: string): void {
  const tmp = tempName(file);
  writeFileSync(tmp, text);
  try {
    renameSync(tmp, file);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // already gone
    }
    throw err;
  }
}

export function hashSpecSource(source: string | Buffer): string {
  return createHash('sha256').update(source).digest('hex');
}
