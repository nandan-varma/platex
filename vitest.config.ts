import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Several test files spawn real child processes (Tectonic, fake TeX
    // engines). Running many test files' processes concurrently exhausts
    // posix_spawn resources on macOS ("spawn Unknown system error -88"), so
    // test files run one at a time; tests within a file still run in order.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // types.ts is type-only (no runtime); the rest are the test files
      // themselves. Everything else is held to 100% (see thresholds).
      exclude: ['src/**/*.test.ts', 'src/types.ts'],
      reporter: ['text', 'html'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
