import { compile } from './compile-core.js';
import { makeRequestHandler } from './request-handler-core.js';

/**
 * A ready-to-use `(request: Request) => Promise<Response>` for POST-ing
 * LaTeX source to compile. Zero-config by default (relies on
 * `PLATEX_SERVICE_URL`/`PLATEX_API_KEY` env vars, or falls back to local
 * compilation) — pass `CompileOptions` as the second argument to override.
 *
 * Works identically wherever you have a standard Fetch API `Request`:
 * Next.js Route Handlers, Astro API endpoints, TanStack Start server routes,
 * SvelteKit endpoints, Remix resource routes, Bun/Deno/Hono servers.
 *
 * ```ts
 * // app/api/compile/route.ts (Next.js), or the equivalent in any other framework
 * import { handleCompileRequest } from '@nandan-varma/platex'
 * export const POST = handleCompileRequest
 * ```
 */
export const handleCompileRequest = makeRequestHandler(compile);

export type { HandleCompileRequestOptions } from './request-handler-core.js';
export { createRequestHandler } from './request-handler-core.js';
