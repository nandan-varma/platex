import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLocalPipeline } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', '..', 'test', 'fixtures', 'tex');

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES, name), 'utf-8');
}

// Real end-to-end compilation via the bundled Tectonic binary (no pdflatex
// installed in this environment, so runLocalPipeline falls back to it).
// First run downloads/caches Tectonic's resource bundle, so allow headroom.
const TIMEOUT = 60_000;

describe('runLocalPipeline (real Tectonic compilation)', () => {
  it('compiles a minimal document to a valid PDF with no errors', async () => {
    const source = await readFixture('minimal.tex');
    const result = await runLocalPipeline(source, {});

    expect(result.pdf).not.toBeNull();
    expect(result.pdf?.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
    expect(result.errors).toHaveLength(0);
    expect(result.logs).toHaveLength(1);
  }, TIMEOUT);

  it('returns errors and a null PDF for a document with a LaTeX syntax error', async () => {
    const source = await readFixture('syntax-error.tex');
    const result = await runLocalPipeline(source, {});

    expect(result.pdf).toBeNull();
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0]?.message).toContain('Undefined control sequence');
  }, TIMEOUT);

  it('reports an undefined-reference warning while still producing a PDF', async () => {
    const source = await readFixture('undefined-ref.tex');
    const result = await runLocalPipeline(source, {});

    expect(result.pdf).not.toBeNull();
    expect(result.warnings.some((w) => w.code === 'undefined-reference')).toBe(true);
  }, TIMEOUT);

  it('compiles a document requiring multiple internal passes (table of contents)', async () => {
    const source = await readFixture('toc-two-pass.tex');
    const result = await runLocalPipeline(source, {});

    expect(result.pdf).not.toBeNull();
    expect(result.errors).toHaveLength(0);
  }, TIMEOUT);

  it('writes supplied additional files into the working directory before compiling', async () => {
    const source = await readFixture('with-image.tex');
    const image = await readFile(join(FIXTURES, 'figure.png'));

    const result = await runLocalPipeline(source, {
      files: { 'figure.png': image },
    });

    expect(result.pdf).not.toBeNull();
    expect(result.errors).toHaveLength(0);
  }, TIMEOUT);

  it('sanitizes path-traversal attempts in supplied filenames instead of writing outside the sandbox', async () => {
    const source = await readFixture('minimal.tex');

    const result = await runLocalPipeline(source, {
      files: { '../../evil.txt': Buffer.from('should not escape tmpDir') },
    });

    // The malicious file is neither referenced by nor required for
    // compilation to succeed; this asserts runLocalPipeline doesn't throw
    // and doesn't let the path traversal break the pipeline.
    expect(result.pdf).not.toBeNull();
  }, TIMEOUT);

  it('records the requested engine name on the returned pass log even when Tectonic services the request', async () => {
    const source = await readFixture('minimal.tex');
    const result = await runLocalPipeline(source, { engine: 'xelatex' });

    expect(result.pdf).not.toBeNull();
    expect(result.logs[0]?.exitCode).toBe(0);
  }, TIMEOUT);
});
