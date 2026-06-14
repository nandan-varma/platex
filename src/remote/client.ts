import type { CompileOptions, CompileResult, CompileRequest, CompileResponse } from '../types.js';

const DEFAULT_ENGINE = 'pdflatex' as const;
const DEFAULT_PASSES = 'auto' as const;
const DEFAULT_BIB = 'bibtex' as const;
const DEFAULT_TIMEOUT = 30_000;

export async function callRemote(
  source: string,
  options: CompileOptions,
): Promise<CompileResult> {
  const serviceUrl = options.serviceUrl!;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  const body: CompileRequest = {
    source,
    engine: options.engine ?? DEFAULT_ENGINE,
    passes: options.passes ?? DEFAULT_PASSES,
    bibliography: options.bibliography ?? DEFAULT_BIB,
    timeout,
    files: Object.fromEntries(
      Object.entries(options.files ?? {}).map(([name, buf]) => [
        name,
        buf.toString('base64'),
      ]),
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
  } catch (err) {
    clearTimeout(networkTimeout);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`platex: failed to reach service at ${serviceUrl}: ${message}`);
  } finally {
    clearTimeout(networkTimeout);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`platex: service returned ${response.status}: ${text}`);
  }

  const data: CompileResponse = await response.json() as CompileResponse;

  return {
    pdf: data.pdf ? Buffer.from(data.pdf, 'base64') : null,
    errors: data.errors,
    warnings: data.warnings,
    logs: data.logs,
  };
}
