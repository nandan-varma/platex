import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Several test files spawn real child processes (Tectonic, fake TeX
    // engines). Running many test files' processes concurrently exhausts
    // posix_spawn resources on macOS ("spawn Unknown system error -88"), so
    // test files run one at a time; tests within a file still run in order.
    fileParallelism: false,
  },
});
