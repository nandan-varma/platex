import { afterEach, describe, expect, it, vi } from 'vitest';

// The bin entry runs its logic at import time (top-level await), wiring a
// SIGINT->AbortController bridge around runCli. We mock runCli so importing the
// module doesn't spawn a real compile, and use the mock's invocation to prove
// the abort wiring works: emitting SIGINT while runCli is "running" must abort
// the signal it was handed.
const runCliMock = vi.fn();
vi.mock('./cli.js', () => ({ runCli: runCliMock }));

describe('cli-main (bin entry)', () => {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    process.removeAllListeners('SIGINT');
    vi.resetModules();
    runCliMock.mockReset();
  });

  it('forwards argv, wires SIGINT to abort, and sets process.exitCode', async () => {
    process.argv = ['node', 'platex', 'main.tex', '--json'];

    let seenArgv: string[] | undefined;
    runCliMock.mockImplementation(async (argv: string[], opts: { signal: AbortSignal }) => {
      seenArgv = argv;
      expect(opts.signal.aborted).toBe(false);
      // Simulate Ctrl-C mid-compile.
      process.emit('SIGINT');
      expect(opts.signal.aborted).toBe(true);
      return 3;
    });

    await import('./cli-main.js');

    expect(seenArgv).toEqual(['main.tex', '--json']);
    expect(runCliMock).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(3);
  });
});
