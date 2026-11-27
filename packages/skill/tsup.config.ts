import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  // the base tsconfig sets incremental, which the dts bundler rejects (TS5074).
  // turning it off here only drops the build cache, type checking is unchanged.
  dts: { compilerOptions: { incremental: false } },
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
