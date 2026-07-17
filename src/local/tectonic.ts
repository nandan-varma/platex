import { existsSync } from 'node:fs';
import { chmod, copyFile, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawPassLog } from '../types.js';
import { spawnProcess } from './compiler.js';
import { isCommandAvailable } from './utils.js';

/** Where the Tectonic binary lives at runtime in a Vercel/Lambda function. */
const TMP_BINARY = '/tmp/platex-tectonic';

/**
 * Path candidates to the bundled binary, relative to this file's location.
 * - Compiled to dist/index.cjs or dist/server.cjs: __dirname is dist/, binary is at ../bin/tectonic.
 * - Running unbundled (dev/test, e.g. via tsx): __dirname is src/local/, binary is at ../../bin/tectonic.
 */
function getBundledBinaryCandidates(): string[] {
  const candidates: string[] = [];
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    candidates.push(join(dir, '..', 'bin', 'tectonic'), join(dir, '..', '..', 'bin', 'tectonic'));
  } catch {
    // import.meta unavailable in this context — fall through to cwd-based candidate below
  }
  candidates.push(join(process.cwd(), 'bin', 'tectonic'));
  return candidates;
}

/** Resolve the tectonic binary path, setting it up in /tmp if necessary. */
export async function resolveTectonicBinary(): Promise<string | null> {
  // 1. System tectonic (dev machine or Docker image with tectonic installed)
  const systemBinary = (await isCommandAvailable('tectonic')) ? 'tectonic' : null;
  if (systemBinary) return systemBinary;

  // 2. Bundled binary — copy to /tmp so we can ensure +x on Lambda/Vercel
  const bundled = getBundledBinaryCandidates().find((candidate) => existsSync(candidate));
  if (!bundled) return null;

  // Re-use already-prepared binary on warm container
  if (existsSync(TMP_BINARY)) return TMP_BINARY;

  // Fluid Compute reuses a warm instance across concurrent requests, so two
  // invocations can race here. Stage the copy at a per-process-unique path and
  // `rename` it into place — rename is atomic on the same filesystem, so
  // concurrent callers never observe (or execute) a partially-written binary.
  const stagingPath = `${TMP_BINARY}.${process.pid}.${Date.now()}.tmp`;
  try {
    await copyFile(bundled, stagingPath);
    await chmod(stagingPath, 0o755);
    await rename(stagingPath, TMP_BINARY);
    return TMP_BINARY;
  } catch {
    await rm(stagingPath, { force: true });
    // Another concurrent call may have finished the rename first.
    return existsSync(TMP_BINARY) ? TMP_BINARY : null;
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
  signal?: AbortSignal | undefined;
}): Promise<RawPassLog> {
  const { binary, tmpDir, timeout, signal } = opts;

  const args = [
    '-X',
    'compile',
    '--outdir',
    tmpDir,
    '--keep-logs',
    '--keep-intermediates',
    'main.tex',
  ];

  const { stdout, stderr, exitCode, timedOut } = await spawnProcess(
    binary,
    args,
    tmpDir,
    timeout,
    {
      // Direct Tectonic's package cache to /tmp (only writable dir on Vercel/Lambda)
      XDG_CACHE_HOME: '/tmp/.tectonic-cache',
    },
    signal,
  );

  let logContent = '';
  try {
    logContent = await readFile(join(tmpDir, 'main.log'), 'utf-8');
  } catch {
    logContent = stdout + stderr;
  }

  return {
    passNumber: 1,
    engine: 'tectonic',
    stdout,
    stderr,
    log: logContent,
    exitCode,
    timedOut,
  };
}
