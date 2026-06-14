import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server/index.ts' },
  format: ['cjs'],
  dts: false,
  bundle: true,
  minify: false,
  sourcemap: true,
  clean: false,
  noExternal: [/^(?!node:).*/],
});
