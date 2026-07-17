import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const app = createApp();
const PORT = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`platex service listening on :${PORT}`);
});

export { app };
