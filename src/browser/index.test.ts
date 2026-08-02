import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initializeMock = vi.fn().mockResolvedValue(undefined);
const terminateMock = vi.fn();
const pdflatexCompile = vi.fn();
const xelatexCompile = vi.fn();
const lualatexCompile = vi.fn();

class FakeBusyTexRunner {
  static instances: FakeBusyTexRunner[] = [];
  config: unknown;
  constructor(config: unknown) {
    this.config = config;
    FakeBusyTexRunner.instances.push(this);
  }
  initialize = initializeMock;
  terminate = terminateMock;
}

class FakePdfLatex {
  constructor(public runner: unknown) {}
  compile = pdflatexCompile;
}
class FakeXeLatex {
  constructor(public runner: unknown) {}
  compile = xelatexCompile;
}
class FakeLuaLatex {
  constructor(public runner: unknown) {}
  compile = lualatexCompile;
}

vi.mock('texlyre-busytex', () => ({
  BusyTexRunner: FakeBusyTexRunner,
  PdfLatex: FakePdfLatex,
  XeLatex: FakeXeLatex,
  LuaLatex: FakeLuaLatex,
}));

const SUCCESS_LOG = '(./main.tex\nLaTeX2e <2022-11-01>\n)\n';
const ERROR_LOG = '(./main.tex\n! Undefined control sequence.\nl.3 \\foo\n)\n';

function successResult(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    pdf: new Uint8Array([1, 2, 3]),
    log: SUCCESS_LOG,
    exitCode: 0,
    logs: [
      {
        cmd: 'pdflatex',
        texmflog: '',
        missfontlog: '',
        log: SUCCESS_LOG,
        aux: '',
        stdout: 'out',
        stderr: '',
        exit_code: 0,
      },
    ],
    ...overrides,
  };
}

// Import after the mock is registered, and reset the module's internal
// runner singleton between tests via resetModules — otherwise the "reuses
// the singleton runner" test would pass trivially (every test would share
// one runner) and the "re-initializes on a different basePath" test
// couldn't observe a clean second `new BusyTexRunner(...)` call.
let runBrowserPipeline: typeof import('./index.js').runBrowserPipeline;

