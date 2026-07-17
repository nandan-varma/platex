import {
  base64ToBytes,
  bytesToBase64,
  DEFAULT_BIB,
  DEFAULT_ENGINE,
  DEFAULT_PASSES,
  DEFAULT_TIMEOUT,
  defaultApiKey,
  defaultServiceUrl,
} from '../defaults.js';
import type { CompileOptions, CompileRequest, CompileResponse, CompileResult } from '../types.js';

function isValidServiceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Internal — carries whether a failure is worth retrying without callers needing to parse messages. */
class RemoteCompileError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'RemoteCompileError';
    this.retryable = retryable;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callRemoteOnce(
  source: string,
  options: CompileOptions,
  serviceUrl: string,
): Promise<CompileResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const fetchImpl = options.fetch ?? fetch;
  const apiKey = options.apiKey ?? defaultApiKey();

  const body: CompileRequest = {
    source,
    engine: options.engine ?? DEFAULT_ENGINE,
    passes: options.passes ?? DEFAULT_PASSES,
    bibliography: options.bibliography ?? DEFAULT_BIB,
    timeout,
    files: Object.fromEntries(
      Object.entries(options.files ?? {}).map(([name, buf]) => [name, bytesToBase64(buf)]),
    ),
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const controller = new AbortController();
  let timedOutByUs = false;
  // Give slightly more time than the compilation timeout for network overhead
  const networkTimeout = setTimeout(() => {
    timedOutByUs = true;
    controller.abort();
  }, timeout + 10_000);
  // Let a caller-supplied signal cancel the request early too.
  const onCallerAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', onCallerAbort);

  let response: Response;
  try {
    response = await fetchImpl(`${serviceUrl}/compile`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // A timeout we imposed, or a genuine network failure, is worth retrying;
    // the caller explicitly cancelling is not.
    const callerAborted = Boolean(options.signal?.aborted) && !timedOutByUs;
    throw new RemoteCompileError('platex: failed to reach service', !callerAborted);
  } finally {
    clearTimeout(networkTimeout);
    options.signal?.removeEventListener('abort', onCallerAbort);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    // 4xx means the request itself is bad — retrying won't help. 5xx often
    // means a cold-starting backend, which retrying can genuinely fix.
    throw new RemoteCompileError(
      `platex: service returned ${response.status}: ${text}`,
      response.status >= 500,
    );
  }

  let data: CompileResponse;
  try {
    data = (await response.json()) as CompileResponse;
  } catch {
    // An ok status with a non-JSON body means a broken proxy or server —
    // classify it (retryable, like a 5xx) instead of leaking a raw SyntaxError
    // that would bypass retry and the handler's 502 mapping.
    throw new RemoteCompileError('platex: service returned an invalid response body', true);
  }

  return {
    pdf: data.pdf ? base64ToBytes(data.pdf) : null,
    errors: data.errors,
    warnings: data.warnings,
    logs: data.logs,
  };
}

export async function callRemote(source: string, options: CompileOptions): Promise<CompileResult> {
  const serviceUrl = options.serviceUrl ?? defaultServiceUrl();
  if (!serviceUrl || !isValidServiceUrl(serviceUrl)) {
    throw new TypeError(
      'platex: serviceUrl must be an http or https URL (pass it explicitly, or set PLATEX_SERVICE_URL)',
    );
  }

  const maxAttempts = Math.max(1, (options.retry ?? 0) + 1);
  // Retryable earlier attempts loop; the final attempt falls through and is
  // returned/thrown directly, so there's no unreachable post-loop dead code.
  for (let attempt = 1; attempt < maxAttempts; attempt++) {
    try {
      return await callRemoteOnce(source, options, serviceUrl);
    } catch (err) {
      if (!(err instanceof RemoteCompileError && err.retryable)) throw err;
      await delay(300 * attempt);
    }
  }
  return callRemoteOnce(source, options, serviceUrl);
}
