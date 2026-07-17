import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Engine, RawPassLog } from '../types.js';

// -no-shell-escape: TeX Live's default is *restricted* shell escape (a
// whitelist of \write18 commands); the compile service runs untrusted
// documents, so disable even that.
const LATEX_FLAGS = [
  '-interaction=nonstopmode',
  '-halt-on-error',
  '-file-line-error',
  '-no-shell-escape',
];

export interface RunEngineOptions {
  engine: Engine;
  tmpDir: string;
  passNumber: number;
  timeout: number;
  signal?: AbortSignal | undefined;
}

export async function runEngine(opts: RunEngineOptions): Promise<RawPassLog> {
  const { engine, tmpDir, passNumber, timeout, signal } = opts;

  const args = [...LATEX_FLAGS, `-output-directory=${tmpDir}`, 'main.tex'];

  const { stdout, stderr, exitCode, timedOut } = await spawnProcess(
    engine,
    args,
    tmpDir,
    timeout,
    undefined,
    signal,
  );

  // .log file is more complete than stdout for multi-file projects
  let logContent = '';
  try {
    logContent = await readFile(join(tmpDir, 'main.log'), 'utf-8');
  } catch {
    logContent = stdout;
  }

  return { passNumber, engine, stdout, stderr, log: logContent, exitCode, timedOut };
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** True if the process was killed because it exceeded `timeout`. */
  timedOut: boolean;
}

export function spawnProcess(
  command: string,
  args: string[],
  cwd: string,
  timeout: number,
  env?: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ stdout: '', stderr: 'aborted', exitCode: 1, timedOut: false });
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    const child = spawn(command, args, {
      cwd,
      // No writes to stdin ever happen; 'ignore' skips allocating the pipe and
      // gives a TeX engine that tries to prompt an immediate EOF instead of a
      // read that blocks until the timeout kills it.
      stdio: ['ignore', 'pipe', 'pipe'],
      // Don't inherit full env — strip anything sensitive, add TeX restrictions.
      // Security-critical flags go AFTER the spread so callers cannot override them.
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        ...env,
        openout_any: 'p',
        openin_any: 'a',
      },
    });

    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);

    const onAbort = () => {
      child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', onAbort);

    const cleanup = () => {
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
    };

    child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    child.on('close', (code) => {
      cleanup();
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        exitCode: code ?? 1,
        timedOut,
      });
    });

    child.on('error', (err) => {
      cleanup();
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: 127,
        timedOut: false,
      });
    });
  });
}
