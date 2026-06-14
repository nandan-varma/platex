import { access, constants, copyFile, chmod, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawPassLog } from '../types.js';
import { spawnProcess } from './compiler.js';

/** Where the Tectonic binary lives at runtime in a Vercel/Lambda function. */
const TMP_BINARY = '/tmp/platex-tectonic';

/** Path to the bundled binary relative to this file's location in the dist bundle. */
function getBundledBinaryPath(): string {
  // When compiled to dist/index.cjs or dist/server.cjs, __dirname is dist/.
  // The binary is at bin/tectonic (project root).
  try {
    // ESM context
    const dir = dirname(fileURLToPath(import.meta.url));
    return join(dir, '..', 'bin', 'tectonic');
  } catch {
    // CJS context
    return join(process.cwd(), 'bin', 'tectonic');
  }
}

/** Resolve the tectonic binary path, setting it up in /tmp if necessary. */
export async function resolveTectonicBinary(): Promise<string | null> {
  // 1. System tectonic (dev machine or Docker image with tectonic installed)
  const systemBinary = await isExecutable('tectonic') ? 'tectonic' : null;
  if (systemBinary) return systemBinary;

  // 2. Bundled binary — copy to /tmp so we can ensure +x on Lambda/Vercel
  const bundled = getBundledBinaryPath();
  if (!existsSync(bundled)) return null;

  // Re-use already-prepared binary on warm container
  if (existsSync(TMP_BINARY)) return TMP_BINARY;

  try {
    await copyFile(bundled, TMP_BINARY);
    await chmod(TMP_BINARY, 0o755);
    return TMP_BINARY;
  } catch {
    return null;
  }
}

async function isExecutable(cmd: string): Promise<boolean> {
  try {
    await access(cmd, constants.X_OK);
    return true;
  } catch {
    // If it's just a name (not a path), try finding it via PATH
    const { exitCode } = await spawnProcess('which', [cmd], process.cwd(), 5_000);
    return exitCode === 0;
  }
}

/**
 * Run Tectonic against main.tex in tmpDir.
 * Tectonic handles multi-pass compilation and bibliography (biber) internally.
 */
export async function runTectonic(opts: {
  binary: string;
  tmpDir: string;
  timeout: number;
}): Promise<RawPassLog> {
  const { binary, tmpDir, timeout } = opts;

  const args = [
    '-X', 'compile',
    '--outdir', tmpDir,
    '--keep-logs',
    '--keep-intermediates',
    '--chatter', 'minimal',
    'main.tex',
  ];

  const env: NodeJS.ProcessEnv = {
    PATH: process.env['PATH'],
    HOME: process.env['HOME'],
    // Direct Tectonic's package cache to /tmp (only writable dir on Vercel/Lambda)
    XDG_CACHE_HOME: '/tmp/.tectonic-cache',
    openout_any: 'p',
  };

  const { stdout, stderr, exitCode } = await spawnProcess(binary, args, tmpDir, timeout);

  let logContent = '';
  try {
    logContent = await readFile(join(tmpDir, 'main.log'), 'utf-8');
  } catch {
    logContent = stdout + stderr;
  }

  return {
    passNumber: 1,
    engine: 'pdflatex', // Tectonic uses XeTeX internally but produces equivalent output
    stdout,
    stderr,
    log: logContent,
    exitCode,
  };
}
