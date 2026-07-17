import { describe, it, expect, vi, afterEach } from 'vitest';
import { callRemote } from './client.js';
import type { CompileResponse } from '../types.js';

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
    expect(capturedBody['engine']).toBe('pdflatex');
    expect(capturedBody['passes']).toBe('auto');
    expect(capturedBody['bibliography']).toBe('bibtex');
    expect(capturedBody['timeout']).toBe(30_000);
    expect(capturedBody['files']).toEqual({ 'refs.bib': Buffer.from('bib content').toString('base64') });
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

    expect(capturedBody['engine']).toBe('xelatex');
    expect(capturedBody['passes']).toBe(2);
    expect(capturedBody['bibliography']).toBe('biber');
    expect(capturedBody['timeout']).toBe(5_000);
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
      errors: [{ type: 'error', file: 'main.tex', line: 3, message: 'boom', context: null, source: 'latex' }],
      warnings: [{ type: 'warning', code: 'other', file: null, line: null, message: 'careful' }],
      logs: [{ passNumber: 1, engine: 'pdflatex', stdout: '', stderr: '', log: '', exitCode: 1 }],
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(response)));

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

  it('wraps a network-level fetch failure with the service URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    await expect(callRemote('src', { serviceUrl: 'http://localhost:3001' })).rejects.toThrow(
      /platex: failed to reach service at http:\/\/localhost:3001/,
    );
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
});
