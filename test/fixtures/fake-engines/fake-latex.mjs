#!/usr/bin/env node
// A stand-in for pdflatex/xelatex/lualatex used to test the orchestration
// logic in passes.ts and compiler.ts via real process spawning, without
// requiring a real TeX Live install.
//
// Reads main.tex in cwd for marker strings and reacts accordingly:
//   FATAL_ERROR      -> writes an error log, exits 1, no PDF produced
//   RERUN_ONCE       -> first invocation signals "rerun needed"; subsequent ones don't
//   HAS_CITATION     -> writes an aux file with \citation{}/\bibdata{} so bibtex triggers
//   NO_LOG_FILE      -> never writes main.log (forces stdout fallback)
//
// Tracks invocation count per tmpDir via a counter file, so multi-pass
// behavior (needsRerun) can be exercised for real.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.cwd();
const mainTexPath = join(cwd, 'main.tex');
const source = existsSync(mainTexPath) ? readFileSync(mainTexPath, 'utf-8') : '';

const counterPath = join(cwd, '.fakepass-count');
const prevCount = existsSync(counterPath) ? parseInt(readFileSync(counterPath, 'utf-8'), 10) : 0;
const count = prevCount + 1;
writeFileSync(counterPath, String(count));

if (source.includes('HAS_CITATION')) {
  writeFileSync(join(cwd, 'main.aux'), '\\citation{smith2023}\n\\bibdata{refs}\n\\bibstyle{plain}\n');
} else {
  writeFileSync(join(cwd, 'main.aux'), '');
}

if (source.includes('FATAL_ERROR')) {
  const log = [
    'This is pdfTeX, Version fake',
    '(./main.tex',
    '! Undefined control sequence.',
    'l.3 \\badcommand',
    '           {}',
    'No pages of output.',
  ].join('\n');
  if (!source.includes('NO_LOG_FILE')) {
    writeFileSync(join(cwd, 'main.log'), log);
  } else {
    process.stdout.write(log);
  }
  process.exit(1);
}

const needsRerunNow = (source.includes('RERUN_ONCE') && count === 1) || source.includes('ALWAYS_RERUN');
const logLines = ['This is pdfTeX, Version fake', '(./main.tex'];
if (source.includes('SOFT_ERROR_TWICE')) {
  // Non-fatal: reported (exit 0) on every pass, with identical message/line,
  // to exercise passes.ts's cross-pass error deduplication.
  logLines.push('! Some problem.');
  logLines.push('l.5 x');
}
if (needsRerunNow) {
  logLines.push('LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.');
}
logLines.push(')');
const log = logLines.join('\n');

if (!source.includes('NO_LOG_FILE')) {
  writeFileSync(join(cwd, 'main.log'), log);
} else {
  process.stdout.write(log);
}

writeFileSync(join(cwd, 'main.pdf'), `%PDF-1.4 fake pass ${count}\n%%EOF`);
process.exit(0);
