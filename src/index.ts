import { runLocalPipeline } from './local/index.js';
import { callRemote } from './remote/client.js';
import type { CompileOptions, CompileResult } from './types.js';

const MAX_SOURCE_BYTES = 5_000_000;

export async function compile(
  source: string,
  options: CompileOptions = {},
): Promise<CompileResult> {
  if (!source || typeof source !== 'string') {
    throw new TypeError('platex: source must be a non-empty string');
  }

  if (Buffer.byteLength(source, 'utf-8') > MAX_SOURCE_BYTES) {
    throw new TypeError(`platex: source exceeds ${MAX_SOURCE_BYTES} byte limit`);
  }

  if (options.serviceUrl) {
    return callRemote(source, options);
  }

  return runLocalPipeline(source, options);
}

export type {
  BibEngine,
  CompileOptions,
  CompileResult,
  Engine,
  LatexError,
  LatexWarning,
  PassCount,
  RawPassLog,
  WarningCode,
} from './types.js';
