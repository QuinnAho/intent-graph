// Regression guard for the AgentRunner-only ESLint rule. The rule is the
// single programmatic gate on the AgentRunner chokepoint per ADR-0004; if a
// directory whose name *starts with* `agent-runner` slipped through, every
// model call traceability guarantee would silently disappear.
//
// We exercise the rule via ESLint's Linter API with absolute filenames that
// match real repo layout. No filesystem fixtures: Linter sees the filename
// as a string, which is exactly what the rule's path-segment check
// inspects.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { agentRunnerOnly } from '../../../eslint.config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');

const SOURCE_IMPORTING_AI = "import { generateText } from 'ai';\nexport const _ = generateText;\n";

const intentgraphPlugin = {
  rules: { 'agent-runner-only': agentRunnerOnly },
} as never;

function lint(filename: string) {
  const linter = new Linter();
  return linter.verify(
    SOURCE_IMPORTING_AI,
    [
      {
        files: ['**/*.ts'],
        plugins: { intentgraph: intentgraphPlugin },
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { 'intentgraph/agent-runner-only': 'error' },
      },
    ],
    { filename },
  );
}

describe('intentgraph/agent-runner-only', () => {
  it('allows imports from packages/skill/src/agent-runner/', () => {
    const filename = path.join(repoRoot, 'packages', 'skill', 'src', 'agent-runner', 'pass.ts');
    const messages = lint(filename);
    expect(messages).toEqual([]);
  });

  it('errors on a sibling whose name starts with `agent-runner`', () => {
    const filename = path.join(
      repoRoot,
      'packages',
      'skill',
      'src',
      'agent-runner-bypass',
      'violator.ts',
    );
    const messages = lint(filename);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]?.ruleId).toBe('intentgraph/agent-runner-only');
  });

  it('errors on an arbitrary file outside the allowlist', () => {
    const filename = path.join(repoRoot, 'packages', 'extension', 'src', 'leak.ts');
    const messages = lint(filename);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]?.ruleId).toBe('intentgraph/agent-runner-only');
  });
});
