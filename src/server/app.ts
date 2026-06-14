import { Hono } from 'hono';
import { compileRoute } from './routes/compile.js';

export function createApp(): Hono {
  const app = new Hono();
  app.route('/compile', compileRoute);
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.notFound((c) => c.json({ error: 'Not found' }, 404));
  return app;
}
