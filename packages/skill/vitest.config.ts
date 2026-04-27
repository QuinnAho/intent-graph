import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'skill',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
