import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BibEngine, RawPassLog } from '../types.js';
import { spawnProcess } from './compiler.js';

export async function runBibliography(opts: {
  bibEngine: BibEngine;
  tmpDir: string;
  passNumber: number;
  timeout: number;
  signal?: AbortSignal | undefined;
}): Promise<RawPassLog | null> {
  const { bibEngine, tmpDir, passNumber, timeout, signal } = opts;

  if (bibEngine === 'none') return null;

  const engine = bibEngine; // 'bibtex' | 'biber'

  // bibtex takes the .aux basename (no extension, no path for bibtex; full path for biber)
  const args =
    bibEngine === 'bibtex'
      ? ['main']
      : ['--input-directory', tmpDir, '--output-directory', tmpDir, 'main'];

  const { stdout, stderr, exitCode, timedOut } = await spawnProcess(
    engine,
    args,
    tmpDir,
    timeout,
    undefined,
    signal,
  );

  // Read the .blg log file
  let logContent = '';
  try {
    logContent = await readFile(join(tmpDir, 'main.blg'), 'utf-8');
  } catch {
    logContent = stdout;
  }

  return { passNumber, engine, stdout, stderr, log: logContent, exitCode, timedOut };
}

/** Returns true if main.aux signals that bibliography compilation is needed */
export async function detectBibliography(tmpDir: string): Promise<boolean> {
  try {
    const aux = await readFile(join(tmpDir, 'main.aux'), 'utf-8');
    return /\\citation\{/.test(aux) && /\\bibdata\{/.test(aux);
  } catch {
    return false;
  }
}
