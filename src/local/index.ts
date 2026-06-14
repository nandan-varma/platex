import { mkdtemp, rm, writeFile, readFile, mkdir, access, constants } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import type { CompileOptions, CompileResult } from '../types.js';
import { runPasses } from './passes.js';
import { resolveTectonicBinary, runTectonic } from './tectonic.js';
import { parseLog } from './log-parser.js';

const DEFAULT_ENGINE = 'pdflatex' as const;
const DEFAULT_PASSES = 'auto' as const;
const DEFAULT_BIB = 'bibtex' as const;
const DEFAULT_TIMEOUT = 30_000;

async function isEngineAvailable(engine: string): Promise<boolean> {
  try {
    await access(engine, constants.X_OK);
    return true;
  } catch {
    // engine is a name, not a path — check via which
    const { spawnProcess } = await import('./compiler.js');
    const { exitCode } = await spawnProcess('which', [engine], process.cwd(), 5_000);
    return exitCode === 0;
  }
}

export async function runLocalPipeline(
  source: string,
  options: CompileOptions = {},
): Promise<CompileResult> {
  const engine = options.engine ?? DEFAULT_ENGINE;
  const passes = options.passes ?? DEFAULT_PASSES;
  const bibliography = options.bibliography ?? DEFAULT_BIB;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const files = options.files ?? {};

  const tmpDir = await mkdtemp(join(tmpdir(), 'platex-'));

  try {
    // Write main.tex
    await writeFile(join(tmpDir, 'main.tex'), source, 'utf-8');

    // Write additional files, creating subdirectories as needed
    for (const [filename, content] of Object.entries(files)) {
      const safe = filename.replace(/\.\./g, '_').replace(/^\//, '');
      const dest = join(tmpDir, safe);
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

    const rawLog = await runTectonic({ binary: tectonicBinary, tmpDir, timeout });
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
