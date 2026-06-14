import type { CompileOptions, CompileResult } from './types.js';
import { callRemote } from './remote/client.js';
import { runLocalPipeline } from './local/index.js';

export async function compile(
  source: string,
  options: CompileOptions = {},
): Promise<CompileResult> {
  if (!source || typeof source !== 'string') {
    throw new TypeError('platex: source must be a non-empty string');
  }

  if (options.serviceUrl) {
    return callRemote(source, options);
  }

  return runLocalPipeline(source, options);
}

export type {
  CompileOptions,
  CompileResult,
  LatexError,
  LatexWarning,
  WarningCode,
  Engine,
  BibEngine,
  PassCount,
  RawPassLog,
} from './types.js';
