import type { Metadata } from 'next';
import { CodeBlock } from '@/components/code-block';
import { PageHeader } from '@/components/page-header';
import { DocsPager } from '@/components/docs-pager';
import { ViewDemoLink } from '@/components/pattern-cross-link';
import { SSR_SNIPPET } from '@/lib/snippets';

export const metadata: Metadata = { title: 'Server Components' };

export default function SSRDocsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <PageHeader
        tag="Server Component"
        title="Server-Side Rendering"
        description="A plain async Server Component. compile() runs on the server during the request that renders this page — the PDF is embedded directly in the HTML response as a base64 data URI. No client-side JavaScript is involved in producing it."
      >
        <ViewDemoLink href="/demo/ssr" />
      </PageHeader>

      <CodeBlock code={SSR_SNIPPET} lang="tsx" />

      <DocsPager pathname="/docs/rendering/ssr" />
    </div>
  );
}
