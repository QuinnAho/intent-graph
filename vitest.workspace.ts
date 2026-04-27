// Vitest workspace projects. One config per package + a top-level integration project.
// Keep colocated unit tests inside each package's `tests/` folder.

import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/shared/vitest.config.ts',
  'packages/skill/vitest.config.ts',
  'packages/extension/vitest.config.ts',
  'packages/webview/vitest.config.ts',
  'tests/integration/vitest.config.ts',
]);
