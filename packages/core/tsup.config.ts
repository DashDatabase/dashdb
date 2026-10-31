import { defineConfig } from 'tsup';

export default defineConfig({
  // `lite`, `parsers` and `serializers` let browsers load the heavy parser and formatter
  // dependencies on demand; splitting keeps code they share in common chunks.
  entry: {
    index: 'src/index.ts',
    lite: 'src/lite.ts',
    parsers: 'src/parsers/index.ts',
    serializers: 'src/serializers/index.ts',
  },
  format: ['esm'],
  splitting: true,
  dts: true,
  sourcemap: true,
});
