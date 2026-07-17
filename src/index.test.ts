import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { compile } from './index.js';
import { createApp } from './server/app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'test', 'fixtures', 'tex');

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES, name), 'utf-8');
}

const TIMEOUT = 60_000;

describe('compile() - input validation', () => {
  it('throws a TypeError for an empty source string', async () => {
    await expect(compile('')).rejects.toThrow(TypeError);
  });

  it('throws a TypeError for a non-string source', async () => {
    // @ts-expect-error intentionally passing a bad type to verify the runtime guard
    await expect(compile(123)).rejects.toThrow(TypeError);
  });

  it('throws a TypeError for undefined source', async () => {
    // @ts-expect-error intentionally omitting the required argument
    await expect(compile()).rejects.toThrow(TypeError);
  });
});

describe('compile() - local pipeline routing', () => {
  it('compiles locally (via bundled Tectonic) when no serviceUrl is given', async () => {
    const source = await readFixture('minimal.tex');
    const result = await compile(source);

    expect(result.pdf).not.toBeNull();
    expect(result.pdf?.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.errors).toHaveLength(0);
  }, TIMEOUT);
});

describe('compile() - remote routing (full HTTP round trip)', () => {
  let server: ServerType;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApp();
    server = await new Promise<ServerType>((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0 }, (info) => resolve(s));
    });
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('compiles through a real platex HTTP service end-to-end', async () => {
    const source = await readFixture('minimal.tex');
    const result = await compile(source, { serviceUrl: baseUrl });

    expect(result.pdf).not.toBeNull();
    expect(result.pdf?.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.errors).toHaveLength(0);
  }, TIMEOUT);

  it('surfaces compile errors returned by the remote service', async () => {
    const source = await readFixture('syntax-error.tex');
    const result = await compile(source, { serviceUrl: baseUrl });

    expect(result.pdf).toBeNull();
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  it('throws when the remote service is unreachable', async () => {
    await expect(
      compile('\\documentclass{article}\\begin{document}x\\end{document}', {
        serviceUrl: 'http://localhost:1',
      }),
    ).rejects.toThrow(/platex: failed to reach service/);
  }, TIMEOUT);
});
