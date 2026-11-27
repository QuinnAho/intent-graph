// The judge's side of the drift check, kept pure: build the prompt, cut a huge
// diff safely, parse and check the reply. The subprocess call lives in claude-cli.ts.
// The judge sees the node and the diff only, never the author or commit message.

import { DriftJudgeOutputSchema, type DriftJudgeOutput } from '@intentgraph/shared/schemas';

import type { PairHunk } from './link.js';

export const JUDGE_SYSTEM_PROMPT = [
  'You check whether a code change still honours a written intent.',
  'You get one spec node (the intent) and the diff of the code bound to it.',
  'Answer "drift" only when, after the change, the code no longer does what the node says, or does something the node forbids.',
  'Answer "aligned" when the promise still holds: renames, reformatting, comments, moving code, refactors that keep behaviour, and additions the node does not speak to are aligned.',
  'Answer "unclear" when the diff is not enough to tell, for example when it was cut or the relevant code is not shown.',
  'evidence must be one line copied exactly from the diff, without the leading + or -.',
  'suggested_action is one short line for a human: what to check or fix.',
  'Reply with the JSON object only.',
].join(' ');

/** JSON schema handed to `claude --json-schema`. Mirrors DriftJudgeOutputSchema. */
export const JUDGE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    node_id: { type: 'string' },
    verdict: { type: 'string', enum: ['aligned', 'drift', 'unclear'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    evidence: { type: 'string' },
    suggested_action: { type: 'string' },
  },
  required: ['node_id', 'verdict', 'confidence', 'evidence', 'suggested_action'],
  additionalProperties: false,
} as const;

export interface DiffBudget {
  readonly text: string;
  readonly truncated: boolean;
  readonly chars: number;
}

/** Join hunks into diff text no longer than maxChars, cutting at a hunk or line boundary. */
export function budgetHunks(hunks: readonly PairHunk[], maxChars: number): DiffBudget {
  const parts: string[] = [];
  let used = 0;
  let truncated = false;
  let lastPath: string | null = null;
  for (const { path, hunk } of hunks) {
    const head = path !== lastPath ? `--- ${path}\n` : '';
    const block = `${head}${hunk.text}\n`;
    if (used + block.length <= maxChars) {
      parts.push(block);
      used += block.length;
      lastPath = path;
      continue;
    }
    // take whole lines of this hunk while they fit, then stop
    truncated = true;
    const room = maxChars - used - head.length;
    if (room > 0) {
      const lines = hunk.text.split('\n');
      const kept: string[] = [];
      let n = 0;
      for (const l of lines) {
        if (n + l.length + 1 > room) break;
        kept.push(l);
        n += l.length + 1;
      }
      if (kept.length > 0) {
        parts.push(`${head}${kept.join('\n')}\n`);
        used += head.length + n;
      }
    }
    break;
  }
  return { text: parts.join(''), truncated, chars: used };
}

export interface JudgePromptInput {
  readonly nodeId: string;
  readonly nodeText: string;
  readonly targets: readonly string[];
  readonly diff: DiffBudget;
  readonly maxNodeChars: number;
}

export function buildJudgePrompt(input: JudgePromptInput): string {
  const nodeText = input.nodeText.length > input.maxNodeChars
    ? `${input.nodeText.slice(0, input.maxNodeChars)}\n[node text cut]`
    : input.nodeText;
  return [
    `node_id: ${input.nodeId}`,
    '',
    '## Spec node (the intent)',
    nodeText,
    '',
    '## Code bound to this node',
    ...input.targets.map((t) => `- ${t}`),
    '',
    input.diff.truncated
      ? '## Diff (CUT: too long, only the first part is shown. Say "unclear" if the cut part could matter.)'
      : '## Diff',
    '```diff',
    input.diff.text.trimEnd(),
    '```',
    '',
    `Return JSON with node_id "${input.nodeId}", verdict, confidence, evidence, suggested_action.`,
  ].join('\n');
}

export type JudgeParse = { ok: true; value: DriftJudgeOutput } | { ok: false; error: string };

/** Accept a structured object or reply text (bare JSON or fenced), validate it, pin the node id. */
export function parseJudgeReply(reply: unknown, expectedNodeId: string): JudgeParse {
  let candidate: unknown = reply;
  if (typeof reply === 'string') {
    const start = reply.indexOf('{');
    const end = reply.lastIndexOf('}');
    if (start < 0 || end <= start) return { ok: false, error: 'no JSON object in reply' };
    try {
      candidate = JSON.parse(reply.slice(start, end + 1));
    } catch (e) {
      return { ok: false, error: `reply is not JSON: ${(e as Error).message}` };
    }
  }
  const parsed = DriftJudgeOutputSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: `reply does not match the verdict shape: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  }
  if (parsed.data.node_id !== expectedNodeId) {
    return { ok: false, error: `reply names node ${parsed.data.node_id}, expected ${expectedNodeId}` };
  }
  return { ok: true, value: parsed.data };
}

/** True when the quote, whitespace-collapsed and without +/- markers, appears in the diff. */
export function evidenceInDiff(quote: string, diffText: string): boolean {
  const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const q = norm(quote.replace(/^[+-]\s?/, ''));
  if (!q) return false;
  const body = diffText
    .split('\n')
    .map((l) => (/^[+\- ]/.test(l) && !l.startsWith('--- ') ? l.slice(1) : l))
    .join('\n');
  return norm(body).includes(q);
}
