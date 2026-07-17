import { defaultApiKey, defaultServiceUrl } from './defaults.js';
import type { CompileOptions, CompileResult, PlatexClient, PlatexClientConfig } from './types.js';

/**
 * Shallow-merges per-call options over client defaults, except `headers` and
 * `limits`, which are merged so a per-call override doesn't wipe out the
 * client-wide values (e.g. an auth header set on the client plus a
 * request-id header set per call should both survive).
 */
export function mergeClientOptions(
  config: PlatexClientConfig,
  callOptions: CompileOptions = {},
): CompileOptions {
  return {
    ...config,
    ...callOptions,
    headers: { ...config.headers, ...callOptions.headers },
    limits: { ...config.limits, ...callOptions.limits },
  };
}

/**
 * Edge-safe core shared by both the Node (`platex`) and edge (`platex/client`)
 * entry points — each supplies its own `compileImpl` (full local+remote
 * dispatch vs. remote-only) without this module ever importing Node built-ins.
 */
export function makeClient(
  compileImpl: (source: string, options: CompileOptions) => Promise<CompileResult>,
  config: PlatexClientConfig = {},
): PlatexClient {
  const compile = (source: string, callOptions: CompileOptions = {}): Promise<CompileResult> =>
    compileImpl(source, mergeClientOptions(config, callOptions));

  const health = async (): Promise<boolean> => {
    const serviceUrl = config.serviceUrl ?? defaultServiceUrl();
    if (!serviceUrl) return true; // local-only client — nothing remote to check

    const fetchImpl = config.fetch ?? fetch;
    const apiKey = config.apiKey ?? defaultApiKey();
    const headers: Record<string, string> = { ...config.headers };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    try {
      const res = await fetchImpl(`${serviceUrl}/health`, { headers });
      return res.ok;
    } catch {
      return false;
    }
  };

  return { compile, health };
}
