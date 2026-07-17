import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlatexClient, handleCompileRequest } from './client-entry.js';
import type { CompileResponse } from './types.js';

function jsonResponse(body: CompileResponse, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createPlatexClient (edge entry, platex/client)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws a clear TypeError instead of attempting local compilation when no serviceUrl is configured', async () => {
    const client = createPlatexClient();
    await expect(client.compile('src')).rejects.toThrow(/platex\/client.*only compiles remotely/s);
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
    expect(body.error).toMatch(/only compiles remotely/);
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
