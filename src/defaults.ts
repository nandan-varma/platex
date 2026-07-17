import type { BibEngine, Engine, PassCount } from './types.js';

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
