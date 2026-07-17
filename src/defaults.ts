import type { BibEngine, CompileLimits, Engine, PassCount } from './types.js';

export const DEFAULT_ENGINE: Engine = 'pdflatex';
export const DEFAULT_PASSES: PassCount = 'auto';
export const DEFAULT_BIB: BibEngine = 'bibtex';
export const DEFAULT_TIMEOUT = 30_000;

/** Max size of the `source` string, in UTF-8 bytes. */
export const MAX_SOURCE_BYTES = 5_000_000;
/** Max number of entries in `files`. */
export const MAX_FILES_COUNT = 50;
/** Max combined decoded size of all `files` entries, in bytes. */
export const MAX_TOTAL_FILES_BYTES = 25_000_000;

/** Merge caller-supplied {@link CompileLimits} over the library defaults. */
export function resolveLimits(overrides?: CompileLimits): Required<CompileLimits> {
  return {
    maxSourceBytes: overrides?.maxSourceBytes ?? MAX_SOURCE_BYTES,
    maxFilesCount: overrides?.maxFilesCount ?? MAX_FILES_COUNT,
    maxTotalFilesBytes: overrides?.maxTotalFilesBytes ?? MAX_TOTAL_FILES_BYTES,
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
 * UTF-8 byte length of a string. Uses Node's `Buffer.byteLength` when available
 * — it computes the length without allocating an encoded copy, which matters
 * for multi-MB sources — and falls back to the Web-standard `TextEncoder` on
 * edge/browser runtimes where `Buffer` may be absent.
 */
export function utf8ByteLength(str: string): number {
  // Buffer.byteLength avoids allocating an encoded copy (matters for MB-scale
  // sources); TextEncoder is the edge/browser fallback where Buffer is absent.
  /* v8 ignore start -- runtime-env branch: Node/vitest always takes the Buffer fast path */
  return typeof Buffer !== 'undefined'
    ? Buffer.byteLength(str, 'utf8')
    : new TextEncoder().encode(str).length;
  /* v8 ignore stop */
}
