import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'extension',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
