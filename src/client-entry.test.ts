import { afterEach, describe, expect, it, vi } from 'vitest';
import * as browserBackend from './browser/index.js';
import { createPlatexClient, handleCompileRequest } from './client-entry.js';
import type { CompileResponse, CompileResult } from './types.js';

function jsonResponse(body: CompileResponse, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createPlatexClient (edge entry, platex/client)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws a clear TypeError instead of attempting a WASM compile when no serviceUrl is configured and running under Node', async () => {
    const client = createPlatexClient();
    await expect(client.compile('src')).rejects.toThrow(
      /no serviceUrl configured and this runtime is not WASM-capable/,
    );
  });

  it('falls back to the WASM backend when no serviceUrl is configured and the runtime is not plain Node', async () => {
    vi.stubGlobal('process', { ...process, versions: {} });
    const fakeResult: CompileResult = {
      pdf: Buffer.from('%PDF-1.4'),
      errors: [],
      warnings: [],
      logs: [],
    };
    const spy = vi.spyOn(browserBackend, 'runBrowserPipeline').mockResolvedValue(fakeResult);

    const client = createPlatexClient({ wasm: { basePath: '/assets' } });
    const result = await client.compile('src');

    expect(spy).toHaveBeenCalledWith(
      'src',
      expect.objectContaining({ wasm: { basePath: '/assets' } }),
    );
    expect(result).toBe(fakeResult);
  });

  it('throws the same clear error on a non-Node runtime with no WebAssembly global', async () => {
    vi.stubGlobal('process', { ...process, versions: {} });
    vi.stubGlobal('WebAssembly', undefined);

    const client = createPlatexClient();
    await expect(client.compile('src')).rejects.toThrow(
      /no serviceUrl configured and this runtime is not WASM-capable/,
    );
  });

  it('rejects an empty or non-string source with a TypeError before any network call', async () => {
    const client = createPlatexClient({ serviceUrl: 'http://localhost:3001' });
    await expect(client.compile('')).rejects.toThrow(/source must be a non-empty string/);
  });

  it('rejects a source that exceeds the configured byte limit', async () => {
    const client = createPlatexClient({ serviceUrl: 'http://localhost:3001' });
    await expect(
      client.compile('x'.repeat(20), { limits: { maxSourceBytes: 10 } }),
    ).rejects.toThrow(/exceeds 10 byte limit/);
  });

  it('compiles remotely when a serviceUrl is configured — never touches local TeX', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          pdf: Buffer.from('%PDF-1.4').toString('base64'),
          errors: [],
          warnings: [],
          logs: [],
        }),
      ),
    );

    const client = createPlatexClient({ serviceUrl: 'http://localhost:3001' });
    const result = await client.compile('src');

    expect(result.pdf?.toString('utf-8')).toBe('%PDF-1.4');
  });
});

describe('handleCompileRequest (edge entry, platex/client)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a 400 when no serviceUrl is configured, instead of hanging or crashing', async () => {
    const request = new Request('http://localhost/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'x' }),
    });

    const res = await handleCompileRequest(request);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not WASM-capable/);
  });

  it('proxies through to the remote service and returns the PDF bytes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          pdf: Buffer.from('%PDF-1.4').toString('base64'),
          errors: [],
          warnings: [],
          logs: [],
        }),
      ),
    );

    const request = new Request('http://localhost/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'x' }),
    });

    const res = await handleCompileRequest(request, { serviceUrl: 'http://localhost:3001' });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    const pdf = Buffer.from(await res.arrayBuffer());
    expect(pdf.toString('utf-8')).toBe('%PDF-1.4');
  });
});
