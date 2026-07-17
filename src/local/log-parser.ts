import type { LatexError, LatexWarning, WarningCode } from '../types.js';

/**
 * TeX wraps long lines at column 79 (`max_print_line`) with no continuation
 * marker. Split the log into lines, rejoining segments of 79+ chars with the
 * following non-blank segment — the same heuristic used by latexmk. Done as a
 * single pass over the split segments rather than a `.{79}\n` regex over the
 * whole log: the fixed-width regex re-attempts a 79-char match at every
 * position, which is ~100× slower on multi-MB logs.
 */
function splitUnwrappedLines(log: string): string[] {
  const raw = log.split('\n');
  const lines: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i] as string;
    while ((raw[i] as string).length >= 79 && i + 1 < raw.length && raw[i + 1] !== '') {
      i++;
      line += raw[i] as string;
    }
    lines.push(line);
  }
  return lines;
}

/** Count occurrences of a single character without allocating (unlike `split`). */
function countChar(str: string, ch: string): number {
  let n = 0;
  for (let i = str.indexOf(ch); i !== -1; i = str.indexOf(ch, i + 1)) n++;
  return n;
}

/**
 * TeX prints "(./foo.tex" when entering and ")" when leaving a file. We track
 * the enter/leave stack for the *current* line only — the file a given line
 * belongs to — rather than materializing a Map for every line. `FILE_OPEN` is
 * module-scoped and reset per call so it isn't reallocated on every line.
 */
const FILE_OPEN = /\(((?:\.\.?\/)[^\s)]+\.(tex|sty|cls|def|cfg|fd|bbl))/g;

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
  const lines = splitUnwrappedLines(log);

  const errors: LatexError[] = [];
  const warnings: LatexWarning[] = [];

  // Single pass: track the file stack inline (no per-line Map) while detecting
  // errors/warnings, so we scan the log — often thousands of lines — exactly
  // once instead of twice.
  const stack: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    /* v8 ignore next -- `?? ''` fallback is unreachable: i is always in-bounds (noUncheckedIndexedAccess) */
    const line = lines[i] ?? '';

    // Push files opened on this line. The regex only ever matches after a '(',
    // so skip it entirely on the many lines that contain none.
    let opens = 0;
    if (line.includes('(')) {
      FILE_OPEN.lastIndex = 0;
      let open = FILE_OPEN.exec(line);
      while (open !== null) {
        stack.push(open[1] as string);
        opens++;
        open = FILE_OPEN.exec(line);
      }
    }
    const currentFile = stack[stack.length - 1] ?? null;

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
        file: currentFile,
        line: lineNumber,
        message,
        context,
        source: 'latex',
      });
    } else {
      // --- Warnings ---
      const warning = matchWarning(line, currentFile);
      if (warning) {
        warnings.push(warning);
      }
    }

    // Pop files closed on this line. Closes are capped at the number of opens
    // on this line (earlier ')' belong to TeX expressions, not file scopes), so
    // when this line opened nothing there's nothing to pop — and we skip the
    // per-line ')' scan on the vast majority of lines.
    if (opens > 0) {
      const closes = Math.min(countChar(line, ')'), opens);
      for (let p = 0; p < closes; p++) {
        stack.pop();
      }
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
  // Every pattern requires either "Warning" or an "…full \hbox/\vbox" fragment.
  // Bail before running ~10 regexes on the many lines that are neither — the
  // common case in a multi-thousand-line log.
  if (!line.includes('Warning') && !line.includes('full \\')) return null;

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

// Module-scoped so the patterns are compiled once, not on every call.
const RERUN_PATTERNS = [
  /Rerun to get cross-references right/,
  /Rerun to get outlines right/,
  /Label\(s\) may have changed\. Rerun/,
  /Package natbib Warning:.*rerun/i,
  /Package rerunfilecheck Warning:/i,
  /Package longtable Warning:.*rerun/i,
];

// Every rerun pattern contains "rerun" case-insensitively — one cheap scan
// rejects the common already-stable log before running all six patterns. Keep
// new patterns covered by this pre-filter (or widen it).
const RERUN_HINT = /rerun/i;

/** Check if the log signals that another LaTeX pass is needed */
export function needsRerun(log: string): boolean {
  if (!RERUN_HINT.test(log)) return false;
  return RERUN_PATTERNS.some((re) => re.test(log));
}
