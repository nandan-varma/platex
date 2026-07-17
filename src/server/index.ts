import { type ServerType, serve } from '@hono/node-server';
import { createApp } from './app.js';

const app = createApp();
const PORT = Number(process.env.PORT ?? 3001);

const server: ServerType | undefined = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`platex service listening on :${PORT}`);
});

// Graceful shutdown: stop accepting new connections and let in-flight
// compiles finish (or get cancelled by their own timeout/signal) before
// the container is SIGTERM'd. Without this, Node exits immediately and
// orphaned TeX child processes are left behind or killed mid-write.
/* v8 ignore next 6 -- server is only undefined when @hono/node-server is mocked in tests */
const shutdown = () => {
  console.log('[platex] shutting down…');
  server?.close(() => process.exit(0));
  // Force-exit if graceful shutdown stalls (e.g. a hung TeX process).
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app };
