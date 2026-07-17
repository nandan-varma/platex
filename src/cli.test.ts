import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from './cli.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'test', 'fixtures', 'tex');

// Compile tests run the real local pipeline (bundled Tectonic — same as the
// rest of the suite). First run may fetch Tectonic's resource bundle.
const TIMEOUT = 60_000;

interface CapturedIO {
  stdout: string[];
  stderr: string[];
}

function makeIO(cwd: string): CapturedIO & { io: Parameters<typeof runCli>[1] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      cwd,
      color: false,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    },
  };
}

describe('runCli argument handling', () => {
  it('prints usage and exits 2 when no input file is given', async () => {
    const { io, stderr } = makeIO(process.cwd());
    expect(await runCli([], io)).toBe(2);
    expect(stderr.join('\n')).toContain('missing input file');
    expect(stderr.join('\n')).toContain('Usage: platex');
  });

  it('rejects an unknown --engine value', async () => {
    const { io, stderr } = makeIO(process.cwd());
    expect(await runCli(['main.tex', '--engine', 'latexmk'], io)).toBe(2);
    expect(stderr.join('\n')).toContain("invalid --engine 'latexmk'");
  });

  it('rejects an unknown flag', async () => {
    const { io } = makeIO(process.cwd());
    expect(await runCli(['main.tex', '--frobnicate'], io)).toBe(2);
  });

  it('rejects a non-integer --timeout', async () => {
    const { io, stderr } = makeIO(process.cwd());
    expect(await runCli(['main.tex', '--timeout', 'soon'], io)).toBe(2);
    expect(stderr.join('\n')).toContain("invalid --timeout 'soon'");
  });

  it('rejects extra positional arguments', async () => {
    const { io, stderr } = makeIO(process.cwd());
    expect(await runCli(['a.tex', 'b.tex'], io)).toBe(2);
    expect(stderr.join('\n')).toContain('unexpected extra argument');
  });

  it('rejects --watch combined with stdin input', async () => {
    const { io, stderr } = makeIO(process.cwd());
    expect(await runCli(['-', '--watch'], io)).toBe(2);
    expect(stderr.join('\n')).toContain('--watch cannot be combined with stdin');
  });

  it('exits 2 with a clear message when the input file does not exist', async () => {
    const { io, stderr } = makeIO(process.cwd());
    expect(await runCli(['no-such-file.tex'], io)).toBe(2);
    expect(stderr.join('\n')).toContain('no-such-file.tex');
  });

  it('--help prints usage and exits 0', async () => {
    const { io, stdout } = makeIO(process.cwd());
    expect(await runCli(['--help'], io)).toBe(0);
    expect(stdout.join('\n')).toContain('Usage: platex');
  });

  it('--version prints the package version and exits 0', async () => {
    const { io, stdout } = makeIO(process.cwd());
    expect(await runCli(['--version'], io)).toBe(0);
    const pkg = JSON.parse(await readFile(join(__dirname, '..', 'package.json'), 'utf-8')) as {
      version: string;
    };
    expect(stdout[0]).toBe(pkg.version);
  });
});

describe('runCli compilation (real Tectonic)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'platex-cli-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it(
    'compiles a document to <input>.pdf by default and reports success',
    async () => {
      const source = await readFile(join(FIXTURES, 'minimal.tex'), 'utf-8');
      await writeFile(join(dir, 'doc.tex'), source);

      const { io, stderr } = makeIO(dir);
      expect(await runCli(['doc.tex'], io)).toBe(0);

      const pdf = await readFile(join(dir, 'doc.pdf'));
      expect(pdf.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
      expect(stderr.join('\n')).toContain('✓ wrote doc.pdf');
    },
    TIMEOUT,
  );

  it(
    'writes to the path given by --output',
    async () => {
      const source = await readFile(join(FIXTURES, 'minimal.tex'), 'utf-8');
      await writeFile(join(dir, 'doc.tex'), source);

      const { io } = makeIO(dir);
      expect(await runCli(['doc.tex', '-o', 'build/out.pdf'], io)).toBe(0);

      const pdf = await readFile(join(dir, 'build', 'out.pdf'));
      expect(pdf.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
    },
    TIMEOUT,
  );

  it(
    'exits 1 and prints structured errors for a failing document',
    async () => {
      const source = await readFile(join(FIXTURES, 'syntax-error.tex'), 'utf-8');
      await writeFile(join(dir, 'bad.tex'), source);

      const { io, stderr } = makeIO(dir);
      expect(await runCli(['bad.tex'], io)).toBe(1);
      const err = stderr.join('\n');
      expect(err).toContain('Undefined control sequence');
      expect(err).toContain('✗ compile failed');
    },
    TIMEOUT,
  );

  it(
    '--json prints a full CompileResult on stdout and skips the PDF file unless -o is given',
    async () => {
      const source = await readFile(join(FIXTURES, 'minimal.tex'), 'utf-8');
      await writeFile(join(dir, 'doc.tex'), source);

      const { io, stdout } = makeIO(dir);
      expect(await runCli(['doc.tex', '--json'], io)).toBe(0);

      const payload = JSON.parse(stdout.join('')) as {
        pdf: string | null;
        errors: unknown[];
        logs: unknown[];
      };
      expect(payload.pdf).not.toBeNull();
      expect(Buffer.from(payload.pdf as string, 'base64').subarray(0, 5).toString('utf-8')).toBe(
        '%PDF-',
      );
      expect(payload.errors).toHaveLength(0);
      expect(payload.logs.length).toBeGreaterThanOrEqual(1);

      await expect(readFile(join(dir, 'doc.pdf'))).rejects.toThrow();
    },
    TIMEOUT,
  );

  it(
    'reads source from stdin when the input is "-"',
    async () => {
      const source = await readFile(join(FIXTURES, 'minimal.tex'), 'utf-8');
      const { io } = makeIO(dir);
      expect(await runCli(['-', '-o', 'stdin.pdf'], { ...io, stdin: async () => source })).toBe(0);

      const pdf = await readFile(join(dir, 'stdin.pdf'));
      expect(pdf.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
    },
    TIMEOUT,
  );

  it(
    'attaches --file entries relative to the input file directory',
    async () => {
      const source = await readFile(join(FIXTURES, 'with-image.tex'), 'utf-8');
      await writeFile(join(dir, 'doc.tex'), source);
      await writeFile(join(dir, 'figure.png'), await readFile(join(FIXTURES, 'figure.png')));

      const { io } = makeIO(dir);
      expect(await runCli(['doc.tex', '--file', 'figure.png'], io)).toBe(0);

      const pdf = await readFile(join(dir, 'doc.pdf'));
      expect(pdf.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
    },
    TIMEOUT,
  );

  it('exits 2 when an attached file does not exist', async () => {
    const source = await readFile(join(FIXTURES, 'minimal.tex'), 'utf-8');
    await writeFile(join(dir, 'doc.tex'), source);

    const { io, stderr } = makeIO(dir);
    expect(await runCli(['doc.tex', '--file', 'missing.png'], io)).toBe(2);
    expect(stderr.join('\n')).toContain('missing.png');
  });
});
