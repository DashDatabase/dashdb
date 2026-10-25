import { defineConfig } from 'tsup';

export default defineConfig({
  // index.ts is the server entry; app.ts is also emitted so api-client can import AppType.
  entry: ['src/index.ts', 'src/app.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  dts: { entry: 'src/app.ts' },
  sourcemap: true,
});
