import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './cli.js';
import type { CompileResponse } from './types.js';

/** Poll until `predicate()` is true or the deadline passes (for watch-mode async). */
async function waitFor(predicate: () => boolean, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await new Promise((r) => setTimeout(r, 50));
  }
}

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
      expect(
        Buffer.from(payload.pdf as string, 'base64')
          .subarray(0, 5)
          .toString('utf-8'),
      ).toBe('%PDF-');
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

describe('runCli option parsing', () => {
  it.each([
    ['--passes', '4', "invalid --passes '4'"],
    ['--bib', 'latex', "invalid --bib 'latex'"],
    ['--timeout', '0', "invalid --timeout '0'"], // below the minimum
    ['--timeout', '1.5', "invalid --timeout '1.5'"], // non-integer
  ])('rejects %s %s with exit 2', async (flag, value, message) => {
    const { io, stderr } = makeIO(process.cwd());
    expect(await runCli(['main.tex', flag, value], io)).toBe(2);
    expect(stderr.join('\n')).toContain(message);
  });

  it('exits 2 (not 1) when source read from stdin exceeds the source byte limit', async () => {
    // Drives the "compile() threw a TypeError" path without needing TeX.
    const { io, stderr } = makeIO(process.cwd());
    const huge = 'x'.repeat(5_000_001);
    const code = await runCli(['-', '-o', 'out.pdf'], { ...io, stdin: async () => huge });
    expect(code).toBe(2);
    expect(stderr.join('\n')).toContain('platex:');
  });
});

