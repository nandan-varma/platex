import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { compile } from './compile-core.js';
import type { BibEngine, CompileOptions, CompileResult, Engine, PassCount } from './types.js';

/**
 * Injectable I/O so the CLI is unit-testable without spawning a process.
 * All fields optional — `runCli(argv)` alone behaves like the real binary.
 */
export interface CliIO {
  /** Receives finished stdout lines (results, --json payload). */
  stdout?: (text: string) => void;
  /** Receives finished stderr lines (progress, warnings, errors). */
  stderr?: (text: string) => void;
  /** Base directory for resolving relative paths. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Force ANSI colors on/off. Defaults to stderr-TTY detection. */
  color?: boolean;
  /** Aborts an in-flight compile and stops `--watch` mode. */
  signal?: AbortSignal | undefined;
  /** Source text to use when the input path is `-` (defaults to reading stdin). */
  stdin?: () => Promise<string>;
}

const ENGINES: readonly Engine[] = ['pdflatex', 'xelatex', 'lualatex', 'tectonic'];
const BIB_ENGINES: readonly BibEngine[] = ['bibtex', 'biber', 'none'];

const USAGE = `Usage: platex <input.tex> [options]

Compile a LaTeX file to PDF — locally via system TeX Live or the bundled
Tectonic binary, or remotely via a platex HTTP service. Pass "-" as the
input to read LaTeX source from stdin.

Options:
  -o, --output <path>      Output PDF path (default: input path with .pdf)
  -e, --engine <name>      pdflatex | xelatex | lualatex | tectonic
  -p, --passes <n>         auto | 1 | 2 | 3 (default: auto)
  -b, --bib <name>         bibtex | biber | none (default: bibtex)
  -f, --file <path>        Attach an extra file or directory (repeatable).
                           Single files are keyed relative to the input file's
                           directory; directories are walked recursively and
                           keyed relative to the directory itself.
  -t, --timeout <ms>       Overall wall-clock budget for the whole pipeline
  -s, --service-url <url>  Compile via a remote platex service
                           (default: PLATEX_SERVICE_URL env var)
      --api-key <key>      Bearer token for the remote service
                           (default: PLATEX_API_KEY env var)
      --retry <n>          Extra attempts on retryable remote failures
  -w, --watch              Recompile whenever the input or attached files change
      --json               Print the full CompileResult as JSON on stdout
                           (pdf base64-encoded); writes the PDF only if -o is given
  -q, --quiet              Only print errors
  -h, --help               Show this help
  -V, --version            Print the version

Exit codes: 0 success, 1 compile failed, 2 usage or environment error`;

interface ParsedCli {
  input: string;
  output: string | undefined;
  filePaths: string[];
  watch: boolean;
  json: boolean;
  quiet: boolean;
  options: CompileOptions;
}

/**
 * Run the platex CLI. Returns the process exit code instead of calling
 * `process.exit`, so it can be driven directly from tests.
 */
