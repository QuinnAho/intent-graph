import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false,
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
  external: [
    'better-sqlite3',
    'tree-sitter',
    'sqlite-vec',
    '@modelcontextprotocol/sdk',
    'inngest',
  ],
});
