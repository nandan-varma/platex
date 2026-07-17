#!/usr/bin/env node
// Stand-in for bibtex used to test bibtex.ts / passes.ts orchestration via
// real process spawning. Reads main.aux in cwd:
//   contains "BIB_ERROR" -> writes an error to main.blg, exits 1
//   otherwise             -> writes a warning + main.bbl, exits 0
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.cwd();
const auxPath = join(cwd, 'main.aux');
const aux = existsSync(auxPath) ? readFileSync(auxPath, 'utf-8') : '';

if (aux.includes('BIB_ERROR')) {
  writeFileSync(
    join(cwd, 'main.blg'),
    'This is BibTeX, Version fake\nI found no database files--while reading file main.aux\n' +
      "---line 12 of file main.bib\nerror message--line 12 of file main.bib\n",
  );
  process.exit(1);
}

writeFileSync(
  join(cwd, 'main.blg'),
  'This is BibTeX, Version fake\nWarning--missing journal in smith2023\n',
);
writeFileSync(join(cwd, 'main.bbl'), '\\begin{thebibliography}{1}\n\\end{thebibliography}\n');
process.exit(0);