export async function runCli(argv: string[], io: CliIO = {}): Promise<number> {
  const cwd = io.cwd ?? process.cwd();
  const color = io.color ?? (typeof process !== 'undefined' && Boolean(process.stderr.isTTY));
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(`${text}\n`));
  const paint = (code: number, text: string): string =>
    color ? `\x1b[${code}m${text}\x1b[0m` : text;
  const red = (text: string) => paint(31, text);
  const yellow = (text: string) => paint(33, text);
  const green = (text: string) => paint(32, text);
  const dim = (text: string) => paint(2, text);

  let parsed: ParsedCli;
  try {
    const early = parseCliArgs(argv);
    if (early === 'help') {
      stdout(USAGE);
      return 0;
    }
    if (early === 'version') {
      stdout(await readOwnVersion());
      return 0;
    }
    parsed = early;
  } catch (err) {
    stderr(red(`platex: ${(err as Error).message}`));
    stderr(`\n${USAGE}`);
    return 2;
  }

  if (io.signal !== undefined) {
    parsed.options.signal = io.signal;
  }

  const fromStdin = parsed.input === '-';
  if (fromStdin && parsed.watch) {
    stderr(red('platex: --watch cannot be combined with stdin input'));
    return 2;
  }

  const inputPath = fromStdin ? null : resolve(cwd, parsed.input);
  const inputDir = inputPath ? dirname(inputPath) : cwd;
  const outputPath = resolve(
    cwd,
    parsed.output ?? (inputPath ? replaceExtension(inputPath, '.pdf') : 'out.pdf'),
  );

  const compileOnce = async (): Promise<{ code: number; watchedPaths: string[] }> => {
    const started = Date.now();
    let source: string;
    let attachments: CollectedFiles;
    try {
      source = inputPath ? await readFile(inputPath, 'utf-8') : await (io.stdin ?? readAllStdin)();
      attachments = await collectFiles(parsed.filePaths, inputDir, inputPath, cwd);
    } catch (err) {
      stderr(red(`platex: ${(err as Error).message}`));
      return { code: 2, watchedPaths: [] };
    }

    const options: CompileOptions = { ...parsed.options };
    if (Object.keys(attachments.files).length > 0) {
      options.files = attachments.files;
    }

    let result: CompileResult;
    try {
      result = await compile(source, options);
    } catch (err) {
      stderr(red(`platex: ${(err as Error).message}`));
      return { code: 2, watchedPaths: attachments.paths };
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    if (parsed.json) {
      stdout(
        JSON.stringify({
          pdf: result.pdf ? result.pdf.toString('base64') : null,
          errors: result.errors,
          warnings: result.warnings,
          logs: result.logs,
        }),
      );
    }

    if (!parsed.quiet && !parsed.json) {
      for (const warning of result.warnings) {
        stderr(yellow(`warning${formatLocation(warning.file, warning.line)}: ${warning.message}`));
      }
    }

    if (!result.pdf) {
      for (const error of result.errors) {
        stderr(red(`error${formatLocation(error.file, error.line)}: ${error.message}`));
        if (error.context && !parsed.quiet) {
          stderr(dim(indent(error.context)));
        }
      }
      if (result.errors.length === 0) {
        stderr(red('platex: compile failed without a parsable error (see logs via --json)'));
      }
      if (!parsed.quiet) {
        stderr(red(`✗ compile failed (${result.errors.length} error(s), ${elapsed}s)`));
      }
      return { code: 1, watchedPaths: attachments.paths };
    }

    if (!parsed.json || parsed.output !== undefined) {
      try {
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, result.pdf);
      } catch (err) {
        stderr(red(`platex: could not write output: ${(err as Error).message}`));
        return { code: 2, watchedPaths: attachments.paths };
      }
      if (!parsed.quiet && !parsed.json) {
        stderr(
          green(
            `✓ wrote ${relative(cwd, outputPath)} (${formatBytes(result.pdf.length)}, ${elapsed}s)`,
          ),
        );
      }
    }
    return { code: 0, watchedPaths: attachments.paths };
  };

  const first = await compileOnce();
  if (!parsed.watch) {
    return first.code;
  }

  return watchLoop({
    initial: first,
    inputPath: inputPath as string,
    compileOnce,
    log: (text) => {
      if (!parsed.quiet) stderr(dim(text));
    },
    signal: io.signal,
  });
}

/** Parsed `--watch` loop: polls the input + attachments, recompiling on change. */
async function watchLoop(ctx: {
  initial: { code: number; watchedPaths: string[] };
  inputPath: string;
  compileOnce: () => Promise<{ code: number; watchedPaths: string[] }>;
  log: (text: string) => void;
  signal: AbortSignal | undefined;
}): Promise<number> {
  const { watchFile, unwatchFile } = await import('node:fs');
  let lastCode = ctx.initial.code;
  let running = false;
  let rerunRequested = false;
  const watched = new Set<string>();

  const run = async (): Promise<void> => {
    /* v8 ignore next 4 -- re-entrancy guard for a change landing mid-compile; racy to trigger deterministically */
    if (running) {
      rerunRequested = true;
      return;
    }
    running = true;
    try {
      do {
        rerunRequested = false;
        ctx.log(`— recompiling (${new Date().toLocaleTimeString()})`);
        const outcome = await ctx.compileOnce();
        lastCode = outcome.code;
        syncWatchers(outcome.watchedPaths);
      } while (rerunRequested);
    } finally {
      running = false;
    }
  };

  const onChange = () => {
    void run();
  };

  const syncWatchers = (paths: string[]): void => {
    const next = new Set([ctx.inputPath, ...paths]);
    for (const path of watched) {
      /* v8 ignore next 4 -- unwatch path only runs when a previously-attached file disappears between compiles; racy to trigger */
      if (!next.has(path)) {
        unwatchFile(path, onChange);
        watched.delete(path);
      }
    }
    for (const path of next) {
      if (!watched.has(path)) {
        watchFile(path, { interval: 300 }, onChange);
        watched.add(path);
      }
    }
  };

  syncWatchers(ctx.initial.watchedPaths);
  ctx.log(`— watching ${watched.size} file(s) for changes (Ctrl-C to stop)`);

  return new Promise<number>((resolveWatch) => {
    const stop = () => {
      for (const path of watched) {
        unwatchFile(path, onChange);
      }
      watched.clear();
      resolveWatch(lastCode);
    };
    if (ctx.signal?.aborted) {
      stop();
      return;
    }
    ctx.signal?.addEventListener('abort', stop, { once: true });
  });
}

