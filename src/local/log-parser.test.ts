import { describe, it, expect } from 'vitest';
import { parseLog, needsRerun, needsBibliography } from './log-parser.js';

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

describe('needsBibliography', () => {
  it('returns true when aux has \\citation and \\bibdata', () => {
    const aux = '\\citation{smith2023}\n\\bibdata{refs}\n';
    expect(needsBibliography(aux)).toBe(true);
  });

  it('returns false when aux has only \\citation', () => {
    const aux = '\\citation{smith2023}\n';
    expect(needsBibliography(aux)).toBe(false);
  });

  it('returns false for empty aux', () => {
    expect(needsBibliography('')).toBe(false);
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
});
