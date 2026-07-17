/**
 * Edge-runtime-safe entry point (`platex/client`) — everything here compiles
 * exclusively via the remote platex HTTP service. It never imports
 * `node:child_process`/`node:fs`/`node:os` (the local-compilation path), so
 * it's safe to bundle for Vercel/Next.js Edge Runtime, Cloudflare Workers,
 * and other non-Node runtimes that can still run local TeX Live/Tectonic.
 *
 * Import from the main `platex` package instead if you want local
 * compilation as a fallback (e.g. a Node.js server or dev environment).
 */
import { makeClient } from './client-core.js';
import { defaultServiceUrl, resolveLimits, utf8ByteLength } from './defaults.js';
import { callRemote } from './remote/client.js';
import { makeRequestHandler } from './request-handler-core.js';
import type { CompileOptions, CompileResult, PlatexClient, PlatexClientConfig } from './types.js';

async function remoteOnlyCompile(
  source: string,
  options: CompileOptions = {},
): Promise<CompileResult> {
  if (!source || typeof source !== 'string') {
    throw new TypeError('platex: source must be a non-empty string');
  }

  const limits = resolveLimits(options.limits);
  if (utf8ByteLength(source) > limits.maxSourceBytes) {
    throw new TypeError(`platex: source exceeds ${limits.maxSourceBytes} byte limit`);
  }

  const serviceUrl = options.serviceUrl ?? defaultServiceUrl();
  if (!serviceUrl) {
    throw new TypeError(
      'platex: no serviceUrl configured. "platex/client" only compiles remotely (it never runs ' +
        'local TeX Live/Tectonic, so it works on edge runtimes) — pass { serviceUrl }, set ' +
        'PLATEX_SERVICE_URL, or import from "platex" instead for local-compilation fallback.',
    );
  }

  return callRemote(source, { ...options, serviceUrl });
}

/** Same as `createPlatexClient` from the main package, but remote-only — see the module doc above. */
export function createPlatexClient(config: PlatexClientConfig = {}): PlatexClient {
  return makeClient(remoteOnlyCompile, config);
}

/** Same as `handleCompileRequest` from the main package, but remote-only — see the module doc above. */
export const handleCompileRequest = makeRequestHandler(remoteOnlyCompile);

export type { HandleCompileRequestOptions } from './request-handler-core.js';
export { createRequestHandler } from './request-handler-core.js';

export type {
  BibEngine,
  CompileLimits,
  CompileOptions,
  CompileResult,
  Engine,
  LatexError,
  LatexWarning,
  PassCount,
  PlatexClient,
  PlatexClientConfig,
  RawPassLog,
  WarningCode,
} from './types.js';
