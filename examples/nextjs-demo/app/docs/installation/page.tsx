import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { DocsPager } from '@/components/docs-pager';
import { CodeBlock } from '@/components/code-block';
import { H2, P, InlineCode } from '@/components/docs-typography';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const metadata: Metadata = { title: 'Installation' };

export default function InstallationPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <PageHeader
        title="Installation"
        description="platex is a two-part system: a compilation service that does the actual LaTeX → PDF work, and a thin client library your Next.js app calls."
      />

      <H2>1. Deploy the platex service</H2>
      <P>
        The service does the actual compilation and is a standalone Vercel project. It runs{' '}
        <InlineCode>build:vercel</InlineCode>, which downloads the bundled Tectonic binary for
        Vercel&#39;s Linux runtime and packs it into the serverless function.
      </P>
      <CodeBlock
        lang="bash"
        code={`git clone https://github.com/nandan-varma/platex
cd platex
npx vercel deploy`}
      />

      <H2>2. Install the client library</H2>
      <P>In your Next.js app:</P>
      <CodeBlock lang="bash" code="npm install platex" />

      <H2>3. Point the client at the service</H2>
      <P>
        Set <InlineCode>PLATEX_SERVICE_URL</InlineCode> in your Next.js project&#39;s environment
        (Vercel dashboard, or <InlineCode>.env.local</InlineCode> for local dev):
      </P>
      <CodeBlock lang="bash" code="PLATEX_SERVICE_URL=https://your-platex-service.vercel.app" />

      <H2>Engine selection</H2>
      <P>The library auto-selects an engine — you don&#39;t configure this directly.</P>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mode</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Engine</TableHead>
            <TableHead>Use case</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-medium">Remote</TableCell>
            <TableCell>
              <InlineCode>serviceUrl</InlineCode> is set
            </TableCell>
            <TableCell>Tectonic (on the service)</TableCell>
            <TableCell>Production on Vercel</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Local</TableCell>
            <TableCell>No serviceUrl, system TeX found</TableCell>
            <TableCell>pdflatex / xelatex / lualatex</TableCell>
            <TableCell>Self-hosted or dev with TeX Live</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">Local fallback</TableCell>
            <TableCell>No serviceUrl, no system TeX</TableCell>
            <TableCell>Bundled Tectonic binary</TableCell>
            <TableCell>Dev without TeX Live installed</TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <H2>Self-hosted (Docker, maximum accuracy)</H2>
      <P>
        If you&#39;re not on Vercel, the Docker image uses full TeX Live — the same engine Overleaf
        runs:
      </P>
      <CodeBlock
        lang="bash"
        code={`npm run build:server
docker build -f docker/Dockerfile -t platex .
docker run -p 3001:3001 platex`}
      />
      <P>
        Then set <InlineCode>PLATEX_SERVICE_URL=http://localhost:3001</InlineCode>.
      </P>

      <H2>Development without any TeX installed</H2>
      <P>
        Skip the service entirely and let the library use the bundled Tectonic binary directly —
        this is exactly what powers every live example in these docs:
      </P>
      <CodeBlock lang="bash" code="node scripts/download-tectonic.mjs" />

      <DocsPager pathname="/docs/installation" />
    </div>
  );
}
