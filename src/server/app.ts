import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { compileRoute } from './routes/compile.js';

// Worst case JSON body: ~5MB source (as a JSON string) + up to 25MB of
// decoded `files` content, which is ~33% larger once base64-encoded on the
// wire, plus a margin for JSON structural overhead.
const MAX_REQUEST_BODY_BYTES = 45_000_000;

export function createApp(): Hono {
  const app = new Hono();

  app.use(
    '/compile',
    bodyLimit({
      maxSize: MAX_REQUEST_BODY_BYTES,
      onError: (c) => c.json({ error: 'Request body too large' }, 413),
    }),
  );

  // Optional bearer-token auth: unset by default (matches existing deployments
  // that rely on network-level access control), opt in via PLATEX_API_KEY so a
  // publicly-reachable deployment isn't wide open to anyone who finds the URL.
  const apiKey = process.env.PLATEX_API_KEY;
  if (apiKey) {
    app.use('/compile', bearerAuth({ token: apiKey }));
  }

  app.route('/compile', compileRoute);
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.notFound((c) => c.json({ error: 'Not found' }, 404));
  app.onError((err, c) => {
    // Middleware (e.g. bearerAuth) signals expected failures via
    // HTTPException — respect its intended status/response rather than
    // masking it as a generic 500.
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    console.error('[platex] unhandled request error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
