import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlatexClient } from './client.js';
import type { CompileResponse } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'test', 'fixtures', 'tex');

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES, name), 'utf-8');
}

function jsonResponse(body: CompileResponse, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createPlatexClient (Node entry)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to local compilation when the client has no serviceUrl', async () => {
    const client = createPlatexClient();
    const source = await readFixture('minimal.tex');

    const result = await client.compile(source);

    expect(result.pdf).not.toBeNull();
    expect(result.pdf?.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  }, 60_000);

  it('applies client-level defaults (serviceUrl, apiKey, engine) to every compile() call', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedHeaders = init.headers as Record<string, string>;
        capturedBody = JSON.parse(init.body as string);
        return jsonResponse({ pdf: null, errors: [], warnings: [], logs: [] });
      }),
    );

    const client = createPlatexClient({
      serviceUrl: 'http://localhost:3001',
      apiKey: 'client-key',
      engine: 'xelatex',
    });

    await client.compile('src');

    expect(capturedUrl).toBe('http://localhost:3001/compile');
    expect(capturedHeaders.Authorization).toBe('Bearer client-key');
    expect(capturedBody.engine).toBe('xelatex');
  });

  it('lets a per-call option override the client default', async () => {
    let capturedBody: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return jsonResponse({ pdf: null, errors: [], warnings: [], logs: [] });
      }),
    );

    const client = createPlatexClient({ serviceUrl: 'http://localhost:3001', engine: 'xelatex' });
    await client.compile('src', { engine: 'lualatex' });

    expect(capturedBody.engine).toBe('lualatex');
  });

  it('merges (not replaces) client-level and per-call headers', async () => {
    let capturedHeaders: Record<string, string> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedHeaders = init.headers as Record<string, string>;
        return jsonResponse({ pdf: null, errors: [], warnings: [], logs: [] });
      }),
    );

    const client = createPlatexClient({
      serviceUrl: 'http://localhost:3001',
      headers: { 'X-Client': 'one' },
    });
    await client.compile('src', { headers: { 'X-Request-Id': 'two' } });

    expect(capturedHeaders['X-Client']).toBe('one');
    expect(capturedHeaders['X-Request-Id']).toBe('two');
  });

  it('supports destructuring — compile() does not depend on `this`', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ pdf: null, errors: [], warnings: [], logs: [] })),
    );

    const { compile } = createPlatexClient({ serviceUrl: 'http://localhost:3001' });
    await expect(compile('src')).resolves.toMatchObject({ pdf: null });
  });

  it('health() resolves true immediately for a local-only client (no serviceUrl)', async () => {
    const client = createPlatexClient();
    await expect(client.health()).resolves.toBe(true);
  });

  it('health() checks GET <serviceUrl>/health and reflects the response status', async () => {
    let capturedUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        capturedUrl = url;
        return new Response('ok', { status: 200 });
      }),
    );

    const client = createPlatexClient({ serviceUrl: 'http://localhost:3001' });
    await expect(client.health()).resolves.toBe(true);
    expect(capturedUrl).toBe('http://localhost:3001/health');
  });

  it('health() resolves false when the service is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      }),
    );

    const client = createPlatexClient({ serviceUrl: 'http://localhost:3001' });
    await expect(client.health()).resolves.toBe(false);
  });
});
