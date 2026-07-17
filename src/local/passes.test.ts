import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { BibEngine, Engine } from '../types.js';
import { runPasses } from './passes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', '..', 'test', 'fixtures', 'fake-engines');
const FAKE_LATEX = join(FIXTURES, 'fake-latex.mjs') as Engine;
const FAKE_BIBTEX = join(FIXTURES, 'fake-bibtex.mjs') as BibEngine;

async function setup(source: string) {
  const tmpDir = await mkdtemp(join(tmpdir(), 'platex-passes-test-'));
  await writeFile(join(tmpDir, 'main.tex'), source, 'utf-8');
  return tmpDir;
}

describe('runPasses', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it('runs exactly one pass for a clean document with auto passes', async () => {
    tmpDir = await setup('clean document');

    const result = await runPasses(tmpDir, {
      engine: FAKE_LATEX,
      passes: 'auto',
      bibliography: 'bibtex',
      timeout: 5_000,
    });

    expect(result.logs).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('stops immediately on a fatal first-pass error', async () => {
    tmpDir = await setup('FATAL_ERROR document');

    const result = await runPasses(tmpDir, {
      engine: FAKE_LATEX,
      passes: 'auto',
      bibliography: 'bibtex',
      timeout: 5_000,
    });

    expect(result.logs).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('Undefined control sequence');
  });

  it('reruns automatically when the log signals a rerun is needed, then stops', async () => {
    tmpDir = await setup('RERUN_ONCE document');

    const result = await runPasses(tmpDir, {
      engine: FAKE_LATEX,
      passes: 'auto',
      bibliography: 'bibtex',
      timeout: 5_000,
    });

    expect(result.logs).toHaveLength(2);
    expect(result.logs.map((l) => l.passNumber)).toEqual([1, 2]);
  });

  it('runs a bibliography pass when the aux file signals citations, then a follow-up LaTeX pass', async () => {
    tmpDir = await setup('HAS_CITATION document');

    const result = await runPasses(tmpDir, {
      engine: FAKE_LATEX,
      passes: 'auto',
      bibliography: FAKE_BIBTEX,
      timeout: 5_000,
    });

    // pass 1 (latex) -> bibliography pass -> pass 2 (latex, forced by bibNeeded)
    expect(result.logs).toHaveLength(3);
    expect(result.logs[0]?.engine).toBe(FAKE_LATEX);
    expect(result.logs[1]?.engine).toBe(FAKE_BIBTEX);
    expect(result.logs[2]?.engine).toBe(FAKE_LATEX);
    expect(result.warnings.some((w) => w.message.includes('missing journal'))).toBe(true);
  });

  it('skips the bibliography pass when bibliography is "none", even if citations are present', async () => {
    tmpDir = await setup('HAS_CITATION document');

    const result = await runPasses(tmpDir, {
      engine: FAKE_LATEX,
      passes: 'auto',
      bibliography: 'none',
      timeout: 5_000,
    });

    expect(result.logs).toHaveLength(1);
  });

  it('forces a second pass when passes is explicitly 2, even without a rerun signal', async () => {
    tmpDir = await setup('clean document');

    const result = await runPasses(tmpDir, {
      engine: FAKE_LATEX,
      passes: 2,
      bibliography: 'bibtex',
      timeout: 5_000,
    });

    expect(result.logs).toHaveLength(2);
  });

  it('forces a third pass when passes is explicitly 3', async () => {
    tmpDir = await setup('clean document');

    const result = await runPasses(tmpDir, {
      engine: FAKE_LATEX,
      passes: 3,
      bibliography: 'bibtex',
      timeout: 5_000,
    });

    expect(result.logs).toHaveLength(3);
  });

  it('does not run a third pass when passes is explicitly 2, even if the engine keeps asking for a rerun', async () => {
    tmpDir = await setup('ALWAYS_RERUN document');

    const result = await runPasses(tmpDir, {
      engine: FAKE_LATEX,
      passes: 2,
      bibliography: 'bibtex',
      timeout: 5_000,
    });

    expect(result.logs).toHaveLength(2);
  });

  it('caps at three passes in auto mode even if the engine keeps asking for a rerun', async () => {
    tmpDir = await setup('ALWAYS_RERUN document');

    const result = await runPasses(tmpDir, {
      engine: FAKE_LATEX,
      passes: 'auto',
      bibliography: 'bibtex',
      timeout: 5_000,
    });

    expect(result.logs).toHaveLength(3);
  });

  it('stops immediately on a pass that crashes without a parsed "!" error, even with passes forced', async () => {
    tmpDir = await setup('CRASH document');

    const result = await runPasses(tmpDir, {
      engine: FAKE_LATEX,
      passes: 3,
      bibliography: 'bibtex',
      timeout: 5_000,
    });

    // Previously: a crash with no parsed error didn't satisfy the old
    // "errors.length > 0 && exitCode !== 0" guard, so passes 2 and 3 would
    // still run pointlessly. Now any non-zero exit stops the pipeline.
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0]?.exitCode).toBe(2);
  });

  it('treats `timeout` as an overall pipeline budget, skipping later passes once it is exhausted', async () => {
    tmpDir = await setup('clean document SLEEP_300');

    const result = await runPasses(tmpDir, {
      engine: FAKE_LATEX,
      passes: 3, // force pass 2 and 3 regardless of rerun signals
      bibliography: 'bibtex',
      timeout: 300,
    });

    // Pass 1 alone consumes (at least) the whole budget, so passes 2 and 3
    // must be skipped even though `passes: 3` explicitly asked for them.
    expect(result.logs).toHaveLength(1);
  }, 10_000);

  it('deduplicates an identical non-fatal error reported across multiple passes', async () => {
    tmpDir = await setup('SOFT_ERROR_TWICE RERUN_ONCE document');

    const result = await runPasses(tmpDir, {
      engine: FAKE_LATEX,
      passes: 'auto',
      bibliography: 'bibtex',
      timeout: 5_000,
    });

    expect(result.logs).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toBe('Some problem.');
  });

  it('keeps genuinely different errors reported on passes 2 and 3 (no over-deduplication)', async () => {
    tmpDir = await setup('DISTINCT_ERROR_PER_PASS document');

    const result = await runPasses(tmpDir, {
      engine: FAKE_LATEX,
      passes: 3, // force all three passes
      bibliography: 'bibtex',
      timeout: 5_000,
    });

    expect(result.logs).toHaveLength(3);
    // One distinct error per pass — none collapsed by the dedup guard.
    expect(result.errors.map((e) => e.message)).toEqual([
      'Distinct problem 1.',
      'Distinct problem 2.',
      'Distinct problem 3.',
    ]);
  });

  it('does not collapse errors that share a message but differ in line number', async () => {
    tmpDir = await setup('SAME_MSG_DIFF_LINE document');

    const result = await runPasses(tmpDir, {
      engine: FAKE_LATEX,
      passes: 3,
      bibliography: 'bibtex',
      timeout: 5_000,
    });

    expect(result.logs).toHaveLength(3);
    // Same message each pass, but lines 1/2/3 — all three kept.
    expect(result.errors).toHaveLength(3);
    expect(result.errors.map((e) => e.line)).toEqual([1, 2, 3]);
  });

  it('stops when a forced later pass exits non-zero, keeping the error from that pass', async () => {
    tmpDir = await setup('FAIL_ON_PASS_2 document');

    const result = await runPasses(tmpDir, {
      engine: FAKE_LATEX,
      passes: 3, // asks for three passes, but pass 2 fails
      bibliography: 'bibtex',
      timeout: 5_000,
    });

    // pass 1 (ok) -> pass 2 (exit 1) -> stop before pass 3
    expect(result.logs).toHaveLength(2);
    expect(result.logs[1]?.exitCode).toBe(1);
    expect(result.errors.some((e) => e.message === 'Pass two failed.')).toBe(true);
  });
});
