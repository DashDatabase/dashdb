import { defineConfig } from 'tsup';

// Two builds: the component bundle is marked 'use client' as a whole (esbuild drops per-file
// directives when bundling); the server entry is not, so server components get real values.
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    outDir: 'dist/client',
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    banner: { js: "'use client';" },
  },
  {
    entry: { index: 'src/server.ts' },
    outDir: 'dist/server',
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
  },
]);