describe('runCli remote compilation (mocked service)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes through --service-url with --api-key and writes the returned PDF', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'platex-cli-remote-'));
    try {
      let capturedAuth = '';
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) => {
          capturedAuth = (init.headers as Record<string, string>).Authorization ?? '';
          const body: CompileResponse = {
            pdf: Buffer.from('%PDF-1.4 remote').toString('base64'),
            errors: [],
            warnings: [],
            logs: [],
          };
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }),
      );

      const { io } = makeIO(dir);
      const code = await runCli(
        [
          '-',
          '-o',
          'remote.pdf',
          '--service-url',
          'http://localhost:9999',
          '--api-key',
          'k3y',
          '--retry',
          '0',
        ],
        { ...io, stdin: async () => '\\documentclass{article}\\begin{document}hi\\end{document}' },
      );

      expect(code).toBe(0);
      expect(capturedAuth).toBe('Bearer k3y');
      const pdf = await readFile(join(dir, 'remote.pdf'));
      expect(pdf.toString('utf-8')).toContain('%PDF-1.4 remote');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('runCli output & formatting (mocked service)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'platex-cli-fmt-'));
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(dir, { recursive: true, force: true });
  });

  function mockService(response: CompileResponse): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
  }

  const remoteArgs = (extra: string[]) => ['-', ...extra, '--service-url', 'http://localhost:9999'];
  const stdinSrc = { stdin: async () => 'src' };

  it('exits 1 with a clear message when a compile fails with no parseable error', async () => {
    mockService({ pdf: null, errors: [], warnings: [], logs: [] });
    const { io, stderr } = makeIO(dir);
    expect(await runCli(remoteArgs(['-o', 'x.pdf']), { ...io, ...stdinSrc })).toBe(1);
    expect(stderr.join('\n')).toContain('compile failed without a parsable error');
  });

  it('--json emits pdf:null for a failed compile and still exits 1', async () => {
    mockService({ pdf: null, errors: [], warnings: [], logs: [] });
    const { io, stdout } = makeIO(dir);
    expect(await runCli(remoteArgs(['--json']), { ...io, ...stdinSrc })).toBe(1);
    expect(JSON.parse(stdout.join('')).pdf).toBeNull();
  });

  it('prints warnings whether or not they carry a file/line location', async () => {
    mockService({
      pdf: Buffer.from('%PDF-1.4').toString('base64'),
      errors: [],
      warnings: [
        { type: 'warning', code: 'other', file: null, line: null, message: 'no location' },
        { type: 'warning', code: 'other', file: 'main.tex', line: null, message: 'file only' },
        { type: 'warning', code: 'other', file: 'main.tex', line: 7, message: 'file and line' },
      ],
      logs: [],
    });
    const { io, stderr } = makeIO(dir);
    expect(await runCli(remoteArgs(['-o', 'ok.pdf']), { ...io, ...stdinSrc })).toBe(0);
    const err = stderr.join('\n');
    expect(err).toContain('no location');
    expect(err).toContain('main.tex:7');
  });

  it('reports byte sizes for tiny (<1KB) and large (>1MB) PDFs', async () => {
    // <1KB
    mockService({ pdf: Buffer.alloc(100).toString('base64'), errors: [], warnings: [], logs: [] });
    let cap = makeIO(dir);
    expect(await runCli(remoteArgs(['-o', 'small.pdf']), { ...cap.io, ...stdinSrc })).toBe(0);
    expect(cap.stderr.join('\n')).toMatch(/✓ wrote small\.pdf \(100 B,/);

    // >1MB
    vi.unstubAllGlobals();
    mockService({
      pdf: Buffer.alloc(1_500_000).toString('base64'),
      errors: [],
      warnings: [],
      logs: [],
    });
    cap = makeIO(dir);
    expect(await runCli(remoteArgs(['-o', 'big.pdf']), { ...cap.io, ...stdinSrc })).toBe(0);
    expect(cap.stderr.join('\n')).toMatch(/✓ wrote big\.pdf \(1\.4 MB,/);
  });

  it('exits 2 when the output path cannot be written', async () => {
    mockService({
      pdf: Buffer.from('%PDF-1.4').toString('base64'),
      errors: [],
      warnings: [],
      logs: [],
    });
    // Put a *file* where the output directory needs to be, so mkdir -p fails.
    await writeFile(join(dir, 'blocked'), 'x');
    const { io, stderr } = makeIO(dir);
    expect(await runCli(remoteArgs(['-o', 'blocked/out.pdf']), { ...io, ...stdinSrc })).toBe(2);
    expect(stderr.join('\n')).toContain('could not write output');
  });

  it('defaults the stdin output name to out.pdf and skips writing it in --json mode', async () => {
    mockService({
      pdf: Buffer.from('%PDF-1.4').toString('base64'),
      errors: [],
      warnings: [],
      logs: [],
    });
    const { io, stdout } = makeIO(dir);
    expect(await runCli(remoteArgs(['--json']), { ...io, ...stdinSrc })).toBe(0);
    expect(JSON.parse(stdout.join('')).pdf).not.toBeNull();
    await expect(readFile(join(dir, 'out.pdf'))).rejects.toThrow(); // not written
  });

  it('accepts auto, 2 and 3 as valid --passes values', async () => {
    mockService({
      pdf: Buffer.from('%PDF-1.4').toString('base64'),
      errors: [],
      warnings: [],
      logs: [],
    });
    for (const n of ['auto', '2', '3']) {
      const { io } = makeIO(dir);
      expect(
        await runCli(remoteArgs(['--passes', n, '-o', `p-${n}.pdf`]), { ...io, ...stdinSrc }),
      ).toBe(0);
    }
  });

  it('stops watch mode immediately when handed an already-aborted signal', async () => {
    mockService({ pdf: null, errors: [], warnings: [], logs: [] });
    const source = 'src';
    await writeFile(join(dir, 'doc.tex'), source);
    const { io } = makeIO(dir);
    const code = await runCli(['doc.tex', '-w', '--service-url', 'http://localhost:9999'], {
      ...io,
      signal: AbortSignal.abort(),
    });
    expect(typeof code).toBe('number'); // returns rather than hanging on the watch loop
  });
});

