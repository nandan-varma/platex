import { describe, expect, it } from 'vitest';
import { needsRerun, parseLog } from './log-parser.js';

const NESTED_FILE_ERROR_LOG = `
This is pdfTeX, Version 3.141592653-2.6-1.40.24 (TeX Live 2022)
(./main.tex
LaTeX2e <2022-11-01> patch level 1
(./chapter1.tex
! Undefined control sequence.
l.10 \\notacommand
                  {}
)
)
`;

const MULTIPLE_ERRORS_LOG = `
(./main.tex
! Undefined control sequence.
l.3 \\foo
! Missing $ inserted.
<inserted text>
                $
l.7 x = y
`;

const PACKAGE_WARNING_LOG = `
(./main.tex
Package hyperref Warning: Token not allowed in a PDF string on input line 4.
)
`;

const FONT_WARNING_LOG = `
(./main.tex
LaTeX Font Warning: Font shape \`OT1/cmr/m/n' undefined
)
`;

const MULTIPLY_DEFINED_LOG = `
(./main.tex
LaTeX Warning: Label \`sec:intro' multiply defined.
)
`;

const UNDEFINED_CITATION_LOG = `
(./main.tex
LaTeX Warning: Citation \`smith2023' on page 1 undefined on input line 9.
)
`;

const GENERIC_LATEX_WARNING_LOG = `
(./main.tex
LaTeX Warning: Something vague happened.
)
`;

const UNDERFULL_HBOX_LOG = `
(./main.tex
Underfull \\hbox (badness 10000) in paragraph at lines 30--31
)
`;

const VBOX_LOG = `
(./main.tex
Overfull \\vbox (3.0pt too high) detected at line 5
Underfull \\vbox (badness 10000) detected at line 6
)
`;

// Realistic TeX log snippets
const SIMPLE_ERROR_LOG = `
This is pdfTeX, Version 3.141592653-2.6-1.40.24 (TeX Live 2022)
(./main.tex
LaTeX2e <2022-11-01> patch level 1
! Undefined control sequence.
l.5 \\badcommand
               {}
No pages of output.
`;

const UNDEFINED_REF_LOG = `
This is pdfTeX, Version 3.141592653-2.6-1.40.24 (TeX Live 2022)
(./main.tex
LaTeX Warning: Reference \`fig:example' on page 1 undefined on input line 12.
)
`;

const OVERFULL_LOG = `
This is pdfTeX, Version 3.141592653-2.6-1.40.24 (TeX Live 2022)
(./main.tex
Overfull \\hbox (5.23pt too wide) in paragraph at lines 20--21
)
`;

const RERUN_LOG = `
(./main.tex
LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.
)
`;

const NO_RERUN_LOG = `
(./main.tex
LaTeX Warning: Reference \`foo' on page 1 undefined on input line 5.
)
`;

const MISSING_DOLLAR_LOG = `
(./main.tex
! Missing $ inserted.
<inserted text>
                $
l.8 x = y
           + z
)
`;

describe('parseLog - LaTeX errors', () => {
  it('detects undefined control sequence error', () => {
    const { errors } = parseLog(SIMPLE_ERROR_LOG);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('Undefined control sequence');
    expect(errors[0]?.line).toBe(5);
    expect(errors[0]?.source).toBe('latex');
  });

  it('extracts line number from l.<N> context', () => {
    const { errors } = parseLog(MISSING_DOLLAR_LOG);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe('Missing $ inserted.');
    expect(errors[0]?.line).toBe(8);
    expect(errors[0]?.context).toMatch(/^l\.8/);
  });
});

describe('parseLog - LaTeX warnings', () => {
  it('detects undefined reference warnings', () => {
    const { warnings } = parseLog(UNDEFINED_REF_LOG);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    const w = warnings.find((w) => w.code === 'undefined-reference');
    expect(w).toBeDefined();
    expect(w?.line).toBe(12);
  });

  it('detects overfull hbox warnings', () => {
    const { warnings } = parseLog(OVERFULL_LOG);
    const w = warnings.find((w) => w.code === 'overfull-hbox');
    expect(w).toBeDefined();
    expect(w?.line).toBe(20);
  });

  it('returns no errors for warning-only log', () => {
    const { errors } = parseLog(UNDEFINED_REF_LOG);
    expect(errors).toHaveLength(0);
  });

  it('does not treat a line that merely contains "Warning" as a warning', () => {
    // Passes the cheap pre-filter (contains "Warning") but matches none of the
    // structured warning patterns, so it must fall through to no match.
    const { warnings } = parseLog('(./main.tex\nThis paragraph mentions a Warning informally.\n)');
    expect(warnings).toHaveLength(0);
  });
});

