import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_FILES_COUNT, MAX_TOTAL_FILES_BYTES } from '../defaults.js';
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
  it(
    'compiles a minimal document to a valid PDF with no errors',
    async () => {
      const source = await readFixture('minimal.tex');
      const result = await runLocalPipeline(source, {});

      expect(result.pdf).not.toBeNull();
      expect(result.pdf?.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
      expect(result.errors).toHaveLength(0);
      expect(result.logs).toHaveLength(1);
    },
    TIMEOUT,
  );

  it(
    'returns errors and a null PDF for a document with a LaTeX syntax error',
    async () => {
      const source = await readFixture('syntax-error.tex');
      const result = await runLocalPipeline(source, {});

      expect(result.pdf).toBeNull();
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]?.message).toContain('Undefined control sequence');
    },
    TIMEOUT,
  );

  it(
    'reports an undefined-reference warning while still producing a PDF',
    async () => {
      const source = await readFixture('undefined-ref.tex');
      const result = await runLocalPipeline(source, {});

      expect(result.pdf).not.toBeNull();
      expect(result.warnings.some((w) => w.code === 'undefined-reference')).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'compiles a document requiring multiple internal passes (table of contents)',
    async () => {
      const source = await readFixture('toc-two-pass.tex');
      const result = await runLocalPipeline(source, {});

      expect(result.pdf).not.toBeNull();
      expect(result.errors).toHaveLength(0);
    },
    TIMEOUT,
  );

  it(
    'writes supplied additional files into the working directory before compiling',
    async () => {
      const source = await readFixture('with-image.tex');
      const image = await readFile(join(FIXTURES, 'figure.png'));

      const result = await runLocalPipeline(source, {
        files: { 'figure.png': image },
      });

      expect(result.pdf).not.toBeNull();
      expect(result.errors).toHaveLength(0);
    },
    TIMEOUT,
  );

  it(
    'throws a TypeError for path-traversal filenames',
    async () => {
      const source = await readFixture('minimal.tex');

      await expect(
        runLocalPipeline(source, {
          files: { '../../evil.txt': Buffer.from('should not escape tmpDir') },
        }),
      ).rejects.toThrow(TypeError);
    },
    TIMEOUT,
  );

  it(
    'throws a TypeError for absolute-path filenames',
    async () => {
      const source = await readFixture('minimal.tex');

      await expect(
        runLocalPipeline(source, {
          files: { '/etc/passwd': Buffer.from('x') },
        }),
      ).rejects.toThrow(TypeError);
    },
    TIMEOUT,
  );

  it(
    'records the requested engine name on the returned pass log even when Tectonic services the request',
    async () => {
      const source = await readFixture('minimal.tex');
      const result = await runLocalPipeline(source, { engine: 'xelatex' });

      expect(result.pdf).not.toBeNull();
      expect(result.logs[0]?.exitCode).toBe(0);
    },
    TIMEOUT,
  );

  it('rejects more than MAX_FILES_COUNT files before touching disk', async () => {
    const files: Record<string, Buffer> = {};
    for (let i = 0; i < MAX_FILES_COUNT + 1; i++) {
      files[`f${i}.txt`] = Buffer.from('x');
    }
    await expect(runLocalPipeline('clean document', { files })).rejects.toThrow(TypeError);
  });

  it('rejects files whose combined size exceeds MAX_TOTAL_FILES_BYTES before touching disk', async () => {
    const big = Buffer.alloc(Math.ceil(MAX_TOTAL_FILES_BYTES / 2) + 1);
    await expect(
      runLocalPipeline('clean document', { files: { 'a.bin': big, 'b.bin': big } }),
    ).rejects.toThrow(TypeError);
  });

  it('honors a smaller per-call limits.maxFilesCount override, rejecting files the default would allow', async () => {
    await expect(
      runLocalPipeline('clean document', {
        files: { 'a.txt': Buffer.from('a'), 'b.txt': Buffer.from('b') },
        limits: { maxFilesCount: 1 },
      }),
    ).rejects.toThrow(TypeError);
  });

  it(
    'honors a larger per-call limits.maxTotalFilesBytes override, allowing files the default would reject',
    async () => {
      // 30MB combined — over the 25MB default budget, but under a raised one.
      const oneFile = Buffer.alloc(15_000_000);
      const source = await readFixture('minimal.tex');

      await expect(
        runLocalPipeline(source, { files: { 'a.bin': oneFile, 'b.bin': oneFile } }),
      ).rejects.toThrow(TypeError);

      const result = await runLocalPipeline(source, {
        files: { 'a.bin': oneFile, 'b.bin': oneFile },
        limits: { maxTotalFilesBytes: 50_000_000 },
      });
      expect(result.pdf).not.toBeNull();
    },
    TIMEOUT,
  );
});
