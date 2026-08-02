import { DEFAULT_BIB, DEFAULT_ENGINE, DEFAULT_PASSES, defaultWasmBasePath } from '../defaults.js';
import { parseLog } from '../local/log-parser.js';
import type { CompileOptions, CompileResult, Engine, RawPassLog } from '../types.js';

// tsconfig's `lib` is ES-only (no DOM) so `Worker` isn't otherwise known to
// the type checker — same pattern as defaults.ts's `declare function
// btoa/atob`. Only its presence is checked at runtime (`typeof`), never its shape.
declare const Worker: unknown;

// texlyre-busytex is dynamically imported — never a static import. It's
// marked `external` in tsup.config.ts so bundlers (ours and the consumer's)
// treat this as a genuine runtime import() and code-split it: a caller who
// only ever configures `serviceUrl` never ships the ~13MB WASM-engine glue.
type BusyTexModule = typeof import('texlyre-busytex');
type BusyTexRunnerInstance = InstanceType<BusyTexModule['BusyTexRunner']>;

// A lighter, self-contained filename check than src/local/utils.ts's
// validateFilename — that file imports node:fs/promises, which would pull a
// Node built-in into this edge-bundled module if reused here.
const SAFE_FILENAME = /^[a-zA-Z0-9._-][a-zA-Z0-9._/ -]*$/;
function isSafeFilename(name: string): boolean {
  return SAFE_FILENAME.test(name) && !name.includes('..') && !name.startsWith('/');
}

const TOOL_BY_ENGINE = {
  pdflatex: 'PdfLatex',
  xelatex: 'XeLatex',
  lualatex: 'LuaLatex',
} as const satisfies Record<Exclude<Engine, 'tectonic'>, keyof BusyTexModule>;

let _modulePromise: Promise<BusyTexModule> | undefined;
function loadBusyTex(): Promise<BusyTexModule> {
  _modulePromise ??= import('texlyre-busytex');
  return _modulePromise;
}

// Module-level singleton engine — survives across calls within the same JS
// realm (browser tab / worker), matching how a WASM engine's warm-up cost
// (downloading + instantiating ~13MB) is meant to be paid once, not per call.
let _runner: BusyTexRunnerInstance | undefined;
let _runnerBasePath: string | undefined;

async function getRunner(
  busytex: BusyTexModule,
  basePath: string,
  dataPackages: string[] | undefined,
): Promise<BusyTexRunnerInstance> {
  if (_runner && _runnerBasePath === basePath) return _runner;
  // Built via property assignment behind an `if (x !== undefined)` guard,
  // not a conditional-spread — exactOptionalPropertyTypes rejects assigning
  // `string[] | undefined` into an optional-but-required-when-present field
  // (see CLAUDE.md's "Conventions" section for why).
  const config: import('texlyre-busytex').BusyTexConfig = {
    busytexBasePath: basePath,
    verbose: false,
  };
  if (dataPackages !== undefined) {
    config.preloadDataPackages = dataPackages;
    config.catalogDataPackages = dataPackages;
  }
  const runner = new busytex.BusyTexRunner(config);
  await runner.initialize(typeof Worker !== 'undefined');
  _runner = runner;
  _runnerBasePath = basePath;
  return runner;
}

/**
 * Compile LaTeX `source` to a PDF entirely client-side via a bundled WASM TeX
 * Live build (`texlyre-busytex`) — no server round-trip. Used by
 * `platex/client` when no `serviceUrl` resolves and the runtime is
 * WASM-capable (see `client-entry.ts`).
 */
export async function runBrowserPipeline(
  source: string,
  options: CompileOptions = {},
): Promise<CompileResult> {
  const engine = options.engine ?? DEFAULT_ENGINE;
  if (engine === 'tectonic') {
    throw new TypeError(
      "platex: engine 'tectonic' is not supported by the WASM/browser backend — use " +
        "'pdflatex', 'xelatex', or 'lualatex' instead (or configure a serviceUrl / Node local " +
        'compile, where Tectonic is available).',
    );
  }

  const bibliography = options.bibliography ?? DEFAULT_BIB;
  if (bibliography === 'biber') {
    throw new TypeError(
      "platex: bibliography 'biber' is not supported by the WASM/browser backend (only " +
        "bibtex8, exposed here as 'bibtex') — use 'bibtex' or 'none' instead.",
    );
  }

  const basePath = options.wasm?.basePath ?? defaultWasmBasePath();
  if (!basePath) {
    throw new TypeError(
      'platex: no WASM asset base path configured. "platex/client" fell back to the WASM ' +
        'backend because no serviceUrl was configured, but it needs to know where ' +
        'busytex.wasm/busytex.js/texlive-extra.* are hosted — pass { wasm: { basePath } } or ' +
        'set PLATEX_WASM_BASE_PATH.',
    );
  }

  const passes = options.passes ?? DEFAULT_PASSES;
  const files = options.files ?? {};
  for (const filename of Object.keys(files)) {
    if (!isSafeFilename(filename)) {
      throw new TypeError(`platex: invalid filename "${filename}"`);
    }
  }

  const busytex = await loadBusyTex();
  const runner = await getRunner(busytex, basePath, options.wasm?.dataPackages);
  const ToolClass = busytex[TOOL_BY_ENGINE[engine]];
  const tool = new ToolClass(runner);

  const additionalFiles = Object.entries(files).map(([path, content]) => ({ path, content }));

  const abortHandler = () => runner.terminate();
  options.signal?.addEventListener('abort', abortHandler);

  try {
    if (options.signal?.aborted) {
      throw new DOMException('platex: compile aborted', 'AbortError');
    }

    const result = await tool.compile({
      input: source,
      bibtex: bibliography === 'bibtex',
      rerun: passes === 'auto' || (typeof passes === 'number' && passes > 1),
      verbose: 'silent',
      additionalFiles,
    });

    const { errors, warnings } = parseLog(result.log, 'latex');
    const logs: RawPassLog[] = result.logs.map((entry, i) => ({
      passNumber: i + 1,
      engine,
      stdout: entry.stdout,
      stderr: entry.stderr,
      log: entry.log,
      exitCode: entry.exit_code,
      timedOut: false,
    }));

    return {
      pdf: result.success && result.pdf ? (result.pdf as unknown as Buffer) : null,
      errors,
      warnings,
      logs,
    };
  } finally {
    options.signal?.removeEventListener('abort', abortHandler);
  }
}