describe('needsRerun', () => {
  it('returns true when rerun signal present', () => {
    expect(needsRerun(RERUN_LOG)).toBe(true);
  });

  it('returns false when no rerun signal', () => {
    expect(needsRerun(NO_RERUN_LOG)).toBe(false);
  });

  it('detects "Rerun to get cross-references right"', () => {
    expect(needsRerun('Rerun to get cross-references right')).toBe(true);
  });

  it('detects "Rerun to get outlines right" (hyperref)', () => {
    expect(needsRerun('Rerun to get outlines right')).toBe(true);
  });
});

describe('parseLog - bibtex', () => {
  const BIBTEX_LOG = `
This is BibTeX, Version 0.99d
Warning--missing journal in smith2023
I found no \\bibstyle command---while reading file main.aux
`;

  it('parses bibtex warnings', () => {
    const { warnings, errors } = parseLog(BIBTEX_LOG, 'bibtex');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0]?.message).toContain('missing journal');
    expect(errors).toHaveLength(0);
  });

  it('parses bibtex errors with file/line location', () => {
    const log = `This is BibTeX, Version 0.99d\nerror message--line 12 of file main.bib\n`;
    const { errors } = parseLog(log, 'bibtex');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(12);
    expect(errors[0]?.file).toBe('main.bib');
    expect(errors[0]?.source).toBe('bibtex');
  });

  it('parses a bibtex error with no parseable location as file:null, line:null', () => {
    const log = `This is BibTeX, Version 0.99d\nAborted: internal error, cannot continue\n`;
    const { errors } = parseLog(log, 'bibtex');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.file).toBeNull();
    expect(errors[0]?.line).toBeNull();
    expect(errors[0]?.source).toBe('bibtex');
  });
});

describe('parseLog - biber', () => {
  it('detects biber errors', () => {
    const log = `2023-01-01 ERROR - Cannot find 'refs.bib'!\n`;
    const { errors } = parseLog(log, 'biber');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('biber');
  });

  it('detects biber warnings', () => {
    const log = `2023-01-01 WARN - No citekeys found\n`;
    const { warnings } = parseLog(log, 'biber');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('other');
  });

  it('returns nothing for clean biber log', () => {
    const log = `2023-01-01 INFO - Reference section 0\n`;
    const { errors, warnings } = parseLog(log, 'biber');
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });
});

describe('parseLog - file tracking', () => {
  it('attributes an error to the innermost open file', () => {
    const { errors } = parseLog(NESTED_FILE_ERROR_LOG);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.file).toBe('./chapter1.tex');
  });

  it('attributes top-level errors to main.tex', () => {
    const { errors } = parseLog(MULTIPLE_ERRORS_LOG);
    expect(errors[0]?.file).toBe('./main.tex');
  });
});

describe('parseLog - multiple errors', () => {
  it('captures every error in a log with several failures', () => {
    const { errors } = parseLog(MULTIPLE_ERRORS_LOG);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toContain('Undefined control sequence');
    expect(errors[0]?.line).toBe(3);
    expect(errors[1]?.message).toBe('Missing $ inserted.');
    expect(errors[1]?.line).toBe(7);
  });
});

describe('parseLog - warning pattern coverage', () => {
  it('detects package warnings', () => {
    const { warnings } = parseLog(PACKAGE_WARNING_LOG);
    expect(warnings.some((w) => w.code === 'package-warning')).toBe(true);
  });

  it('detects font warnings', () => {
    const { warnings } = parseLog(FONT_WARNING_LOG);
    expect(warnings.some((w) => w.code === 'font-warning')).toBe(true);
  });

  it('detects multiply-defined label warnings', () => {
    const { warnings } = parseLog(MULTIPLY_DEFINED_LOG);
    expect(warnings.some((w) => w.code === 'multiply-defined-label')).toBe(true);
  });

  it('detects undefined citation warnings with line number', () => {
    const { warnings } = parseLog(UNDEFINED_CITATION_LOG);
    const w = warnings.find((w) => w.code === 'undefined-citation');
    expect(w).toBeDefined();
    expect(w?.line).toBe(9);
  });

  it('falls back to "other" for generic LaTeX warnings', () => {
    const { warnings } = parseLog(GENERIC_LATEX_WARNING_LOG);
    expect(warnings.some((w) => w.code === 'other')).toBe(true);
  });

  it('detects underfull hbox with line number', () => {
    const { warnings } = parseLog(UNDERFULL_HBOX_LOG);
    const w = warnings.find((w) => w.code === 'underfull-hbox');
    expect(w).toBeDefined();
    expect(w?.line).toBe(30);
  });

  it('detects overfull and underfull vbox warnings', () => {
    const { warnings } = parseLog(VBOX_LOG);
    expect(warnings.some((w) => w.code === 'overfull-vbox')).toBe(true);
    expect(warnings.some((w) => w.code === 'underfull-vbox')).toBe(true);
  });
});

