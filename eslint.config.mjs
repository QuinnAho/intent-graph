// Flat ESLint config. The custom `intentgraph/agent-runner-only` rule
// blocks importing the model-call surface from `ai` outside packages/skill/src/agent-runner.
// This is enforced at lint time so the AgentRunner chokepoint cannot be silently bypassed.

import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FORBIDDEN_AI_EXPORTS = new Set([
  'generateText',
  'streamText',
  'generateObject',
  'streamObject',
  'embed',
  'embedMany',
]);

// Allowlist: only files under this prefix may import the forbidden symbols.
const AGENT_RUNNER_PREFIX = path.join('packages', 'skill', 'src', 'agent-runner');

// True path-segment match: rel must equal the prefix or be a child path. A
// raw `startsWith` would also accept sibling directories like
// `packages/skill/src/agent-runner-bypass/`, silently bypassing the chokepoint.
function isUnderAgentRunner(rel) {
  return rel === AGENT_RUNNER_PREFIX || rel.startsWith(AGENT_RUNNER_PREFIX + path.sep);
}

export const agentRunnerOnly = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid importing model-call functions from `ai` outside packages/skill/src/agent-runner. Every model call must traverse the AgentRunner chokepoint so traces are recorded.',
    },
    schema: [],
    messages: {
      forbidden:
        '`{{name}}` from "ai" must only be imported inside packages/skill/src/agent-runner. Route this call through AgentRunner.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const rel = path.relative(__dirname, filename);
    const isAllowed = isUnderAgentRunner(rel);
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'ai') return;
        if (isAllowed) return;
        for (const spec of node.specifiers) {
          if (spec.type !== 'ImportSpecifier') continue;
          const importedName = spec.imported.type === 'Identifier' ? spec.imported.name : null;
          if (importedName && FORBIDDEN_AI_EXPORTS.has(importedName)) {
            context.report({ node: spec, messageId: 'forbidden', data: { name: importedName } });
          }
        }
      },
    };
  },
};

const intentgraphPlugin = {
  rules: {
    'agent-runner-only': agentRunnerOnly,
  },
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/build/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.vsix',
      // Read-only reference fork. The intentgraph-claudemap-lifter skill is
      // the only path that touches this tree, and lifts produce new files in
      // packages/, never edits inside claudemap/. Lint must not bind us to
      // upstream style choices.
      'claudemap/**',
      // Build artifacts from the agent-skill packager.
      'artifacts/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: importPlugin,
      intentgraph: intentgraphPlugin,
    },
    rules: {
      'intentgraph/agent-runner-only': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.config.{ts,js,mjs,cjs}', 'scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // Apply the AgentRunner chokepoint rule to JS/MJS/CJS sources too. A build
  // script written in `.mjs` could otherwise import `generateText` from `ai`
  // with no warning. Use the default ESLint parser (no @typescript-eslint
  // here) so plain JS files parse correctly.
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      intentgraph: intentgraphPlugin,
    },
    rules: {
      'intentgraph/agent-runner-only': 'error',
    },
  },
];
