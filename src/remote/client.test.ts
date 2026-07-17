import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompileResponse } from '../types.js';
import { callRemote } from './client.js';

function jsonResponse(body: CompileResponse, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('callRemote', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('POSTs to <serviceUrl>/compile with default options and base64-encoded files', async () => {
    let capturedUrl = '';
    let capturedBody: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body as string);
      return jsonResponse({ pdf: null, errors: [], warnings: [], logs: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    await callRemote('\\documentclass{article}', {
      serviceUrl: 'http://localhost:3001',
      files: { 'refs.bib': Buffer.from('bib content') },
    });

    expect(capturedUrl).toBe('http://localhost:3001/compile');
    expect(capturedBody.engine).toBe('pdflatex');
    expect(capturedBody.passes).toBe('auto');
    expect(capturedBody.bibliography).toBe('bibtex');
    expect(capturedBody.timeout).toBe(30_000);
    expect(capturedBody.files).toEqual({
      'refs.bib': Buffer.from('bib content').toString('base64'),
    });
  });

  it('forwards explicit options in the request body', async () => {
    let capturedBody: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return jsonResponse({ pdf: null, errors: [], warnings: [], logs: [] });
      }),
    );

    await callRemote('src', {
      serviceUrl: 'http://localhost:3001',
      engine: 'xelatex',
      passes: 2,
      bibliography: 'biber',
      timeout: 5_000,
    });

    expect(capturedBody.engine).toBe('xelatex');
    expect(capturedBody.passes).toBe(2);
    expect(capturedBody.bibliography).toBe('biber');
    expect(capturedBody.timeout).toBe(5_000);
  });

  it('decodes a base64 PDF from the response into a Buffer', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 fake');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ pdf: pdfBuffer.toString('base64'), errors: [], warnings: [], logs: [] }),
      ),
    );

    const result = await callRemote('src', { serviceUrl: 'http://localhost:3001' });

    expect(result.pdf).toBeInstanceOf(Buffer);
    expect(result.pdf?.equals(pdfBuffer)).toBe(true);
  });

  it('passes through a null PDF, errors, warnings, and logs unmodified', async () => {
    const response: CompileResponse = {
      pdf: null,
      errors: [
        {
          type: 'error',
          file: 'main.tex',
          line: 3,
          message: 'boom',
          context: null,
          source: 'latex',
        },
      ],
      warnings: [{ type: 'warning', code: 'other', file: null, line: null, message: 'careful' }],
      logs: [
        {
          passNumber: 1,
          engine: 'pdflatex',
          stdout: '',
          stderr: '',
          log: '',
          exitCode: 1,
          timedOut: false,
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(response)),
    );

    const result = await callRemote('src', { serviceUrl: 'http://localhost:3001' });

    expect(result.pdf).toBeNull();
    expect(result.errors).toEqual(response.errors);
    expect(result.warnings).toEqual(response.warnings);
    expect(result.logs).toEqual(response.logs);
  });

  it('throws a descriptive error when the service responds with a non-ok status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('internal failure', { status: 500 })),
    );

    await expect(callRemote('src', { serviceUrl: 'http://localhost:3001' })).rejects.toThrow(
      /platex: service returned 500.*internal failure/s,
    );
  });

  it('wraps a network-level fetch failure without leaking the service URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    await expect(callRemote('src', { serviceUrl: 'http://localhost:3001' })).rejects.toThrow(
      /platex: failed to reach service/,
    );
  });

  it('aborts the request when the caller-supplied AbortSignal fires', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      }),
    );

    const promise = callRemote('src', {
      serviceUrl: 'http://localhost:3001',
      signal: controller.signal,
    });
    controller.abort();

    await expect(promise).rejects.toThrow(/platex: failed to reach service/);
  });

  it('aborts the request once the timeout (plus network buffer) elapses', async () => {
    // client.ts waits `timeout + 10_000` before aborting, to leave room for
    // network overhead beyond the compile timeout itself. Use fake timers so
    // the test doesn't have to burn 10+ real seconds waiting for that abort.
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      }),
    );

    const promise = callRemote('src', { serviceUrl: 'http://localhost:3001', timeout: 50 });
    const assertion = expect(promise).rejects.toThrow(/platex: failed to reach service/);
    await vi.advanceTimersByTimeAsync(50 + 10_000 + 10);
    await assertion;
  });

  it('sends Authorization: Bearer <apiKey> when apiKey is set', async () => {
    let capturedHeaders: Record<string, string> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedHeaders = init.headers as Record<string, string>;
        return jsonResponse({ pdf: null, errors: [], warnings: [], logs: [] });
      }),
    );

    await callRemote('src', { serviceUrl: 'http://localhost:3001', apiKey: 'sekret' });

    expect(capturedHeaders.Authorization).toBe('Bearer sekret');
  });

  it('merges custom headers without dropping Content-Type or Authorization', async () => {
    let capturedHeaders: Record<string, string> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedHeaders = init.headers as Record<string, string>;
        return jsonResponse({ pdf: null, errors: [], warnings: [], logs: [] });
      }),
    );

    await callRemote('src', {
      serviceUrl: 'http://localhost:3001',
      apiKey: 'sekret',
      headers: { 'X-Request-Id': 'abc123' },
    });

    expect(capturedHeaders['Content-Type']).toBe('application/json');
    expect(capturedHeaders.Authorization).toBe('Bearer sekret');
    expect(capturedHeaders['X-Request-Id']).toBe('abc123');
  });

  it('falls back to PLATEX_SERVICE_URL and PLATEX_API_KEY env vars when unset in options', async () => {
    const originalUrl = process.env.PLATEX_SERVICE_URL;
    const originalKey = process.env.PLATEX_API_KEY;
    process.env.PLATEX_SERVICE_URL = 'http://from-env:3001';
    process.env.PLATEX_API_KEY = 'env-key';
    try {
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
          capturedUrl = url;
          capturedHeaders = init.headers as Record<string, string>;
          return jsonResponse({ pdf: null, errors: [], warnings: [], logs: [] });
        }),
      );

      await callRemote('src', {});

      expect(capturedUrl).toBe('http://from-env:3001/compile');
      expect(capturedHeaders.Authorization).toBe('Bearer env-key');
    } finally {
      if (originalUrl === undefined) delete process.env.PLATEX_SERVICE_URL;
      else process.env.PLATEX_SERVICE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.PLATEX_API_KEY;
      else process.env.PLATEX_API_KEY = originalKey;
    }
  });

  it('uses a custom fetch implementation when provided', async () => {
    const customFetch = vi.fn(async () =>
      jsonResponse({ pdf: null, errors: [], warnings: [], logs: [] }),
    );
    // The global fetch must NOT be called.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('global fetch should not have been used');
      }),
    );

    await callRemote('src', { serviceUrl: 'http://localhost:3001', fetch: customFetch });

    expect(customFetch).toHaveBeenCalledOnce();
  });

  it('throws a TypeError when serviceUrl is not a valid URL', async () => {
    await expect(callRemote('src', { serviceUrl: 'not a url' })).rejects.toThrow(TypeError);
  });

  it('throws a TypeError for a non-http(s) serviceUrl scheme', async () => {
    await expect(callRemote('src', { serviceUrl: 'ftp://example.com' })).rejects.toThrow(
      /http or https/,
    );
  });

  it('aborts immediately when handed an already-aborted signal', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        if (init.signal?.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      callRemote('src', { serviceUrl: 'http://localhost:3001', signal: AbortSignal.abort() }),
    ).rejects.toThrow(/platex: failed to reach service/);
  });

  describe('retry', () => {
    it('retries a 503 up to `retry` extra attempts, then succeeds', async () => {
      let attempts = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          attempts++;
          if (attempts < 3) return new Response('busy', { status: 503 });
          return jsonResponse({ pdf: null, errors: [], warnings: [], logs: [] });
        }),
      );

      const result = await callRemote('src', { serviceUrl: 'http://localhost:3001', retry: 2 });

      expect(attempts).toBe(3);
      expect(result.pdf).toBeNull();
    });

    it('does not retry a 400 (client error) even when retry is set', async () => {
      let attempts = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          attempts++;
          return new Response('bad request', { status: 400 });
        }),
      );

      await expect(
        callRemote('src', { serviceUrl: 'http://localhost:3001', retry: 3 }),
      ).rejects.toThrow(/platex: service returned 400/);
      expect(attempts).toBe(1);
    });

    it('gives up after exhausting all retry attempts on persistent 5xx failures', async () => {
      let attempts = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          attempts++;
          return new Response('down', { status: 502 });
        }),
      );

      await expect(
        callRemote('src', { serviceUrl: 'http://localhost:3001', retry: 2 }),
      ).rejects.toThrow(/platex: service returned 502/);
      expect(attempts).toBe(3); // 1 initial + 2 retries
    });

    it('does not retry when the caller aborts, even with retry set', async () => {
      const controller = new AbortController();
      let attempts = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init: RequestInit) => {
          attempts++;
          return new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          });
        }),
      );

      const promise = callRemote('src', {
        serviceUrl: 'http://localhost:3001',
        retry: 3,
        signal: controller.signal,
      });
      controller.abort();

      await expect(promise).rejects.toThrow(/platex: failed to reach service/);
      expect(attempts).toBe(1);
    });
  });
});