function parseCliArgs(argv: string[]): ParsedCli | 'help' | 'version' {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' },
      engine: { type: 'string', short: 'e' },
      passes: { type: 'string', short: 'p' },
      bib: { type: 'string', short: 'b' },
      file: { type: 'string', short: 'f', multiple: true },
      timeout: { type: 'string', short: 't' },
      'service-url': { type: 'string', short: 's' },
      'api-key': { type: 'string' },
      retry: { type: 'string' },
      watch: { type: 'boolean', short: 'w' },
      json: { type: 'boolean' },
      quiet: { type: 'boolean', short: 'q' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'V' },
    },
  });

  if (values.help) return 'help';
  if (values.version) return 'version';

  const input = positionals[0];
  if (input === undefined) {
    throw new Error('missing input file (pass a .tex path, or "-" for stdin)');
  }
  if (positionals.length > 1) {
    throw new Error(`unexpected extra argument '${positionals[1]}' (attach files with --file)`);
  }

  const options: CompileOptions = {};
  if (values.engine !== undefined) {
    options.engine = parseChoice('engine', values.engine, ENGINES);
  }
  if (values.bib !== undefined) {
    options.bibliography = parseChoice('bib', values.bib, BIB_ENGINES);
  }
  if (values.passes !== undefined) {
    options.passes = parsePasses(values.passes);
  }
  if (values.timeout !== undefined) {
    options.timeout = parsePositiveInt('timeout', values.timeout);
  }
  if (values.retry !== undefined) {
    options.retry = parsePositiveInt('retry', values.retry, { allowZero: true });
  }
  if (values['service-url'] !== undefined) {
    options.serviceUrl = values['service-url'];
  }
  if (values['api-key'] !== undefined) {
    options.apiKey = values['api-key'];
  }

  return {
    input,
    output: values.output,
    filePaths: values.file ?? [],
    watch: values.watch ?? false,
    json: values.json ?? false,
    quiet: values.quiet ?? false,
    options,
  };
}

function parseChoice<T extends string>(flag: string, value: string, allowed: readonly T[]): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`invalid --${flag} '${value}' (expected ${allowed.join(' | ')})`);
}

function parsePasses(value: string): PassCount {
  if (value === 'auto') return 'auto';
  if (value === '1' || value === '2' || value === '3') return Number(value) as PassCount;
  throw new Error(`invalid --passes '${value}' (expected auto | 1 | 2 | 3)`);
}

function parsePositiveInt(flag: string, value: string, opts: { allowZero?: boolean } = {}): number {
  const parsed = Number(value);
  const min = opts.allowZero ? 0 : 1;
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`invalid --${flag} '${value}' (expected an integer >= ${min})`);
  }
  return parsed;
}

interface CollectedFiles {
  /** filename key (as LaTeX will reference it) → content */
  files: Record<string, Buffer>;
  /** Absolute paths read, for --watch. */
  paths: string[];
}

async function collectFiles(
  filePaths: string[],
  inputDir: string,
  inputPath: string | null,
  cwd: string,
): Promise<CollectedFiles> {
  // First resolve the full attachment list via a metadata walk — every --file
  // argument stat'd/walked in parallel — then read every file's bytes in
  // parallel rather than one blocking read at a time. Groups are flattened in
  // argument order so the resulting key set is deterministic.
  const targetGroups = await Promise.all(
    filePaths.map(async (filePath): Promise<Array<{ abs: string; key: string }>> => {
      const abs = resolve(cwd, filePath);
      const info = await stat(abs);
      if (info.isDirectory()) {
        const entries = await readdir(abs, { recursive: true, withFileTypes: true });
        return entries
          .filter((entry) => entry.isFile())
          .map((entry) => {
            const entryAbs = resolve(entry.parentPath, entry.name);
            return { abs: entryAbs, key: toPosix(relative(abs, entryAbs)) };
          });
      }
      const rel = relative(inputDir, abs);
      const key = rel.startsWith('..') || isAbsolute(rel) ? basename(abs) : toPosix(rel);
      return [{ abs, key }];
    }),
  );
  const targets = targetGroups.flat().filter(({ abs }) => abs !== inputPath);

  const files: Record<string, Buffer> = {};
  const paths: string[] = [];
  await Promise.all(
    targets.map(async ({ abs, key }) => {
      files[key] = await readFile(abs);
      paths.push(abs);
    }),
  );

  return { files, paths };
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function replaceExtension(path: string, ext: string): string {
  return path.replace(/\.[^./\\]+$/, '') + ext;
}

function formatLocation(file: string | null, line: number | null): string {
  if (!file) return '';
  return line === null ? ` ${file}` : ` ${file}:${line}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function readOwnVersion(): Promise<string> {
  const raw = await readFile(new URL('../package.json', import.meta.url), 'utf-8');
  return (JSON.parse(raw) as { version: string }).version;
}
