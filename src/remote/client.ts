import { DEFAULT_BIB, DEFAULT_ENGINE, DEFAULT_PASSES, DEFAULT_TIMEOUT } from '../defaults.js';
import type { CompileOptions, CompileRequest, CompileResponse, CompileResult } from '../types.js';

function isValidServiceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function callRemote(source: string, options: CompileOptions): Promise<CompileResult> {
  const serviceUrl = options.serviceUrl as string;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  if (!isValidServiceUrl(serviceUrl)) {
    throw new TypeError('platex: serviceUrl must be an http or https URL');
  }

  const body: CompileRequest = {
    source,
    engine: options.engine ?? DEFAULT_ENGINE,
    passes: options.passes ?? DEFAULT_PASSES,
    bibliography: options.bibliography ?? DEFAULT_BIB,
    timeout,
    files: Object.fromEntries(
      Object.entries(options.files ?? {}).map(([name, buf]) => [name, buf.toString('base64')]),
    ),
  };

  const controller = new AbortController();
  // Give slightly more time than the compilation timeout for network overhead
  const networkTimeout = setTimeout(() => controller.abort(), timeout + 10_000);

  let response: Response;
  try {
    response = await fetch(`${serviceUrl}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(networkTimeout);
    throw new Error('platex: failed to reach service');
  } finally {
    clearTimeout(networkTimeout);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`platex: service returned ${response.status}: ${text}`);
  }

  const data: CompileResponse = (await response.json()) as CompileResponse;

  return {
    pdf: data.pdf ? Buffer.from(data.pdf, 'base64') : null,
    errors: data.errors,
    warnings: data.warnings,
    logs: data.logs,
  };
}
