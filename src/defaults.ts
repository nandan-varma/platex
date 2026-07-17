import type { BibEngine, CompileLimits, Engine, PassCount } from './types.js';

export const DEFAULT_ENGINE: Engine = 'pdflatex';
export const DEFAULT_PASSES: PassCount = 'auto';
export const DEFAULT_BIB: BibEngine = 'bibtex';
export const DEFAULT_TIMEOUT = 30_000;

/** Every engine name the library accepts — the single source of truth shared by the CLI, the HTTP schema, and request-body validation. */
export const ENGINES: readonly Engine[] = ['pdflatex', 'xelatex', 'lualatex', 'tectonic'];
export const BIB_ENGINES: readonly BibEngine[] = ['bibtex', 'biber', 'none'];
export const PASS_COUNTS: readonly PassCount[] = ['auto', 1, 2, 3];

/** Bounds accepted for `timeout` on any network-derived request (HTTP route and Fetch-API handler alike). */
export const MIN_TIMEOUT_MS = 1_000;
export const MAX_TIMEOUT_MS = 120_000;

/** Max size of the `source` string, in UTF-8 bytes. */
export const MAX_SOURCE_BYTES = 5_000_000;
/** Max number of entries in `files`. */
export const MAX_FILES_COUNT = 50;
/** Max combined decoded size of all `files` entries, in bytes. */
export const MAX_TOTAL_FILES_BYTES = 25_000_000;

function readEnvInt(name: string): number | undefined {
  const raw = readEnv(name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * Merge caller-supplied {@link CompileLimits} over the library defaults.
 * Each field falls back to its env-var (when set and valid) before falling
 * back to the compiled-in constant — matching the pattern used by
 * `defaultServiceUrl()` / `defaultApiKey()`.
 */
export function resolveLimits(overrides?: CompileLimits): Required<CompileLimits> {
  return {
    maxSourceBytes:
      overrides?.maxSourceBytes ?? readEnvInt('PLATEX_MAX_SOURCE_BYTES') ?? MAX_SOURCE_BYTES,
    maxFilesCount:
      overrides?.maxFilesCount ?? readEnvInt('PLATEX_MAX_FILES_COUNT') ?? MAX_FILES_COUNT,
    maxTotalFilesBytes:
      overrides?.maxTotalFilesBytes ??
      readEnvInt('PLATEX_MAX_TOTAL_FILES_BYTES') ??
      MAX_TOTAL_FILES_BYTES,
  };
}

/**
 * Read an environment variable defensively — safe to call from code that
 * also ships in edge/browser-like runtimes where `process` may not exist.
 */
function readEnv(name: string): string | undefined {
  /* v8 ignore next -- defensive guard for non-Node runtimes; `process` always exists under Node/vitest */
  if (typeof process === 'undefined' || !process.env) return undefined;
  return process.env[name];
}

/** `process.env.PLATEX_SERVICE_URL`, or undefined if unset/unavailable. */
export function defaultServiceUrl(): string | undefined {
  return readEnv('PLATEX_SERVICE_URL');
}

/** `process.env.PLATEX_API_KEY`, or undefined if unset/unavailable. */
export function defaultApiKey(): string | undefined {
  return readEnv('PLATEX_API_KEY');
}

/**
 * Detect the `Buffer` global once at module scope. The runtime probe is
 * wrapped in a function so that the minifier (esbuild via tsup) cannot
 * constant-fold the `typeof` check — a bare `typeof Buffer` inside a
 * small function gets inlined and the else branch eliminated during
 * minification, leaving bare `Buffer.from(…)` calls in the edge bundle
 * (`platex/client`).  Referencing the module-scope constant instead
 * keeps every consumer on the same opaque reference the minifier can't
 * resolve.
 */
/* v8 ignore start -- runtime-env detection: Buffer is always present under Node/vitest */
const _Buffer: typeof Buffer | undefined = (() => {
  try {
    return Buffer;
  } catch {
    return undefined;
  }
})();
/* v8 ignore stop */

/**
 * UTF-8 byte length of a string. Uses Node's `Buffer.byteLength` when available
 * — it computes the length without allocating an encoded copy, which matters
 * for multi-MB sources — and falls back to the Web-standard `TextEncoder` on
 * edge/browser runtimes where `Buffer` may be absent.
 */
export function utf8ByteLength(str: string): number {
  /* v8 ignore start -- runtime-env branch: Node/vitest always takes the Buffer fast path */
  return _Buffer !== undefined
    ? _Buffer.byteLength(str, 'utf8')
    : new TextEncoder().encode(str).length;
  /* v8 ignore stop */
}

// Minimal ambient declarations for the edge/browser fallbacks below — tsconfig
// lib is ES-only (no DOM), but these globals exist on every runtime that lacks
// Buffer (Cloudflare Workers, browsers, edge runtimes).
declare function btoa(data: string): string;
declare function atob(data: string): string;

/**
 * Base64-encode raw bytes. Uses Buffer under Node and falls back to `btoa` on
 * runtimes without a Buffer global — code shipped in `platex/client` must
 * never assume Buffer exists (the CI grep for `node:` imports can't catch a
 * bare global reference, so route all base64 through these helpers).
 */
export function bytesToBase64(bytes: Uint8Array): string {
  /* v8 ignore start -- runtime-env branch: Node/vitest always has Buffer */
  if (_Buffer !== undefined) {
    return _Buffer.isBuffer(bytes)
      ? bytes.toString('base64')
      : _Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  // Chunked so large PDFs don't blow the argument-count limit of fromCharCode.
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
  /* v8 ignore stop */
  /* v8 ignore next -- unreachable: both branches above return */
}

/**
 * Decode base64 into bytes. Returns a real Buffer under Node; on runtimes
 * without Buffer it returns a plain Uint8Array typed as Buffer — byte-level
 * reads are identical, only Buffer-specific methods differ, and callers on
 * those runtimes are edge consumers holding raw PDF bytes.
 */
export function base64ToBytes(b64: string): Buffer {
  /* v8 ignore start -- runtime-env branch: Node/vitest always has Buffer */
  if (_Buffer !== undefined) return _Buffer.from(b64, 'base64');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes as unknown as Buffer;
  /* v8 ignore stop */
  /* v8 ignore next -- unreachable: both branches above return */
}
