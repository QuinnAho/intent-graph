import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Vite serves files from `publicDir` at the root URL. Pointing it at the
// repo's `.intentgraph/` directory means `pnpm tsx scripts/seed-dev-db.ts`
// drops `graph.json` into a place the dev server resolves automatically as
// `/graph.json` — no copy step required. The L0 loader fetches `/graph.json`
// (transport/graph-json-loader.ts), so this is the canonical wiring rather
// than a workaround.
//
// Production builds copy `publicDir` contents into `dist/` at build time;
// for L0 that means a built bundle still resolves `/graph.json` against the
// seed that was current when the build ran. Phase 3 replaces the static
// fetch with the MCP messenger transport, at which point this entry can
// shrink to whatever assets the bundle actually ships (icons, fonts).
export default defineConfig({
  plugins: [react()],
  publicDir: resolve(__dirname, '../../.intentgraph'),
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      input: 'index.html',
    },
  },
  worker: {
    format: 'es',
  },
});
