import { describe, expect, it } from 'vitest';
import { makeRequestHandler } from './request-handler-core.js';
import type { CompileOptions, CompileResult } from './types.js';

const okResult: CompileResult = {
  pdf: Buffer.from('%PDF-1.4'),
  errors: [],
  warnings: [],
  logs: [],
};

function post(body: unknown): Request {
  return new Request('http://localhost/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function json(
  res: Response,
): Promise<{ error?: string; pdf?: string | null; errors?: unknown[] }> {
  return (await res.json()) as { error?: string; pdf?: string | null; errors?: unknown[] };
}

// makeRequestHandler takes the compile implementation as an argument, so these
// tests drive the Request->Response adapter directly with a stub compile — no
// global mocking, no real TeX — isolating the body parsing / option merging /
// error-mapping logic that both entry points share.
describe('makeRequestHandler - request body handling', () => {
  it('rejects `files` that is an array (not an object) with 400', async () => {
    const handler = makeRequestHandler(async () => okResult);
    const res = await handler(post({ source: 'x', files: ['a.tex'] }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/files.*object/);
  });

  it('decodes base64 `files` to Buffers and forwards all options to compile', async () => {
    let captured: { source: string; options: CompileOptions } | undefined;
    const handler = makeRequestHandler(async (source, options) => {
      captured = { source, options };
      return okResult;
    });

    const res = await handler(
      post({
        source: 'doc',
        engine: 'xelatex',
        passes: 2,
        bibliography: 'biber',
        timeout: 12_000,
        files: { 'refs.bib': Buffer.from('@book{x}').toString('base64') },
      }),
    );

    expect(res.status).toBe(200);
    expect(captured?.source).toBe('doc');
    expect(captured?.options.engine).toBe('xelatex');
    expect(captured?.options.passes).toBe(2);
    expect(captured?.options.bibliography).toBe('biber');
    expect(captured?.options.timeout).toBe(12_000);
    expect(captured?.options.files?.['refs.bib']).toBeInstanceOf(Buffer);
    expect(captured?.options.files?.['refs.bib']?.toString()).toBe('@book{x}');
  });

  it('rejects a non-string file value with 400', async () => {
    const handler = makeRequestHandler(async () => okResult);
    const res = await handler(post({ source: 'x', files: { 'a.tex': 123 } }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/files\.a\.tex.*base64/);
  });

  it('rejects an invalid `bibliography` value with 400', async () => {
    const handler = makeRequestHandler(async () => okResult);
    const res = await handler(post({ source: 'x', bibliography: 'invalid' }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/bibliography/);
  });

  it('rejects an invalid `engine` value with 400', async () => {
    const handler = makeRequestHandler(async () => okResult);
    const res = await handler(post({ source: 'x', engine: 'invalid-engine' }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/engine/);
  });

  it('rejects an invalid `passes` value with 400', async () => {
    const handler = makeRequestHandler(async () => okResult);
    const res = await handler(post({ source: 'x', passes: 'invalid' }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/passes/);
  });

  it('rejects a non-integer `timeout` with 400', async () => {
    const handler = makeRequestHandler(async () => okResult);
    const res = await handler(post({ source: 'x', timeout: 'not-a-number' }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/timeout/);
  });

  it('rejects a `timeout` below the minimum with 400', async () => {
    const handler = makeRequestHandler(async () => okResult);
    const res = await handler(post({ source: 'x', timeout: 100 }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/timeout/);
  });
});

describe('makeRequestHandler - compile error mapping', () => {
  it('maps a TypeError (bad input) to 400 with the message', async () => {
    const handler = makeRequestHandler(async () => {
      throw new TypeError('platex: source exceeds limit');
    });
    const res = await handler(post({ source: 'x' }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe('platex: source exceeds limit');
  });

  it('maps an upstream service failure to 502', async () => {
    const handler = makeRequestHandler(async () => {
      throw new Error('platex: failed to reach service');
    });
    const res = await handler(post({ source: 'x' }));
    expect(res.status).toBe(502);
  });

  it('maps any other error to a generic 500 without leaking the message', async () => {
    const handler = makeRequestHandler(async () => {
      throw new Error('some internal detail nobody should see');
    });
    const res = await handler(post({ source: 'x' }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error).toBe('Compilation failed');
    expect(JSON.stringify(body)).not.toContain('internal detail');
  });
});

describe('makeRequestHandler - responseFormat json', () => {
  it('returns 200 with pdf:null when compilation produced no PDF', async () => {
    const handler = makeRequestHandler(async () => ({
      pdf: null,
      errors: [
        { type: 'error', file: null, line: null, message: 'boom', context: null, source: 'latex' },
      ],
      warnings: [],
      logs: [],
    }));
    const res = await handler(post({ source: 'x' }), { responseFormat: 'json' });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.pdf).toBeNull();
    expect(body.errors).toHaveLength(1);
  });
});
