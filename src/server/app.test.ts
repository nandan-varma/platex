import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_FILES_COUNT } from '../defaults.js';
import type { CompileResponse } from '../types.js';
import { createApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', '..', 'test', 'fixtures', 'tex');

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES, name), 'utf-8');
}

function postCompile(app: ReturnType<typeof createApp>, body: unknown) {
  return app.request('/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const TIMEOUT = 60_000;

describe('GET /health', () => {
  it('returns ok status', async () => {
    const app = createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('404 handling', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const app = createApp();
    const res = await app.request('/nonexistent');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });
});

describe('POST /compile - validation', () => {
  it('rejects an empty source', async () => {
    const app = createApp();
    const res = await postCompile(app, { source: '' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid engine', async () => {
    const app = createApp();
    const res = await postCompile(app, { source: 'x', engine: 'not-a-real-engine' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid passes value', async () => {
    const app = createApp();
    const res = await postCompile(app, { source: 'x', passes: 5 });
    expect(res.status).toBe(400);
  });

  it('rejects a missing source field entirely', async () => {
    const app = createApp();
    const res = await postCompile(app, {});
    expect(res.status).toBe(400);
  });

  it('rejects a path-traversal filename', async () => {
    const app = createApp();
    const res = await postCompile(app, {
      source: 'x',
      files: { '../evil.txt': Buffer.from('x').toString('base64') },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Invalid filename');
  });

  it('rejects an absolute-path filename', async () => {
    const app = createApp();
    const res = await postCompile(app, {
      source: 'x',
      files: { '/etc/passwd': Buffer.from('x').toString('base64') },
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /compile - real compilation', () => {
  it(
    'compiles a minimal document and returns a base64 PDF',
    async () => {
      const app = createApp();
      const source = await readFixture('minimal.tex');
      const res = await postCompile(app, { source });

      expect(res.status).toBe(200);
      const body = (await res.json()) as CompileResponse;
      expect(body.pdf).not.toBeNull();
      expect(
        Buffer.from(body.pdf as string, 'base64')
          .subarray(0, 5)
          .toString(),
      ).toBe('%PDF-');
      expect(body.errors).toHaveLength(0);
    },
    TIMEOUT,
  );

  it(
    'applies schema defaults when optional fields are omitted',
    async () => {
      const app = createApp();
      const source = await readFixture('minimal.tex');
      const res = await postCompile(app, { source });

      expect(res.status).toBe(200);
      const body = (await res.json()) as CompileResponse;
      expect(body.pdf).not.toBeNull();
    },
    TIMEOUT,
  );

  it(
    'returns errors and a null pdf for a broken document',
    async () => {
      const app = createApp();
      const source = await readFixture('syntax-error.tex');
      const res = await postCompile(app, { source });

      expect(res.status).toBe(200);
      const body = (await res.json()) as CompileResponse;
      expect(body.pdf).toBeNull();
      expect(body.errors.length).toBeGreaterThanOrEqual(1);
    },
    TIMEOUT,
  );

  it(
    'decodes base64-supplied files and includes them in compilation',
    async () => {
      const app = createApp();
      const source = await readFixture('with-image.tex');
      const image = await readFile(join(FIXTURES, 'figure.png'));
      const res = await postCompile(app, {
        source,
        files: { 'figure.png': image.toString('base64') },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as CompileResponse;
      expect(body.pdf).not.toBeNull();
    },
    TIMEOUT,
  );
});

describe('POST /compile - files limits', () => {
  it('rejects more than MAX_FILES_COUNT files', async () => {
    const app = createApp();
    const files: Record<string, string> = {};
    for (let i = 0; i < MAX_FILES_COUNT + 1; i++) {
      files[`f${i}.txt`] = Buffer.from('x').toString('base64');
    }
    const res = await postCompile(app, { source: 'x', files });
    expect(res.status).toBe(400);
  });

  it('rejects when the combined decoded size of all files exceeds the total budget', async () => {
    const app = createApp();
    // Two 13MB files (each under the 20MB per-file cap) combine to 26MB,
    // over the 25MB total budget.
    const bigFile = Buffer.alloc(13_000_000).toString('base64');
    const res = await postCompile(app, {
      source: 'x',
      files: { 'a.bin': bigFile, 'b.bin': bigFile },
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /compile - request body limit', () => {
  it('rejects a raw request body larger than the configured limit with 413', async () => {
    const app = createApp();
    const oversized = JSON.stringify({ source: 'x'.repeat(46_000_000) });
    const res = await app.request('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: oversized,
    });
    expect(res.status).toBe(413);
  }, 20_000);
});

describe('POST /compile - concurrency limit', () => {
  afterEach(() => {
    delete process.env.PLATEX_MAX_CONCURRENT;
  });

  it('rejects with 503 once the concurrency limit is exhausted', async () => {
    process.env.PLATEX_MAX_CONCURRENT = '0';
    const app = createApp();
    const source = await readFixture('minimal.tex');
    const res = await postCompile(app, { source });
    expect(res.status).toBe(503);
  });
});

describe('POST /compile - client disconnect cancellation', () => {
  it('stops compiling immediately when the request signal is already aborted', async () => {
    const app = createApp();
    const source = await readFixture('minimal.tex');
    const controller = new AbortController();
    controller.abort();

    const started = Date.now();
    const res = await app.fetch(
      new Request('http://localhost/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
        signal: controller.signal,
      }),
    );
    const elapsed = Date.now() - started;

    // A real compile of minimal.tex takes ~100-300ms; an aborted one should
    // never even spawn the engine, so this should resolve near-instantly.
    expect(elapsed).toBeLessThan(2_000);
    expect(res.status).toBe(200);
    const body = (await res.json()) as CompileResponse;
    expect(body.pdf).toBeNull();
  });
});

describe('bearer auth (PLATEX_API_KEY)', () => {
  afterEach(() => {
    delete process.env.PLATEX_API_KEY;
  });

  it('rejects requests without a matching Authorization header when PLATEX_API_KEY is set', async () => {
    process.env.PLATEX_API_KEY = 'super-secret';
    const app = createApp();
    const res = await postCompile(app, { source: 'x' });
    expect(res.status).toBe(401);
  });

  it('accepts requests with a matching bearer token', async () => {
    process.env.PLATEX_API_KEY = 'super-secret';
    const app = createApp();
    // Use an otherwise-invalid body so a passing request proves auth
    // succeeded (reaching schema validation) without a real compile.
    const res = await app.request('/compile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer super-secret',
      },
      body: JSON.stringify({ source: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('does not require auth for /health even when PLATEX_API_KEY is set', async () => {
    process.env.PLATEX_API_KEY = 'super-secret';
    const app = createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('allows unauthenticated requests when PLATEX_API_KEY is unset', async () => {
    const app = createApp();
    const res = await postCompile(app, { source: '' });
    expect(res.status).toBe(400);
  });
});
