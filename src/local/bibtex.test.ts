import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectBibliography, runBibliography } from './bibtex.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAKE_BIBTEX = join(
  __dirname,
  '..',
  '..',
  'test',
  'fixtures',
  'fake-engines',
  'fake-bibtex.mjs',
);

describe('detectBibliography', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'platex-bibtex-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns true when main.aux has both \\citation and \\bibdata', async () => {
    await writeFile(join(tmpDir, 'main.aux'), '\\citation{smith2023}\n\\bibdata{refs}\n', 'utf-8');
    expect(await detectBibliography(tmpDir, 'bibtex')).toBe(true);
  });

  it('returns false when main.aux has only \\citation', async () => {
    await writeFile(join(tmpDir, 'main.aux'), '\\citation{smith2023}\n', 'utf-8');
    expect(await detectBibliography(tmpDir, 'bibtex')).toBe(false);
  });

  it('returns false when main.aux does not exist', async () => {
    expect(await detectBibliography(tmpDir, 'bibtex')).toBe(false);
  });

  it('returns true when main.bcf exists (biber)', async () => {
    await writeFile(join(tmpDir, 'main.bcf'), '', 'utf-8');
    expect(await detectBibliography(tmpDir, 'biber')).toBe(true);
  });

  it('returns false when main.bcf does not exist (biber)', async () => {
    expect(await detectBibliography(tmpDir, 'biber')).toBe(false);
  });
});

describe('runBibliography', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'platex-bibtex-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null immediately when bibEngine is "none"', async () => {
    const result = await runBibliography({
      bibEngine: 'none',
      tmpDir,
      passNumber: 2,
      timeout: 5_000,
    });
    expect(result).toBeNull();
  });

  it('runs bibtex and reads the resulting .blg log', async () => {
    await writeFile(join(tmpDir, 'main.aux'), '\\citation{smith2023}\n\\bibdata{refs}\n', 'utf-8');

    const result = await runBibliography({
      bibEngine: FAKE_BIBTEX as never,
      tmpDir,
      passNumber: 2,
      timeout: 5_000,
    });

    expect(result).not.toBeNull();
    expect(result?.exitCode).toBe(0);
    expect(result?.log).toContain('Warning--missing journal');
    const bbl = await readFile(join(tmpDir, 'main.bbl'), 'utf-8');
    expect(bbl).toContain('thebibliography');
  });

  it('surfaces a non-zero exit code on bibliography failure', async () => {
    await writeFile(
      join(tmpDir, 'main.aux'),
      'BIB_ERROR\n\\citation{x}\n\\bibdata{refs}\n',
      'utf-8',
    );

    const result = await runBibliography({
      bibEngine: FAKE_BIBTEX as never,
      tmpDir,
      passNumber: 2,
      timeout: 5_000,
    });

    expect(result?.exitCode).toBe(1);
    expect(result?.log).toContain('error message');
  });

  it('invokes bibtex with just the aux basename (no extension) as its argument', async () => {
    // bibtex.ts branches on the literal string 'bibtex' to pick CLI args, and
    // spawns that same literal name as the command — so to observe the args
    // it actually passes, a real `bibtex` executable must be first on PATH.
    await writeFile(join(tmpDir, 'main.aux'), '', 'utf-8');
    const binDir = await mkdtemp(join(tmpdir(), 'platex-fakebin-'));
    const fakeBibtexPath = join(binDir, 'bibtex');
    await writeFile(
      fakeBibtexPath,
      '#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\n',
      'utf-8',
    );
    const { chmod } = await import('node:fs/promises');
    await chmod(fakeBibtexPath, 0o755);

    const originalPath = process.env.PATH;
    process.env.PATH = `${binDir}:${originalPath}`;
    try {
      const result = await runBibliography({
        bibEngine: 'bibtex',
        tmpDir,
        passNumber: 2,
        timeout: 5_000,
      });
      const args = JSON.parse(result?.stdout ?? '[]');
      expect(args).toEqual(['main']);
    } finally {
      process.env.PATH = originalPath;
      await rm(binDir, { recursive: true, force: true });
    }
  });
});
