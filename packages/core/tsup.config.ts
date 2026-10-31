import { defineConfig } from 'tsup';

export default defineConfig({
  // `lite`, `parsers`, `serializers` and `convert` let browsers load the heavy parser and formatter
  // dependencies on demand; splitting keeps code they share in common chunks.
  entry: {
    index: 'src/index.ts',
    lite: 'src/lite.ts',
    parsers: 'src/parsers/index.ts',
    serializers: 'src/serializers/index.ts',
    // Parse + serialize in one call, for the browser-side converter tools.
    convert: 'src/convert/index.ts',
    // Example schemas only (plain strings), for pages that show them without converting.
    examples: 'src/convert/examples.ts',
  },
  format: ['esm'],
  splitting: true,
  dts: true,
  sourcemap: true,
});
