import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { defaultApiKey, resolveLimits } from '../defaults.js';
import type { CompileLimits } from '../types.js';
import { createCompileRoute } from './routes/compile.js';

export interface CreateAppConfig {
  /** Bearer token required on `POST /compile`. Falls back to `PLATEX_API_KEY` env var. Unset (default): no auth. */
  apiKey?: string;
  /** Max simultaneous compiles. Falls back to `PLATEX_MAX_CONCURRENT` env var, then `4`. */
  maxConcurrentCompiles?: number;
  /** Raw request body size cap, in bytes. Defaults to a size derived from `limits` plus margin for JSON overhead. */
  maxRequestBodyBytes?: number;
  /** Input-size ceilings enforced for every compile request handled by this app. */
  limits?: CompileLimits;
}

function defaultMaxRequestBodyBytes(limits: Required<CompileLimits>): number {
  // source (as a JSON string) + files (~33% larger once base64-encoded) + margin for JSON overhead
  return Math.ceil((limits.maxSourceBytes + (limits.maxTotalFilesBytes * 4) / 3) * 1.15);
}

export function createApp(config: CreateAppConfig = {}): Hono {
  const app = new Hono();
  const limits = resolveLimits(config.limits);
  const maxRequestBodyBytes = config.maxRequestBodyBytes ?? defaultMaxRequestBodyBytes(limits);

  app.use(
    '/compile',
    bodyLimit({
      maxSize: maxRequestBodyBytes,
      onError: (c) => c.json({ error: 'Request body too large' }, 413),
    }),
  );

  // Optional bearer-token auth: unset by default (matches existing deployments
  // that rely on network-level access control), opt in via config or
  // PLATEX_API_KEY so a publicly-reachable deployment isn't wide open to
  // anyone who finds the URL.
  const apiKey = config.apiKey ?? defaultApiKey();
  if (apiKey) {
    app.use('/compile', bearerAuth({ token: apiKey }));
  }

  app.route(
    '/compile',
    createCompileRoute({
      limits,
      ...(config.maxConcurrentCompiles !== undefined
        ? { maxConcurrentCompiles: config.maxConcurrentCompiles }
        : {}),
    }),
  );
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
