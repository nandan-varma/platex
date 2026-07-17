import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { DocsPager } from '@/components/docs-pager';
import { CodeBlock } from '@/components/code-block';
import { H2, P, InlineCode } from '@/components/docs-typography';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const metadata: Metadata = { title: 'API Reference' };

const RESULT_TYPE = `interface CompileResult {
  pdf: Buffer | null        // null on fatal compile error
  errors: LatexError[]      // structured errors with file + line number
  warnings: LatexWarning[]  // overfull boxes, undefined refs, etc.
  logs: RawPassLog[]        // per-pass raw .log content for debugging
}

interface LatexError {
  type: 'error'
  file: string | null
  line: number | null
  message: string
  context: string | null    // surrounding lines from the TeX log
  source: 'latex' | 'bibtex' | 'biber'
}

interface LatexWarning {
  type: 'warning'
  code: 'overfull-hbox' | 'underfull-hbox' | 'undefined-reference'
      | 'undefined-citation' | 'multiply-defined-label'
      | 'font-warning' | 'package-warning' | 'other'
  file: string | null
  line: number | null
  message: string
}`;

export default function ApiReferencePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <PageHeader
        title="API Reference"
        description="The entire public surface is one function: compile(). Every rendering pattern in these docs calls it the same way."
      />

      <H2>compile(source, options?)</H2>
      <P>Returns a Promise resolving to a CompileResult.</P>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Option</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Default</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-mono text-xs">engine</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              &#39;pdflatex&#39; | &#39;xelatex&#39; | &#39;lualatex&#39;
            </TableCell>
            <TableCell className="font-mono text-xs">&#39;pdflatex&#39;</TableCell>
            <TableCell>Used when system TeX is available; Tectonic is always XeTeX-based.</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-mono text-xs">passes</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              &#39;auto&#39; | 1 | 2 | 3
            </TableCell>
            <TableCell className="font-mono text-xs">&#39;auto&#39;</TableCell>
            <TableCell>&#39;auto&#39; reruns until stable, same as Overleaf.</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-mono text-xs">bibliography</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              &#39;bibtex&#39; | &#39;biber&#39; | &#39;none&#39;
            </TableCell>
            <TableCell className="font-mono text-xs">&#39;bibtex&#39;</TableCell>
            <TableCell>Bibliography engine.</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-mono text-xs">files</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">Record&lt;string, Buffer&gt;</TableCell>
            <TableCell className="font-mono text-xs">{'{}'}</TableCell>
            <TableCell>Additional files: .bib, images, included .tex files.</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-mono text-xs">serviceUrl</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">string</TableCell>
            <TableCell className="font-mono text-xs">—</TableCell>
            <TableCell>URL of the platex service. If unset, compiles locally.</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-mono text-xs">timeout</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">number</TableCell>
            <TableCell className="font-mono text-xs">30000</TableCell>
            <TableCell>Timeout in milliseconds.</TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <H2>CompileResult</H2>
      <CodeBlock lang="typescript" code={RESULT_TYPE} />

      <H2>With additional files</H2>
      <P>
        <InlineCode>files</InlineCode> keys become filenames inside the compilation sandbox — use
        this for <InlineCode>.bib</InlineCode> files, images, or any <InlineCode>\\input</InlineCode>
        -ed sub-document.
      </P>
      <CodeBlock
        lang="typescript"
        code={`import { readFile } from 'fs/promises'
import { compile } from 'platex'

const bib = await readFile('refs.bib')
const logo = await readFile('logo.png')

const result = await compile(source, {
  bibliography: 'bibtex',
  files: {
    'refs.bib': bib,
    'figures/logo.png': logo,
  },
  serviceUrl: process.env.PLATEX_SERVICE_URL,
})`}
      />

      <DocsPager pathname="/docs/api-reference" />
    </div>
  );
}
