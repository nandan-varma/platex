import { makeClient } from './client-core.js';
import { compile } from './compile-core.js';
import type { PlatexClient, PlatexClientConfig } from './types.js';

/**
 * Create a client with defaults captured once — `serviceUrl`, `apiKey`,
 * `engine`, `timeout`, `limits`, etc. — instead of repeating them on every
 * `compile()` call. Per-call options still override the client's defaults.
 *
 * ```ts
 * // lib/platex.ts — create once, import everywhere
 * export const platex = createPlatexClient({
 *   serviceUrl: process.env.PLATEX_SERVICE_URL,
 *   timeout: 25_000,
 * })
 *
 * // anywhere else
 * import { platex } from '@/lib/platex'
 * const result = await platex.compile(source)
 * ```
 *
 * Node-only (falls back to local TeX compilation when no `serviceUrl` is
 * configured). For edge runtimes, use `createPlatexClient` from
 * `platex/client` instead — it only ever compiles remotely.
 */
export function createPlatexClient(config: PlatexClientConfig = {}): PlatexClient {
  return makeClient(compile, config);
}
