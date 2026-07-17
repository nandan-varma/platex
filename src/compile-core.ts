import { defaultServiceUrl, resolveLimits, utf8ByteLength } from './defaults.js';
import { runLocalPipeline } from './local/index.js';
import { callRemote } from './remote/client.js';
import type { CompileOptions, CompileResult } from './types.js';

/**
 * Compile LaTeX `source` to a PDF.
 *
 * Dispatches to the remote platex HTTP service when a `serviceUrl` is
 * available (explicit option or `PLATEX_SERVICE_URL` env var), otherwise
 * compiles locally via system TeX Live or the bundled Tectonic binary.
 *
 * Node-only (spawns child processes for the local path). For edge/browser
 * runtimes that only ever need the remote path, import from `platex/client`
 * instead — it never pulls in the local pipeline.
 */
export async function compile(
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
  if (serviceUrl) {
    return callRemote(source, { ...options, serviceUrl });
  }

  return runLocalPipeline(source, options);
}
