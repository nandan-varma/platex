import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runEngine, spawnProcess } from './compiler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAKE_LATEX = join(
  __dirname,
  '..',
  '..',
  'test',
  'fixtures',
  'fake-engines',
  'fake-latex.mjs',
);

describe('spawnProcess', () => {
  it('captures stdout and stderr from a real child process', async () => {
    const result = await spawnProcess(
      process.execPath,
      ['-e', "process.stdout.write('out-data'); process.stderr.write('err-data');"],
      process.cwd(),
      5_000,
    );
    expect(result.stdout).toBe('out-data');
    expect(result.stderr).toBe('err-data');
    expect(result.exitCode).toBe(0);
  });

  it('reports a non-zero exit code from the child process', async () => {
    const result = await spawnProcess(
      process.execPath,
      ['-e', 'process.exit(3)'],
      process.cwd(),
      5_000,
    );
    expect(result.exitCode).toBe(3);
  });

  it('kills the process and resolves once the timeout elapses', async () => {
    const started = Date.now();
    const result = await spawnProcess(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 10_000)'],
      process.cwd(),
      300,
    );
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(5_000);
    expect(result.exitCode).not.toBe(0);
  });

  it('resolves with exit code 127 when the binary does not exist', async () => {
    const result = await spawnProcess(
      'platex-definitely-not-a-real-binary',
      [],
      process.cwd(),
      5_000,
    );
    expect(result.exitCode).toBe(127);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

describe('runEngine', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'platex-compiler-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('runs the engine and returns the parsed main.log contents', async () => {
    await writeFile(join(tmpDir, 'main.tex'), 'clean document', 'utf-8');

    const result = await runEngine({
      engine: FAKE_LATEX as never,
      tmpDir,
      passNumber: 1,
      timeout: 5_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.passNumber).toBe(1);
    expect(result.log).toContain('This is pdfTeX');
    const pdf = await readFile(join(tmpDir, 'main.pdf'), 'utf-8');
    expect(pdf).toContain('%PDF-1.4');
  });

  it('falls back to stdout when main.log was not written', async () => {
    await writeFile(join(tmpDir, 'main.tex'), 'NO_LOG_FILE clean document', 'utf-8');

    const result = await runEngine({
      engine: FAKE_LATEX as never,
      tmpDir,
      passNumber: 1,
      timeout: 5_000,
    });

    expect(result.log).toContain('This is pdfTeX');
  });

  it('surfaces a non-zero exit code and error log for a fatal engine failure', async () => {
    await writeFile(join(tmpDir, 'main.tex'), 'FATAL_ERROR document', 'utf-8');

    const result = await runEngine({
      engine: FAKE_LATEX as never,
      tmpDir,
      passNumber: 1,
      timeout: 5_000,
    });

    expect(result.exitCode).toBe(1);
    expect(result.log).toContain('! Undefined control sequence.');
  });

  it('invokes the engine with the expected LaTeX CLI flags', async () => {
    await writeFile(join(tmpDir, 'main.tex'), 'ARGS_ECHO', 'utf-8');
    const echoScript = join(tmpDir, 'echo-args.mjs');
    await writeFile(
      echoScript,
      '#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\n',
      'utf-8',
    );
    const { chmod } = await import('node:fs/promises');
    await chmod(echoScript, 0o755);

    const result = await runEngine({
      engine: echoScript as never,
      tmpDir,
      passNumber: 1,
      timeout: 5_000,
    });

    const args: string[] = JSON.parse(result.stdout);
    expect(args).toContain('-interaction=nonstopmode');
    expect(args).toContain('-halt-on-error');
    expect(args).toContain('-file-line-error');
    expect(args).toContain(`-output-directory=${tmpDir}`);
    expect(args[args.length - 1]).toBe('main.tex');
  });
});
