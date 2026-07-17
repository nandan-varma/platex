import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlatexClient } from './client.js';
import { createRequestHandler, handleCompileRequest } from './handler.js';
import type { CompileResponse } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'test', 'fixtures', 'tex');

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES, name), 'utf-8');
}

function postCompile(body: unknown): Request {
  return new Request('http://localhost/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function jsonResponse(body: CompileResponse, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('handleCompileRequest (Node entry — local fallback)', () => {
  it('returns 400 for an invalid JSON body', async () => {
    const request = new Request('http://localhost/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    const res = await handleCompileRequest(request);
    expect(res.status).toBe(400);
  });

  it('returns 400 when source is missing', async () => {
    const res = await handleCompileRequest(postCompile({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when files is not an object of strings', async () => {
    const res = await handleCompileRequest(postCompile({ source: 'x', files: { a: 123 } }));
    expect(res.status).toBe(400);
  });

  it('compiles a real document locally and returns raw PDF bytes', async () => {
    const source = await readFixture('minimal.tex');
    const res = await handleCompileRequest(postCompile({ source }));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    const pdf = Buffer.from(await res.arrayBuffer());
    expect(pdf.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  }, 60_000);

  it('returns 422 with errors/warnings for a document that fails to compile', async () => {
    const source = await readFixture('syntax-error.tex');
    const res = await handleCompileRequest(postCompile({ source }));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { errors: unknown[] };
    expect(body.errors.length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('responseFormat: "json" always returns 200 with a base64 pdf field', async () => {
    const source = await readFixture('minimal.tex');
    const res = await handleCompileRequest(postCompile({ source }), { responseFormat: 'json' });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { pdf: string | null };
    expect(body.pdf).not.toBeNull();
    expect(
      Buffer.from(body.pdf as string, 'base64')
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');
  }, 60_000);
});

describe('createRequestHandler (bound to a PlatexClient)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the bound client’s defaults for every request', async () => {
    let capturedHeaders: Record<string, string> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedHeaders = init.headers as Record<string, string>;
        return jsonResponse({ pdf: null, errors: [], warnings: [], logs: [] });
      }),
    );

    const client = createPlatexClient({ serviceUrl: 'http://localhost:3001', apiKey: 'bound-key' });
    const handler = createRequestHandler(client);

    await handler(postCompile({ source: 'x' }));

    expect(capturedHeaders.Authorization).toBe('Bearer bound-key');
  });

  it('maps an unreachable remote service to a 502, not a generic 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const client = createPlatexClient({ serviceUrl: 'http://localhost:3001' });
    const handler = createRequestHandler(client);

    const res = await handler(postCompile({ source: 'x' }));

    expect(res.status).toBe(502);
  });
});