describe('runCli default I/O and color', () => {
  it('uses process streams and TTY color detection when io fields are omitted', async () => {
    const outSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const errSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      // io = {} exercises the cwd/stdout/color defaults.
      expect(await runCli(['--help'], {})).toBe(0);
      expect(outSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: platex'));
      // A usage error with default io exercises the stderr default too.
      expect(await runCli([], {})).toBe(2);
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('missing input file'));
    } finally {
      outSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it('emits ANSI color codes when color is forced on', async () => {
    const stderr: string[] = [];
    // A usage error routes through the red() painter.
    expect(await runCli(['a.tex', 'b.tex'], { color: true, stderr: (t) => stderr.push(t) })).toBe(
      2,
    );
    expect(stderr.join('\n')).toContain('\x1b[31m');
  });
});

describe('runCli compilation - extra paths (real Tectonic)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'platex-cli-extra-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it(
    'applies --passes and --bib options and still compiles',
    async () => {
      const source = await readFile(join(FIXTURES, 'minimal.tex'), 'utf-8');
      await writeFile(join(dir, 'doc.tex'), source);

      const { io } = makeIO(dir);
      expect(await runCli(['doc.tex', '--passes', '1', '--bib', 'none'], io)).toBe(0);
      expect((await readFile(join(dir, 'doc.pdf'))).subarray(0, 5).toString()).toBe('%PDF-');
    },
    TIMEOUT,
  );

  it(
    'prints warnings to stderr for a document with an undefined reference',
    async () => {
      const source = await readFile(join(FIXTURES, 'undefined-ref.tex'), 'utf-8');
      await writeFile(join(dir, 'doc.tex'), source);

      const { io, stderr } = makeIO(dir);
      expect(await runCli(['doc.tex'], io)).toBe(0);
      expect(stderr.join('\n')).toMatch(/warning/i);
    },
    TIMEOUT,
  );

  it(
    'attaches every file under a --file directory, keyed relative to that directory',
    async () => {
      const source = await readFile(join(FIXTURES, 'minimal.tex'), 'utf-8');
      await writeFile(join(dir, 'doc.tex'), source);
      await mkdir(join(dir, 'assets', 'nested'), { recursive: true });
      await writeFile(join(dir, 'assets', 'a.txt'), 'a');
      await writeFile(join(dir, 'assets', 'nested', 'b.txt'), 'b');

      const { io } = makeIO(dir);
      expect(await runCli(['doc.tex', '--file', 'assets'], io)).toBe(0);
      expect((await readFile(join(dir, 'doc.pdf'))).subarray(0, 5).toString()).toBe('%PDF-');
    },
    TIMEOUT,
  );

  it(
    'keys a --file outside the input directory by basename only',
    async () => {
      const source = await readFile(join(FIXTURES, 'minimal.tex'), 'utf-8');
      await mkdir(join(dir, 'sub'), { recursive: true });
      await writeFile(join(dir, 'sub', 'doc.tex'), source);
      await writeFile(join(dir, 'shared.txt'), 'shared'); // sits above the input's dir

      const { io } = makeIO(dir);
      // relative(sub, shared.txt) starts with '..', so the key collapses to the basename.
      expect(await runCli(['sub/doc.tex', '--file', 'shared.txt'], io)).toBe(0);
      expect((await readFile(join(dir, 'sub', 'doc.pdf'))).subarray(0, 5).toString()).toBe('%PDF-');
    },
    TIMEOUT,
  );

  it(
    'skips the input file itself when the attached directory contains it',
    async () => {
      const source = await readFile(join(FIXTURES, 'minimal.tex'), 'utf-8');
      await writeFile(join(dir, 'doc.tex'), source);
      await writeFile(join(dir, 'extra.txt'), 'extra');

      const { io } = makeIO(dir);
      // Attaching '.' walks the input's own directory; doc.tex must be skipped
      // (it's the main source, not an attachment).
      expect(await runCli(['doc.tex', '--file', '.'], io)).toBe(0);
      expect((await readFile(join(dir, 'doc.pdf'))).subarray(0, 5).toString()).toBe('%PDF-');
    },
    TIMEOUT,
  );

  it(
    'reads real stdin (process.stdin) when input is "-" and no stdin injector is given',
    async () => {
      const source = await readFile(join(FIXTURES, 'minimal.tex'), 'utf-8');
      const fakeStdin = Readable.from([Buffer.from(source)]);
      const descriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
      Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true });
      try {
        const { io } = makeIO(dir);
        expect(await runCli(['-', '-o', 'from-stdin.pdf'], io)).toBe(0);
        expect((await readFile(join(dir, 'from-stdin.pdf'))).subarray(0, 5).toString()).toBe(
          '%PDF-',
        );
      } finally {
        if (descriptor) Object.defineProperty(process, 'stdin', descriptor);
      }
    },
    TIMEOUT,
  );

  it(
    'watch mode: compiles once, recompiles when the input changes, and stops on abort',
    async () => {
      const source = await readFile(join(FIXTURES, 'minimal.tex'), 'utf-8');
      const docPath = join(dir, 'doc.tex');
      await writeFile(docPath, source);

      const controller = new AbortController();
      const { io, stderr } = makeIO(dir);
      const runPromise = runCli(['doc.tex', '-w'], { ...io, signal: controller.signal });

      const wroteCount = () => stderr.filter((l) => l.includes('✓ wrote')).length;
      await waitFor(() => wroteCount() >= 1);
      expect(stderr.join('\n')).toMatch(/watching \d+ file/);

      // Change the input; watchFile (polling) should trigger a recompile.
      await writeFile(docPath, `${source}\n% touched`);
      await waitFor(() => wroteCount() >= 2);

      controller.abort();
      expect(await runPromise).toBe(0);
    },
    TIMEOUT,
  );
});
