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

/**
 * Check whether `cmd` is directly executable (a path) or resolvable on PATH
 * (a bare name). Shared by engine detection (utils) and Tectonic detection
 * (tectonic.ts) so the lookup logic — including the Windows `where` vs POSIX
 * `which` split — lives in exactly one place.
 */
export async function isCommandAvailable(cmd: string): Promise<boolean> {
  try {
    await access(cmd, constants.X_OK);
    return true;
  } catch {
    // cmd is a name, not a path — resolve it via the platform's PATH lookup tool.
    const { spawnProcess } = await import('./compiler.js');
    /* v8 ignore next -- 'where' arm is Windows-only; CI runs on POSIX */
    const lookupTool = process.platform === 'win32' ? 'where' : 'which';
    const { exitCode } = await spawnProcess(lookupTool, [cmd], process.cwd(), 5_000);
    return exitCode === 0;
  }
}

export const isEngineAvailable = isCommandAvailable;
