import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  DEFAULT_BIB,
  DEFAULT_ENGINE,
  DEFAULT_PASSES,
  DEFAULT_TIMEOUT,
  resolveLimits,
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

  const fileEntries = Object.entries(files);
  if (fileEntries.length > limits.maxFilesCount) {
    throw new TypeError(`platex: too many files (max ${limits.maxFilesCount})`);
  }
  const totalFilesBytes = fileEntries.reduce((sum, [, buf]) => sum + buf.length, 0);
  if (totalFilesBytes > limits.maxTotalFilesBytes) {
    throw new TypeError(`platex: total files size exceeds ${limits.maxTotalFilesBytes} bytes`);
  }

  const tmpDir = await mkdtemp(join(tmpdir(), 'platex-'));

  try {
    // Write main.tex
    await writeFile(join(tmpDir, 'main.tex'), source, 'utf-8');

    // Write additional files, creating subdirectories as needed
    for (const [filename, content] of fileEntries) {
      validateFilename(filename);
      const dest = join(tmpDir, filename);
      const dir = dirname(dest);
      if (dir !== tmpDir) {
        await mkdir(dir, { recursive: true });
      }
      await writeFile(dest, content);
    }

    // Engine selection: prefer system TeX Live; fall back to bundled Tectonic
    const engineAvailable = await isEngineAvailable(engine);

    if (engineAvailable) {
      // Full TeX Live path — multi-pass with bibtex support
      const { errors, warnings, logs } = await runPasses(tmpDir, {
        engine,
        passes,
        bibliography,
        timeout,
        signal,
      });

      const pdf = await readPdf(join(tmpDir, 'main.pdf'));
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
    const pdf = await readPdf(join(tmpDir, 'main.pdf'));
    return { pdf, errors, warnings, logs: [rawLog] };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function readPdf(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}
