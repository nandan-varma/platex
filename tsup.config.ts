import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // `client` is the edge-runtime-safe entry point (`platex/client`) — it
    // must never end up importing node:child_process/fs/os. Built alongside
    // the main entry so both stay in sync; verified node-built-in-free by a
    // grep check (see CI / the "verify edge bundle" step in CONTRIBUTING).
    //
    // `server-app` backs the `platex/server` export (embed the compile HTTP
    // API into your own Node server). Named `server-app`, not `server`, so its
    // output (dist/server-app.*) never collides with dist/server.cjs, which
    // `tsup.server.config.ts` produces separately for the standalone Docker image.
    entry: { index: 'src/index.ts', client: 'src/client-entry.ts', 'server-app': 'src/server-entry.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    external: ['hono', '@hono/node-server', '@hono/zod-validator', 'zod'],
  },
  {
    // The `platex` bin (package.json "bin"). ESM-only, Node-only; built as a
    // second config so the shebang banner never leaks into the library files.
    // clean must stay false or this pass would wipe the entries built above.
    entry: { cli: 'src/cli-main.ts' },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    splitting: false,
    sourcemap: true,
    clean: false,
    external: ['hono', '@hono/node-server', '@hono/zod-validator', 'zod'],
  },
]);