describe('parseLog - line unwrapping', () => {
  it('rejoins a message split across the 79-column TeX wrap boundary', () => {
    const first = 'x'.repeat(79);
    const log = `! ${first}\nsecond part of the message\nl.5 foo`;
    const { errors } = parseLog(log);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe(`${first}second part of the message`);
  });

  it('chains rejoining across consecutive wrapped segments', () => {
    // '! ' + 77 chars = exactly 79, then a full 79-char segment, then the tail.
    const log = `! ${'y'.repeat(77)}\n${'x'.repeat(79)}\ntail\nl.5 foo`;
    const { errors } = parseLog(log);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe(`${'y'.repeat(77)}${'x'.repeat(79)}tail`);
  });

  it('does not rejoin a 79-char line followed by a blank line', () => {
    const log = `! ${'y'.repeat(77)}\n\nl.5 foo`;
    const { errors } = parseLog(log);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe('y'.repeat(77));
  });

  it('does not rejoin a 79-char line that ends the log', () => {
    const log = `! ${'y'.repeat(77)}`;
    const { errors } = parseLog(log);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe('y'.repeat(77));
  });
});

describe('needsRerun - additional patterns', () => {
  it('detects natbib rerun warning', () => {
    expect(needsRerun('Package natbib Warning: Citation(s) may have changed. Rerun')).toBe(true);
  });

  it('detects rerunfilecheck warning', () => {
    expect(needsRerun("Package rerunfilecheck Warning: File `main.out' has changed.")).toBe(true);
  });

  it('detects longtable rerun warning', () => {
    expect(needsRerun('Package longtable Warning: Table widths have changed. Rerun LaTeX.')).toBe(
      true,
    );
  });

  it('returns false for an empty log', () => {
    expect(needsRerun('')).toBe(false);
  });

  it('returns false when "rerun" appears without any recognized pattern', () => {
    // Passes the cheap pre-filter but matches none of the full patterns.
    expect(needsRerun('the user should rerun the build manually')).toBe(false);
  });
});

describe('parseLog - file tracking edge cases', () => {
  const FALSE_POSITIVE_LOG = `
(./main.tex
! Undefined control sequence.
l.10 \\notacommand
                   {}
)
`;

  const DEEP_NESTING_LOG = `
(./main.tex
(./chapter1.tex
(./section1.tex
! Error in section.
l.5 \\badcmd
)
)
)
`;

  const SAME_LINE_OPEN_CLOSE_LOG = `
(./main.tex
(./chapter1.tex (./inline.tex) some text here
! Error in chapter.
l.3 \\badcmd
)
`;

  it('does not treat l.N lines with ./ in the command as file opens', () => {
    const { errors } = parseLog(FALSE_POSITIVE_LOG);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.file).toBe('./main.tex');
  });

  it('tracks three levels of nested file opens correctly', () => {
    const { errors } = parseLog(DEEP_NESTING_LOG);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.file).toBe('./section1.tex');
  });

  it('handles files opened and closed on the same line', () => {
    const { errors } = parseLog(SAME_LINE_OPEN_CLOSE_LOG);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.file).toBe('./chapter1.tex');
  });

  it('attributes an error to main.tex when no files are open', () => {
    const log = `! Error at top level.\nl.3 \\badcmd\n`;
    const { errors } = parseLog(log);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.file).toBeNull();
  });

  it('normalizes CRLF line endings before parsing', () => {
    const crlf = NESTED_FILE_ERROR_LOG.replace(/\n/g, '\r\n');
    const { errors } = parseLog(crlf);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.file).toBe('./chapter1.tex');
  });
});
