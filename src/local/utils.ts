import { access, constants } from 'node:fs/promises';

const SAFE_FILENAME = /^[a-zA-Z0-9._-][a-zA-Z0-9._/-]*$/;

export function validateFilename(filename: string): void {
  if (!SAFE_FILENAME.test(filename) || filename.includes('..') || filename.startsWith('/')) {
    throw new TypeError(`platex: invalid filename "${filename}"`);
  }
}

export function isFilenameValid(filename: string): boolean {
  return SAFE_FILENAME.test(filename) && !filename.includes('..') && !filename.startsWith('/');
}

export async function isEngineAvailable(engine: string): Promise<boolean> {
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
