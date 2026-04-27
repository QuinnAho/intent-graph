import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  test: {
    name: 'webview',
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
  },
});
