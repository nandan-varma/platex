import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Engine, RawPassLog } from '../types.js';

const LATEX_FLAGS = ['-interaction=nonstopmode', '-halt-on-error', '-file-line-error'];

export interface RunEngineOptions {
  engine: Engine;
  tmpDir: string;
  passNumber: number;
  timeout: number;
}

export async function runEngine(opts: RunEngineOptions): Promise<RawPassLog> {
  const { engine, tmpDir, passNumber, timeout } = opts;

  const args = [...LATEX_FLAGS, `-output-directory=${tmpDir}`, 'main.tex'];

  const { stdout, stderr, exitCode } = await spawnProcess(engine, args, tmpDir, timeout);

  // .log file is more complete than stdout for multi-file projects
  let logContent = '';
  try {
    logContent = await readFile(join(tmpDir, 'main.log'), 'utf-8');
  } catch {
    logContent = stdout;
  }

  return { passNumber, engine, stdout, stderr, log: logContent, exitCode };
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function spawnProcess(
  command: string,
  args: string[],
  cwd: string,
  timeout: number,
  env?: NodeJS.ProcessEnv,
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const child = spawn(command, args, {
      cwd,
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
      child.kill('SIGKILL');
    }, timeout);

    child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    child.on('close', (code) => {
      clearTimeout(killTimer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        exitCode: code ?? 1,
      });
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: 127,
      });
    });
  });
}
