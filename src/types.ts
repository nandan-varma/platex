export type Engine = 'pdflatex' | 'xelatex' | 'lualatex' | 'tectonic';
export type BibEngine = 'bibtex' | 'biber' | 'none';
export type PassCount = 'auto' | 1 | 2 | 3;

export type WarningCode =
  | 'overfull-hbox'
  | 'underfull-hbox'
  | 'overfull-vbox'
  | 'underfull-vbox'
  | 'undefined-reference'
  | 'undefined-citation'
  | 'multiply-defined-label'
  | 'font-warning'
  | 'package-warning'
  | 'other';

export interface LatexError {
  type: 'error';
  file: string | null;
  line: number | null;
  message: string;
  context: string | null;
  source: 'latex' | 'bibtex' | 'biber';
}

export interface LatexWarning {
  type: 'warning';
  code: WarningCode;
  file: string | null;
  line: number | null;
  message: string;
}

export interface RawPassLog {
  passNumber: number;
  engine: Engine | 'bibtex' | 'biber';
  stdout: string;
  stderr: string;
  log: string;
  exitCode: number;
  /** True if this pass was killed because it exceeded its time budget. */
  timedOut: boolean;
}

/**
 * Input-size ceilings. All optional — unset fields fall back to the library
 * defaults (`src/defaults.ts`). Only meaningful for *local* compilation
 * (direct calls and the remote HTTP service's own deployment); a remote
 * client cannot raise the server's limits by passing these, since the server
 * enforces its own configuration (see `createApp`/`createCompileRoute`).
 */
export interface CompileLimits {
  /** Max size of `source`, in UTF-8 bytes. */
  maxSourceBytes?: number;
  /** Max number of entries in `files`. */
  maxFilesCount?: number;
  /** Max combined decoded size of all `files` entries, in bytes. */
  maxTotalFilesBytes?: number;
}

export interface CompileOptions {
  engine?: Engine;
  passes?: PassCount;
  bibliography?: BibEngine;
  /** Additional files keyed by filename (e.g. 'refs.bib', 'figure.png') */
  files?: Record<string, Buffer>;
  /**
   * If set, compile via the remote platex HTTP service instead of local TeX.
   * Falls back to `process.env.PLATEX_SERVICE_URL` when omitted.
   */
  serviceUrl?: string;
  /**
   * Bearer token sent as `Authorization: Bearer <apiKey>` to the remote
   * service (pairs with the service's `PLATEX_API_KEY`). Falls back to
   * `process.env.PLATEX_API_KEY` when omitted. Ignored for local compiles.
   */
  apiKey?: string;
  /** Extra headers merged into the remote HTTP request. Ignored for local compiles. */
  headers?: Record<string, string>;
  /**
   * Overall wall-clock budget in milliseconds for the entire compile
   * pipeline (all LaTeX passes plus bibliography combined for local
   * compiles; the whole HTTP round-trip for remote).
   */
  timeout?: number;
  /** Override the default input-size ceilings for this call. */
  limits?: CompileLimits;
  /**
   * Number of extra attempts for the *remote* path when a request fails for
   * a retryable reason (network error, our own timeout, or a 5xx from the
   * service). Non-retryable failures (4xx, or the caller's own `signal`
   * firing) are never retried. Default `0` (no retries). Ignored locally.
   */
  retry?: number;
  /** Custom `fetch` implementation for the remote path (defaults to global `fetch`). */
  fetch?: typeof fetch;
  /** Abort the compile early (aborts in-flight processes / the remote request). */
  signal?: AbortSignal | undefined;
}

/**
 * Defaults captured once and reused across every `compile()` call made
 * through a {@link PlatexClient} — everything `CompileOptions` accepts
 * except the per-call-only `files` and `signal` fields.
 */
export type PlatexClientConfig = Omit<CompileOptions, 'files' | 'signal'>;

export interface PlatexClient {
  compile(source: string, options?: CompileOptions): Promise<CompileResult>;
  /**
   * Check whether the configured remote service is reachable. Resolves
   * `true` immediately (nothing to check) when the client has no
   * `serviceUrl` configured, i.e. it only ever compiles locally.
   */
  health(): Promise<boolean>;
}

export interface CompileResult {
  /** PDF binary, or null on fatal compile failure */
  pdf: Buffer | null;
  errors: LatexError[];
  warnings: LatexWarning[];
  /** Per-pass raw logs for debugging */
  logs: RawPassLog[];
}

/** Wire format: Next.js client → platex HTTP service */
export interface CompileRequest {
  source: string;
  engine: Engine;
  passes: PassCount;
  bibliography: BibEngine;
  /** filename → base64-encoded content */
  files: Record<string, string>;
  timeout: number;
}

/** Wire format: platex HTTP service → Next.js client */
export interface CompileResponse {
  /** base64-encoded PDF, or null */
  pdf: string | null;
  errors: LatexError[];
  warnings: LatexWarning[];
  logs: RawPassLog[];
}
