import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
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
