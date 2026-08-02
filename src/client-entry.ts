/**
 * Edge-runtime-safe entry point (`platex/client`) — never imports
 * `node:child_process`/`node:fs`/`node:os` (the Node local-compilation
 * path), so it's safe to bundle for Vercel/Next.js Edge Runtime, Cloudflare
 * Workers, browsers, and other non-Node runtimes.
 *
 * Compiles via the remote platex HTTP service when a `serviceUrl` resolves;
 * otherwise falls back to an in-process WASM TeX Live build
 * (`texlyre-busytex`, dynamically imported — see `browser/index.ts`) when
 * the runtime is WASM-capable, so a deployed service is optional rather than
 * required. `serviceUrl` always wins when both are viable.
 *
 * Import from the main `platex` package instead if you want the Node local
 * fallback (system TeX Live / bundled Tectonic via child process) — a better
 * fit for servers than the WASM backend.
 */
import { runBrowserPipeline } from './browser/index.js';
import { makeClient } from './client-core.js';
import { defaultServiceUrl, resolveLimits, utf8ByteLength } from './defaults.js';
import { callRemote } from './remote/client.js';
import { makeRequestHandler } from './request-handler-core.js';
import type { CompileOptions, CompileResult, PlatexClient, PlatexClientConfig } from './types.js';

// tsconfig's `lib` is ES-only (no DOM), so `WebAssembly` isn't otherwise
// known to the type checker — same pattern as defaults.ts's `declare
// function btoa/atob`. Only its presence is checked at runtime (`typeof`).
declare const WebAssembly: unknown;

/**
 * Node also defines a global `WebAssembly`, so its presence alone doesn't
 * distinguish "browser/edge" from "plain Node" — and the WASM backend
 * expects browser-shaped globals (fetch-based asset loading, optionally
 * `Worker`) that a bare Node process doesn't provide the way texlyre-busytex
 * needs. Excluding `process.versions.node` (the standard "is this actually
 * Node" check) keeps `platex/client` used from Node — tests, tooling, or by
 * mistake — throwing the clear error below instead of attempting (and
 * failing) a WASM compile that was never going to work there.
 */
function isWasmCapable(): boolean {
  if (typeof WebAssembly === 'undefined') return false;
  if (typeof process !== 'undefined' && process.versions?.node) return false;
  return true;
}

async function clientCompile(source: string, options: CompileOptions = {}): Promise<CompileResult> {
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

  if (isWasmCapable()) {
    return runBrowserPipeline(source, options);
  }

  throw new TypeError(
    'platex: no serviceUrl configured and this runtime is not WASM-capable. "platex/client" ' +
      'compiles remotely when a service is configured, or via a bundled WASM engine on ' +
      'WASM-capable runtimes (browsers, most edge runtimes) — pass { serviceUrl }, set ' +
      'PLATEX_SERVICE_URL, or import from "platex" instead for the Node local-compilation fallback.',
  );
}

/** Same as `createPlatexClient` from the main package, but edge-safe — see the module doc above. */
export function createPlatexClient(config: PlatexClientConfig = {}): PlatexClient {
  return makeClient(clientCompile, config);
}

/** Same as `handleCompileRequest` from the main package, but edge-safe — see the module doc above. */
export const handleCompileRequest = makeRequestHandler(clientCompile);

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