beforeEach(async () => {
  vi.resetModules();
  FakeBusyTexRunner.instances.length = 0;
  initializeMock.mockClear();
  terminateMock.mockClear();
  pdflatexCompile.mockReset().mockResolvedValue(successResult());
  xelatexCompile.mockReset().mockResolvedValue(successResult());
  lualatexCompile.mockReset().mockResolvedValue(successResult());
  ({ runBrowserPipeline } = await import('./index.js'));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runBrowserPipeline', () => {
  it('rejects the tectonic engine — the WASM backend has no Tectonic', async () => {
    await expect(
      runBrowserPipeline('src', { engine: 'tectonic', wasm: { basePath: '/assets' } }),
    ).rejects.toThrow(/tectonic.*not supported by the WASM\/browser backend/s);
  });

  it('rejects biber — the WASM backend only has bibtex8', async () => {
    await expect(
      runBrowserPipeline('src', { bibliography: 'biber', wasm: { basePath: '/assets' } }),
    ).rejects.toThrow(/biber.*not supported by the WASM\/browser backend/s);
  });

  it('throws a clear error when no wasm.basePath and no PLATEX_WASM_BASE_PATH are configured', async () => {
    await expect(runBrowserPipeline('src')).rejects.toThrow(/no WASM asset base path configured/);
  });

  it('falls back to PLATEX_WASM_BASE_PATH when wasm.basePath is not passed', async () => {
    vi.stubEnv('PLATEX_WASM_BASE_PATH', '/env-assets');
    await runBrowserPipeline('src');
    expect(FakeBusyTexRunner.instances[0]?.config).toMatchObject({
      busytexBasePath: '/env-assets',
    });
  });

  it('rejects an unsafe filename before touching the engine', async () => {
    await expect(
      runBrowserPipeline('src', {
        wasm: { basePath: '/assets' },
        files: { '../escape.bib': new Uint8Array() },
      }),
    ).rejects.toThrow(/invalid filename/);
    expect(pdflatexCompile).not.toHaveBeenCalled();
  });

  it('defaults to the pdflatex tool and maps files/passes/bibliography', async () => {
    const files = { 'refs.bib': new Uint8Array([1]) };
    await runBrowserPipeline('\\documentclass{article}', {
      wasm: { basePath: '/assets' },
      files,
      passes: 2,
      bibliography: 'bibtex',
    });

    expect(pdflatexCompile).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '\\documentclass{article}',
        bibtex: true,
        rerun: true,
        additionalFiles: [{ path: 'refs.bib', content: files['refs.bib'] }],
      }),
    );
  });

  it('does not rerun for a single explicit pass', async () => {
    await runBrowserPipeline('src', { wasm: { basePath: '/assets' }, passes: 1 });
    expect(pdflatexCompile).toHaveBeenCalledWith(expect.objectContaining({ rerun: false }));
  });

  it('routes xelatex to the XeLatex tool', async () => {
    await runBrowserPipeline('src', { wasm: { basePath: '/assets' }, engine: 'xelatex' });
    expect(xelatexCompile).toHaveBeenCalled();
    expect(pdflatexCompile).not.toHaveBeenCalled();
  });

  it('routes lualatex to the LuaLatex tool', async () => {
    await runBrowserPipeline('src', { wasm: { basePath: '/assets' }, engine: 'lualatex' });
    expect(lualatexCompile).toHaveBeenCalled();
    expect(pdflatexCompile).not.toHaveBeenCalled();
  });

  it('parses the returned log into structured errors/warnings and maps per-pass logs', async () => {
    pdflatexCompile.mockResolvedValue(
      successResult({ log: ERROR_LOG, logs: successResult().logs }),
    );

    const result = await runBrowserPipeline('src', { wasm: { basePath: '/assets' } });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toMatch(/Undefined control sequence/);
    expect(result.logs).toEqual([
      expect.objectContaining({ passNumber: 1, engine: 'pdflatex', exitCode: 0, timedOut: false }),
    ]);
  });

  it('returns pdf: null when the compile is not successful, even if pdf bytes are present', async () => {
    pdflatexCompile.mockResolvedValue(successResult({ success: false }));
    const result = await runBrowserPipeline('src', { wasm: { basePath: '/assets' } });
    expect(result.pdf).toBeNull();
  });

  it('returns pdf: null when no pdf bytes were produced', async () => {
    pdflatexCompile.mockResolvedValue(successResult({ pdf: undefined }));
    const result = await runBrowserPipeline('src', { wasm: { basePath: '/assets' } });
    expect(result.pdf).toBeNull();
  });

  it('returns the raw pdf bytes on success', async () => {
    // Runtime value is a plain Uint8Array typed as Buffer — same convention
    // as base64ToBytes in defaults.ts; byte-level reads are what matters.
    const result = await runBrowserPipeline('src', { wasm: { basePath: '/assets' } });
    expect(Array.from(result.pdf ?? [])).toEqual([1, 2, 3]);
  });

  it('rejects immediately without compiling when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runBrowserPipeline('src', { wasm: { basePath: '/assets' }, signal: controller.signal }),
    ).rejects.toThrow(/compile aborted/);
    expect(pdflatexCompile).not.toHaveBeenCalled();
  });

  it('terminates the runner when the signal aborts mid-compile', async () => {
    const controller = new AbortController();
    pdflatexCompile.mockImplementation(async () => {
      controller.abort();
      return successResult();
    });

    await runBrowserPipeline('src', { wasm: { basePath: '/assets' }, signal: controller.signal });

    expect(terminateMock).toHaveBeenCalled();
  });

  it('reuses the singleton runner across calls with the same basePath', async () => {
    await runBrowserPipeline('src', { wasm: { basePath: '/assets' } });
    await runBrowserPipeline('src', { wasm: { basePath: '/assets' } });
    expect(FakeBusyTexRunner.instances).toHaveLength(1);
    expect(initializeMock).toHaveBeenCalledTimes(1);
  });

  it('creates a new runner when basePath changes across calls', async () => {
    await runBrowserPipeline('src', { wasm: { basePath: '/assets-a' } });
    await runBrowserPipeline('src', { wasm: { basePath: '/assets-b' } });
    expect(FakeBusyTexRunner.instances).toHaveLength(2);
  });

  it('passes dataPackages through to preload/catalog config, omitting them when unset', async () => {
    await runBrowserPipeline('src', {
      wasm: { basePath: '/assets', dataPackages: ['/assets/texlive-extra.js'] },
    });
    expect(FakeBusyTexRunner.instances[0]?.config).toMatchObject({
      preloadDataPackages: ['/assets/texlive-extra.js'],
      catalogDataPackages: ['/assets/texlive-extra.js'],
    });

    await runBrowserPipeline('src', { wasm: { basePath: '/assets-no-packages' } });
    expect(FakeBusyTexRunner.instances[1]?.config).not.toHaveProperty('preloadDataPackages');
  });
});
