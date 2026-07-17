import type { Metadata } from 'next';
import { CodeBlock } from '@/components/code-block';
import { PageHeader } from '@/components/page-header';
import { DocsPager } from '@/components/docs-pager';
import { ViewDemoLink } from '@/components/pattern-cross-link';
import { CSR_SNIPPET } from '@/lib/snippets';

export const metadata: Metadata = { title: 'Client Components' };

export default function CSRDocsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <PageHeader
        tag="Client Component"
        title="Client-Side Rendering"
        description="A Client Component posts the source to POST /api/compile via fetch and renders whatever comes back — entirely client-driven, no page reload."
      >
        <ViewDemoLink href="/demo/csr" />
      </PageHeader>

      <CodeBlock code={CSR_SNIPPET} lang="tsx" />

      <DocsPager pathname="/docs/rendering/csr" />
    </div>
  );
}
