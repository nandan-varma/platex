import type { BibEngine, Engine, PassCount } from './types.js';

export const DEFAULT_ENGINE: Engine = 'pdflatex';
export const DEFAULT_PASSES: PassCount = 'auto';
export const DEFAULT_BIB: BibEngine = 'bibtex';
export const DEFAULT_TIMEOUT = 30_000;
