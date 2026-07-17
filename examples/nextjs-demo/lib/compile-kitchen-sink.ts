import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compile, type CompileResult } from '@nandan-varma/platex';

const DATA_DIR = join(process.cwd(), 'data');

export async function readKitchenSinkSource(): Promise<string> {
  return readFile(join(DATA_DIR, 'kitchen-sink.tex'), 'utf-8');
}

async function readAssets(): Promise<Record<string, Buffer>> {
  const [image, bib] = await Promise.all([
    readFile(join(DATA_DIR, 'demo-figure.png')),
    readFile(join(DATA_DIR, 'references.bib')),
  ]);
  return { 'demo-figure.png': image, 'references.bib': bib };
}

/**
 * Compiles the kitchen-sink document (or a caller-supplied override of its
 * source) with its bundled image/bibliography assets attached. Used by every
 * rendering target (SSR page, API route, Server Action) so they all exercise
 * the exact same compile() call with the exact same inputs.
 */
export async function compileKitchenSink(sourceOverride?: string): Promise<CompileResult> {
  const source = sourceOverride ?? (await readKitchenSinkSource());
  const files = await readAssets();

  return compile(source, {
    bibliography: 'bibtex',
    files,
    // If PLATEX_SERVICE_URL is set, this routes to a remote platex service
    // instead of compiling in-process — the same code path either way.
    serviceUrl: process.env['PLATEX_SERVICE_URL'],
  });
}

export function pdfToDataUri(pdf: Buffer | null): string | null {
  return pdf ? `data:application/pdf;base64,${pdf.toString('base64')}` : null;
}
