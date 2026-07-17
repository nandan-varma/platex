import type { LatexError, LatexWarning, WarningCode } from '../types.js';

/**
 * TeX wraps long lines at column 79 with no continuation marker.
 * Rejoin lines that are exactly 79 chars — the same heuristic used by latexmk.
 */
function unwrapLines(log: string): string {
  return log.replace(/(.{79})\n(?!\n)/g, '$1');
}

/**
 * Track which .tex/.sty/.cls file TeX is currently processing.
 * TeX prints "(./foo.tex" when entering and ")" when leaving a file.
 * We maintain a stack and return the topmost file at any point.
 */
function buildFileStack(log: string): Map<number, string | null> {
  const lineFiles = new Map<number, string | null>();
  const stack: string[] = [];
  const lines = log.split('\n');

  const FILE_OPEN = /\(((?:\.\.?\/)[^\s)]+\.(tex|sty|cls|def|cfg|fd|bbl))/g;

  for (let i = 0; i < lines.length; i++) {
    /* v8 ignore next -- `?? ''` fallback is unreachable: i is always in-bounds (noUncheckedIndexedAccess) */
    const line = lines[i] ?? '';

    FILE_OPEN.lastIndex = 0;
    const lineOpens: RegExpExecArray[] = [];
    let match = FILE_OPEN.exec(line);
    while (match !== null) {
      lineOpens.push(match);
      match = FILE_OPEN.exec(line);
    }

    // Push opens onto the stack
    for (const m of lineOpens) {
      stack.push(m[1] as string);
    }

    lineFiles.set(i, stack[stack.length - 1] ?? null);

    // Pop: only the last N closing parens on this line close files opened on
    // this line; earlier closing parens belong to TeX expressions, not files.
    const lineCloses = line.split(')').length - 1;
    const pops = Math.min(lineCloses, lineOpens.length);
    for (let p = 0; p < pops; p++) {
      stack.pop();
    }
  }

  return lineFiles;
}

export function parseLog(
  log: string,
  source: 'latex' | 'bibtex' | 'biber' = 'latex',
): {
  errors: LatexError[];
  warnings: LatexWarning[];
} {
  if (source === 'bibtex') return parseBibtexLog(log);
  if (source === 'biber') return parseBiberLog(log);
  return parseLatexLog(log);
}

function parseLatexLog(log: string): { errors: LatexError[]; warnings: LatexWarning[] } {
  const unwrapped = unwrapLines(log);
  const lines = unwrapped.split('\n');
  const fileStack = buildFileStack(unwrapped);

  const errors: LatexError[] = [];
  const warnings: LatexWarning[] = [];

  for (let i = 0; i < lines.length; i++) {
    /* v8 ignore next -- `?? ''` fallback is unreachable: i is always in-bounds (noUncheckedIndexedAccess) */
    const line = lines[i] ?? '';

    // --- Errors (lines starting with "!") ---
    if (line.startsWith('! ')) {
      const message = line.slice(2).trim();

      // Look ahead for "l.<N> <context>" to get line number and context
      let lineNumber: number | null = null;
      let context: string | null = null;

      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        /* v8 ignore next -- `?? ''` fallback is unreachable: j is always in-bounds (noUncheckedIndexedAccess) */
        const ahead = lines[j] ?? '';
        const lineMatch = ahead.match(/^l\.(\d+)\s*(.*)/);
        if (lineMatch) {
          lineNumber = parseInt(lineMatch[1] as string, 10);
          context = ahead.trim();
          break;
        }
      }

      errors.push({
        type: 'error',
        file: fileStack.get(i) ?? null,
        line: lineNumber,
        message,
        context,
        source: 'latex',
      });
      continue;
    }

    // --- Warnings ---
    const warning = matchWarning(line, fileStack.get(i) ?? null);
    if (warning) {
      warnings.push(warning);
    }
  }

  return { errors, warnings };
}

interface WarningPattern {
  re: RegExp;
  code: WarningCode;
  extractLine?: (match: RegExpMatchArray) => number | null;
}

