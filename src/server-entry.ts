/**
 * `platex/server` — embed the compile HTTP API into your own Node.js server
 * (e.g. mount `createCompileRoute()` into an existing Hono app) instead of
 * running the standalone service. Node-only, like the main `platex` entry.
 */
export type { CreateAppConfig } from './server/app.js';
export { createApp } from './server/app.js';
export type { CompileRouteConfig } from './server/routes/compile.js';
export { createCompileRoute } from './server/routes/compile.js';
