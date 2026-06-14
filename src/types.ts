export type Engine = 'pdflatex' | 'xelatex' | 'lualatex';
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
}

export interface CompileOptions {
  engine?: Engine;
  passes?: PassCount;
  bibliography?: BibEngine;
  /** Additional files keyed by filename (e.g. 'refs.bib', 'figure.png') */
  files?: Record<string, Buffer>;
  /** If set, compile via the remote platex HTTP service instead of local TeX */
  serviceUrl?: string;
  timeout?: number;
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
