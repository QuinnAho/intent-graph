import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'integration',
    include: ['suites/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
