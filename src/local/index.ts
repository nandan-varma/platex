import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  DEFAULT_BIB,
  DEFAULT_ENGINE,
  DEFAULT_PASSES,
  DEFAULT_TIMEOUT,
  resolveLimits,
  utf8ByteLength,
} from '../defaults.js';
import type { CompileOptions, CompileResult } from '../types.js';
import { parseLog } from './log-parser.js';
import { runPasses } from './passes.js';
import { resolveTectonicBinary, runTectonic } from './tectonic.js';
import { isEngineAvailable, validateFilename } from './utils.js';

export async function runLocalPipeline(
  source: string,
  options: CompileOptions = {},
): Promise<CompileResult> {
  const engine = options.engine ?? DEFAULT_ENGINE;
  const passes = options.passes ?? DEFAULT_PASSES;
  const bibliography = options.bibliography ?? DEFAULT_BIB;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const signal = options.signal;
  const files = options.files ?? {};
  const limits = resolveLimits(options.limits);

  // Enforced here, not just in compile() — the HTTP route calls this directly,
  // and its Zod `.max()` counts UTF-16 code units, so without this check a
  // multibyte source could exceed the byte limit the server operator set.
  if (utf8ByteLength(source) > limits.maxSourceBytes) {
    throw new TypeError(`platex: source exceeds ${limits.maxSourceBytes} byte limit`);
  }

  const fileEntries = Object.entries(files);
  if (fileEntries.length > limits.maxFilesCount) {
    throw new TypeError(`platex: too many files (max ${limits.maxFilesCount})`);
  }
  const totalFilesBytes = fileEntries.reduce((sum, [, buf]) => sum + buf.length, 0);
  if (totalFilesBytes > limits.maxTotalFilesBytes) {
    throw new TypeError(`platex: total files size exceeds ${limits.maxTotalFilesBytes} bytes`);
  }

  // Validate every filename up front (cheap, fail-fast) so a path-traversal
  // attempt is rejected before we even create a temp dir or touch disk.
  for (const [filename] of fileEntries) {
    validateFilename(filename);
  }

  const tmpDir = await mkdtemp(join(tmpdir(), 'platex-'));

  try {
    // Deduplicate the subdirectories the attachments need, so we issue one
    // mkdir per unique dir rather than one per file.
    const subDirs = new Set<string>();
    for (const [filename] of fileEntries) {
      const dir = dirname(join(tmpDir, filename));
      if (dir !== tmpDir) subDirs.add(dir);
    }

    // Overlap the engine-availability probe (a `which`/`where` subprocess) with
    // staging the working directory — they're independent — and write main.tex
    // plus every attachment in parallel instead of one blocking await each.
    // `tectonic` never goes through the TeX Live multi-pass path (it rejects
    // the pdflatex-style flags runEngine passes), so skip the probe and let
    // resolveTectonicBinary below find it — system-installed or bundled.
    const [engineAvailable] = await Promise.all([
      engine === 'tectonic' ? false : isEngineAvailable(engine),
      (async () => {
        await Promise.all([...subDirs].map((dir) => mkdir(dir, { recursive: true })));
        await Promise.all([
          writeFile(join(tmpDir, 'main.tex'), source, 'utf-8'),
          ...fileEntries.map(([filename, content]) => writeFile(join(tmpDir, filename), content)),
        ]);
      })(),
    ]);

    if (engineAvailable) {
      // Full TeX Live path — multi-pass with bibtex support
      const { errors, warnings, logs } = await runPasses(tmpDir, {
        engine,
        passes,
        bibliography,
        timeout,
        signal,
      });

      // A non-zero exit from any LaTeX pass is fatal: whatever main.pdf exists
      // is stale or truncated, and returning it would contradict the "pdf is
      // null on fatal failure" contract. (bibtex exits 1 on mere warnings, so
      // bibliography passes don't count.)
      const fatal = logs.some(
        (log) => log.engine !== 'bibtex' && log.engine !== 'biber' && log.exitCode !== 0,
      );
      const pdf = fatal ? null : await readPdf(join(tmpDir, 'main.pdf'));
      return { pdf, errors, warnings, logs };
    }

    // Tectonic path — handles passes + bibliography internally
    const tectonicBinary = await resolveTectonicBinary();
    if (!tectonicBinary) {
      throw new Error(
        `Engine '${engine}' is not installed and the bundled Tectonic binary was not found. ` +
          `Install TeX Live or run 'node scripts/download-tectonic.mjs' to set up Tectonic.`,
      );
    }

    const rawLog = await runTectonic({ binary: tectonicBinary, tmpDir, timeout, signal });
    const { errors, warnings } = parseLog(rawLog.log, 'latex');
    const pdf = rawLog.exitCode !== 0 ? null : await readPdf(join(tmpDir, 'main.pdf'));
    return { pdf, errors, warnings, logs: [rawLog] };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function readPdf(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
    /* v8 ignore next 3 -- defensive: engine reports success but PDF missing; would require a custom fake engine that exits 0 without writing main.pdf */
  } catch {
    return null;
  }
}