const WARNING_PATTERNS: WarningPattern[] = [
  {
    re: /Overfull \\hbox \([^)]+\) in (?:paragraph|alignment) at lines? (\d+)/,
    code: 'overfull-hbox',
    extractLine: (m) => parseInt(m[1] as string, 10),
  },
  {
    re: /Underfull \\hbox \([^)]+\) in (?:paragraph|alignment) at lines? (\d+)/,
    code: 'underfull-hbox',
    extractLine: (m) => parseInt(m[1] as string, 10),
  },
  {
    re: /Overfull \\vbox \([^)]+\)/,
    code: 'overfull-vbox',
  },
  {
    re: /Underfull \\vbox \([^)]+\)/,
    code: 'underfull-vbox',
  },
  {
    re: /LaTeX Warning: Reference `[^']+' on page \d+ undefined on input line (\d+)/,
    code: 'undefined-reference',
    extractLine: (m) => parseInt(m[1] as string, 10),
  },
  {
    re: /LaTeX Warning: Citation `[^']+' on page \d+ undefined on input line (\d+)/,
    code: 'undefined-citation',
    extractLine: (m) => parseInt(m[1] as string, 10),
  },
  {
    re: /LaTeX Warning: Label `[^']+' multiply defined/,
    code: 'multiply-defined-label',
  },
  {
    re: /LaTeX Font Warning:/,
    code: 'font-warning',
  },
  {
    re: /Package \w+ Warning:/,
    code: 'package-warning',
  },
  {
    re: /LaTeX Warning:/,
    code: 'other',
  },
];

function matchWarning(line: string, file: string | null): LatexWarning | null {
  for (const pattern of WARNING_PATTERNS) {
    const match = line.match(pattern.re);
    if (match) {
      return {
        type: 'warning',
        code: pattern.code,
        file,
        line: pattern.extractLine ? pattern.extractLine(match) : null,
        message: line.trim(),
      };
    }
  }
  return null;
}

function parseBibtexLog(log: string): { errors: LatexError[]; warnings: LatexWarning[] } {
  const errors: LatexError[] = [];
  const warnings: LatexWarning[] = [];
  const lines = log.split('\n');

  for (const line of lines) {
    if (line.startsWith('I found no ') || line.match(/^---/)) {
      // section separator, skip
      continue;
    }

    if (line.startsWith('Warning--')) {
      warnings.push({
        type: 'warning',
        code: 'other',
        file: null,
        line: null,
        message: line.replace(/^Warning--/, '').trim(),
      });
      continue;
    }

    if (line.toLowerCase().includes('error')) {
      // e.g. "error message--line N of file foo.bib"
      const locationMatch = line.match(/--line (\d+) of file (.+)$/);
      errors.push({
        type: 'error',
        /* v8 ignore next -- `?? null` is unreachable: capture group 2 is always present when locationMatch is truthy */
        file: locationMatch ? (locationMatch[2] ?? null) : null,
        line: locationMatch ? parseInt(locationMatch[1] as string, 10) : null,
        message: line.trim(),
        context: null,
        source: 'bibtex',
      });
    }
  }

  return { errors, warnings };
}

function parseBiberLog(log: string): { errors: LatexError[]; warnings: LatexWarning[] } {
  const errors: LatexError[] = [];
  const warnings: LatexWarning[] = [];
  const lines = log.split('\n');

  for (const line of lines) {
    if (line.includes('ERROR')) {
      errors.push({
        type: 'error',
        file: null,
        line: null,
        message: line.trim(),
        context: null,
        source: 'biber',
      });
    } else if (line.includes('WARN')) {
      warnings.push({
        type: 'warning',
        code: 'other',
        file: null,
        line: null,
        message: line.trim(),
      });
    }
  }

  return { errors, warnings };
}

/** Check if the log signals that another LaTeX pass is needed */
export function needsRerun(log: string): boolean {
  const RERUN_PATTERNS = [
    /Rerun to get cross-references right/,
    /Rerun to get outlines right/,
    /Label\(s\) may have changed\. Rerun/,
    /Package natbib Warning:.*rerun/i,
    /Package rerunfilecheck Warning:/i,
    /Package longtable Warning:.*rerun/i,
  ];

  return RERUN_PATTERNS.some((re) => re.test(log));
}
